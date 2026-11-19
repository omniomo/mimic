// Content layer: who said what, to whom, how many likes. Knows nothing about any app.
// It is the union of every scene; a scene only decides what is visible, how it looks and how it can be edited.
// String values are stored in project files — once shipped, never rename them.

export const TEMPLATES = [
  'imessageDirect', 'imessageGroup', 'whatsappDirect', 'whatsappGroup', 'telegramDirect', 'telegramGroup',
  'snapchatDirect', 'snapchatGroup',
  'instagramDirect', 'instagramGroup', 'instagramComments', 'youtube', 'tiktok', 'discord',
  'chatgpt', 'gemini', 'deepseek',
  'wechatGroup', 'wechatDirect', 'wechatMoments', 'bilibili', 'douyin', 'xiaohongshu',
] as const
export type Template = (typeof TEMPLATES)[number]

export type Platform =
  | 'wechat' | 'instagram' | 'bilibili' | 'imessage' | 'whatsapp' | 'telegram' | 'youtube' | 'tiktok'
  | 'douyin' | 'xiaohongshu' | 'snapchat' | 'discord' | 'chatgpt' | 'gemini' | 'deepseek'

/** Language of the text drawn inside the phone (not the editor UI). */
export type Lang = 'chinese' | 'english'

export const KINDS = [
  'text', 'time', 'image', 'voice', 'recall', 'pat', 'system',
  'sticker', 'link', 'file', 'location', 'card', 'call', 'snap', 'screenshot', 'notification',
] as const
export type Kind = (typeof KINDS)[number]

export type Receipt = 'pending' | 'sent' | 'delivered' | 'read'
export type Arrangement = 'page' | 'cards' | 'stickers'
export type Audience = 'partial' | 'onlyMe'
export type Feedback = 'up' | 'down'

/** An image is stored once in IndexedDB and referenced by id everywhere else. */
export type ImageRef = string

export interface Person {
  id: string
  name: string
  avatar?: ImageRef
  /** Which default critter avatar (index into CRITTERS). */
  color: number
  /** Bilibili LV. */
  level: string
  verified?: boolean
  /** Discord role colour index. */
  roleColor?: number
  isBot?: boolean
}

export interface Thinking {
  seconds: number
  text?: string
  open?: boolean
}

export interface ReactionCount {
  emoji: string
  count: number
  mine?: boolean
}

export interface Entry {
  id: string
  personID: string
  kind: Kind
  text: string
  image?: ImageRef
  metadata: string
  likes: string
  quote: string
  isReply: boolean
  isLiked: boolean
  seconds?: number
  unread?: boolean
  /** Who this is aimed at: who got nudged, who a reply answers, whose contact card. */
  target?: string
  pinned?: boolean
  authorLiked?: boolean
  replies?: string
  /** Time rows: the real moment (epoch ms). */
  date?: number
  detail?: string
  source?: string
  video?: boolean
  failed?: boolean
  reaction?: string
  receipt?: Receipt
  edited?: boolean
  likers?: string[]
  gallery?: ImageRef[]
  audience?: Audience
  saved?: boolean
  reactions?: ReactionCount[]
  thinking?: Thinking
  sources?: string[]
  feedback?: Feedback
  version?: string
}

export interface Project {
  schemaVersion: number
  template: Template
  title: string
  language: Lang
  dark: boolean
  showStatusBar: boolean
  showComposer: boolean
  statusTime: string
  groupCount: string
  people: Person[]
  selfID?: string
  entries: Entry[]
  battery?: number
  backBadge?: string
  arrangement?: Arrangement
  authorID?: string
  viewerAvatar?: ImageRef
  commentCount?: string
  /** The day the screenshot is "taken" (epoch ms, start of day). Fixed the first time a time is used. */
  today?: number
  clock12?: boolean
  wallpaper?: ImageRef
  keyboard?: boolean
  composerText?: string
  status?: string
  sms?: boolean
  cover?: ImageRef
  noteTitle?: string
  noteText?: string
  noteMeta?: string
  noteLikes?: string
  noteSaves?: string
  following?: boolean
  hideLead?: boolean
  noteImages?: ImageRef[]
  notePage?: number
  momentsAlert?: string
  momentsProfile?: boolean
}

export const ITEM_LIMIT = 150
export const TEXT_LIMIT = 6000
export const REPLY_LIMIT = 20000
export const SCHEMA_VERSION = 1

export function uid(): string {
  return crypto.randomUUID().toUpperCase()
}

export function makeEntry(personID: string, init: Partial<Entry> = {}): Entry {
  return {
    id: uid(), personID, kind: 'text', text: '', metadata: '', likes: '', quote: '',
    isReply: false, isLiked: false, ...init,
  }
}

export function makePerson(name: string, color: number, init: Partial<Person> = {}): Person {
  return { id: uid(), name, color, level: '', ...init }
}
