/**
 * The shapes a bot sees.
 *
 * Deliberately narrower than what the server sends. A bot that reaches for a
 * field this file does not name is reaching for something the server has never
 * promised to keep, and the socket is right there if you need it — see
 * `GrytBot.socket`.
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

/** Why a join was refused, when the server bothered to say. */
export interface JoinRefusal {
  code: string;
  message: string;
}
