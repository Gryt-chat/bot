import type { Permission } from "./types.ts";

/**
 * Stands in for the catalogue on a server too old to publish one, so an absent
 * permission is not read as a refusal.
 *
 * **Frozen.** It describes a release that has already happened, and never grows.
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
