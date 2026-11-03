import { createInterface } from "node:readline";

/** The spec version this was written against. A client asking for another gets this one. */
const PROTOCOL_VERSION = "2025-06-18";

export interface Tool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Clients that honour it can allowlist the read tools and ask before the rest. */
  readOnly: boolean;
  run(args: Record<string, unknown>): Promise<string>;
}

interface Request {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface ServerMeta {
  name: string;
  version: string;
  instructions: string;
}

/** One JSON-RPC message in, at most one out. Null for a notification, which gets no answer. */
export async function handle(raw: string, tools: Tool[], meta: ServerMeta): Promise<object | null> {
  let req: Request;
  try {
    req = JSON.parse(raw) as Request;
  } catch {
    return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
  }
  if (req.id === undefined || req.id === null) return null;
  const ok = (result: object) => ({ jsonrpc: "2.0", id: req.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: req.id, error: { code, message } });

  switch (req.method) {
    case "initialize":
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: meta.name, version: meta.version },
        instructions: meta.instructions,
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: t.readOnly, destructiveHint: !t.readOnly && t.name.startsWith("delete") },
        })),
      });
    case "tools/call": {
      const name = req.params?.name;
      const tool = tools.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${String(name)}`);
      try {
        const text = await tool.run((req.params?.arguments as Record<string, unknown>) ?? {});
        return ok({ content: [{ type: "text", text }] });
      } catch (err) {
        // A tool failing is an answer the model should read, not a protocol error.
        return ok({ content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${req.method}`);
  }
}

/** Newline-delimited JSON on stdin and stdout. Anything else on stdout breaks the client. */
export function serveStdio(tools: Tool[], meta: ServerMeta): void {
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    void handle(line, tools, meta).then((out) => {
      if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
    });
  });
  lines.on("close", () => process.exit(0));
}
