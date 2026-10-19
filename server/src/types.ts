export type UserRole = 'admin' | 'member';
export type UserStatus = 'online' | 'away' | 'offline';

export interface User {
  id: string;
  username: string;
  avatarColor: string;
  role: UserRole;
  status: UserStatus;
  lastSeen: string;
  bannedUntil: string | null;
  banReason: string | null;
  passwordHash?: string;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  readAccess: AccessLevel;
  writeAccess: AccessLevel;
}

export type AccessLevel = 'everyone' | 'admin';
export type ChannelAccessSetting = 'inherit' | AccessLevel;

export interface Channel {
  id: string;
  name: string;
  topic: string;
  description: string;
  position: number;
  categoryId: string | null;
  readAccess: ChannelAccessSetting;
  writeAccess: ChannelAccessSetting;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  createdAt: string;
  attachments: Attachment[];
  linkPreviews: LinkPreview[];
  deleted?: boolean;
}

export interface Attachment {
  id: string;
  type: 'image' | 'video';
  url: string;
  filename: string;
  width?: number;
  height?: number;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  kind?: 'message';
  messageId?: string;
  channelId?: string;
  createdAt?: string;
}

export interface ServerOwner {
  id: string;
  username: string;
}

export interface ServerInfo {
  name: string;
  description: string;
  onboarded: boolean;
  createdAt: string | null;
  owner: ServerOwner | null;
  loginDisabled: boolean;
  loginNotice: string;
  uncategorizedReadAccess: AccessLevel;
  uncategorizedWriteAccess: AccessLevel;
}

export interface ServerStats {
  server: ServerInfo;
  channelCount: number;
  memberCount: number;
  messageCount: number;
  serverStartedAt: string;
  uptimeMs: number;
  membersOnline: number;
  topYapper: { username: string; messageCount: number } | null;
  mostPopularChannel: { name: string; messageCount: number } | null;
  peakHour: { hour: number; messageCount: number } | null;
  topWord: { word: string; count: number } | null;
  mainCharacter: { username: string; mentionCount: number } | null;
  pingAbuser: { username: string; mentionCount: number } | null;
  novelAuthor: { username: string; charCount: number } | null;
  speedReplyDemon: { username: string; avgMs: number; replyCount: number } | null;
}

export type PanelView = 'info' | 'media' | 'members' | 'search' | 'admin';

export interface WsMessage {
  type: string;
  payload?: unknown;
}