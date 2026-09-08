/**
 * The shapes a bot sees, deliberately narrower than what the server sends. A field this file
 * does not name is one the server never promised to keep — see `GrytBot.socket`.
 */

/** A permission id. The server owns the list; see `GrytBot.permissions`. */
export type Permission = string;

export interface Attachment {
  file_id: string;
  mime: string | null;
  size: number | null;
  original_name: string | null;
  width: number | null;
  height: number | null;
  has_thumbnail: boolean;
}

export interface Message {
  conversationId: string;
  messageId: string;
  senderServerUserId: string;
  senderNickname: string | null;
  text: string | null;
  attachments: Attachment[];
  createdAt: Date;
  editedAt: Date | null;
  replyToMessageId: string | null;
  /** True for the "X joined the server" kind of message, which has no sender. */
  isSystem: boolean;
  /** True when this bot sent it. Handlers are not called for these. */
  isOwn: boolean;
}

export interface Member {
  serverUserId: string;
  nickname: string;
  role: string;
  status: "online" | "in_voice" | "afk" | "offline";
  avatarFileId: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
}

export interface ServerInfo {
  serverId: string;
  name: string;
  description: string;
  /** What this bot may do here. Empty until the server has said. */
  permissions: Permission[];
  /** The role this bot holds. */
  role: string;
}

/**
 * Why the server refused something. The machine-readable half is `error`; `code` is accepted
 * too, because this SDK reached for that name first and the mistake read as a crash.
 */
export interface ServerRefusal {
  error?: string;
  code?: string;
  message?: string;
  /** Named when the refusal was a permission. */
  permission?: string;
}
