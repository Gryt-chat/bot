import type { Permission } from "./types.ts";

/**
 * What a Gryt server knew about before it published a catalogue of its own.
 *
 * Servers send the caller's permissions and, since the release that added the
 * fuller set, a list of every permission that build has heard of. Without that
 * list an absence is ambiguous — it could be a refusal, or a permission the
 * server predates — and reading the second as a refusal means an SDK that knows
 * about `read_messages` refusing to read on every server not yet upgraded.
 *
 * So against a server too old to publish one, this stands in for it. Frozen: it
 * describes a release that has already happened, and it never grows.
 */
export const PERMISSIONS_BEFORE_CATALOGUE: readonly Permission[] = [
  "send_messages",
  "attach_files",
  "add_reactions",
  "join_voice",
  "speak",
  "share_video",
  "share_screen",
  "change_nickname",
  "change_avatar",
  "create_invite",
  "manage_invites",
  "manage_messages",
  "kick_members",
  "ban_members",
  "mute_members",
  "manage_reports",
  "manage_join_requests",
  "manage_channels",
  "manage_emojis",
  "manage_webhooks",
  "manage_roles",
  "manage_server",
  "view_audit_log",
];
