// Scene rules: what exists in a given app's screen. Pure data — every panel, paste parser and the cast row asks this table,
// nobody checks "is this WeChat" on their own.
//
// Adding a scene:
// 1. add it to TEMPLATES in types.ts (the string is stored in files; never rename),
// 2. fill its platform / name in templates.ts and its rules below,
// 3. write its skin in src/scene/skins/<app>.tsx and register it in skins/index.ts,
// 4. give it an example in examples.ts.

import { platformOf } from './templates'
import type { Arrangement, Entry, Kind, Project, Template } from './types'

export type Form = 'chat' | 'comments' | 'feed'

export type Trait =
  // one entry
  | 'quote' | 'thread' | 'replyTarget' | 'likes' | 'commentTime' | 'reaction' | 'pinned' | 'authorLiked'
  | 'moreReplies' | 'failed' | 'receipt' | 'edited' | 'messageTime'
  // people
  | 'level' | 'verified' | 'author' | 'groupNames' | 'avatarPat' | 'contactTitle' | 'statusLine'
  // the screen
  | 'groupCount' | 'backBadge' | 'commentCount' | 'viewerAvatar' | 'typingTitle' | 'typingBubble' | 'wallpaper'
  | 'encryptionNotice' | 'sms' | 'likers' | 'lead' | 'stickers' | 'saved' | 'reactions' | 'roles' | 'assistant'

export interface Rules {
  form: Form
  kinds: ReadonlySet<Kind>
  traits: ReadonlySet<Trait>
}

const R = (form: Form, kinds: Kind[], traits: Trait[]): Rules => ({ form, kinds: new Set(kinds), traits: new Set(traits) })

const wechatKinds: Kind[] = ['text', 'image', 'voice', 'time', 'system', 'recall', 'pat', 'sticker', 'link', 'file', 'location', 'card', 'call']
const imessageKinds: Kind[] = ['text', 'image', 'sticker', 'voice', 'link', 'file', 'location', 'card', 'recall', 'time', 'system']
const whatsappKinds: Kind[] = ['text', 'image', 'sticker', 'voice', 'call', 'link', 'file', 'location', 'card', 'recall', 'time', 'system']
const telegramKinds: Kind[] = ['text', 'image', 'sticker', 'voice', 'call', 'link', 'file', 'location', 'card', 'time', 'system']
const snapchatKinds: Kind[] = ['text', 'image', 'sticker', 'snap', 'voice', 'call', 'link', 'recall', 'screenshot', 'time', 'system']
const instagramChatKinds: Kind[] = ['text', 'image', 'voice', 'time', 'system', 'recall', 'sticker', 'link', 'call']

const RULES: Record<Template, Rules> = {
  wechatGroup: R('chat', wechatKinds, ['quote', 'groupNames', 'avatarPat', 'failed', 'wallpaper', 'groupCount', 'backBadge']),
  wechatDirect: R('chat', wechatKinds, ['quote', 'avatarPat', 'failed', 'wallpaper', 'contactTitle', 'backBadge', 'typingTitle']),
  instagramDirect: R('chat', instagramChatKinds, ['quote', 'reaction', 'verified', 'wallpaper', 'contactTitle', 'typingBubble']),
  instagramGroup: R('chat', instagramChatKinds, ['quote', 'reaction', 'verified', 'wallpaper', 'groupNames']),
  bilibili: R('comments', ['text', 'image'], ['thread', 'replyTarget', 'likes', 'commentTime', 'pinned', 'authorLiked', 'moreReplies', 'level', 'author', 'commentCount']),
  instagramComments: R('comments', ['text', 'image'], ['thread', 'replyTarget', 'likes', 'commentTime', 'pinned', 'moreReplies', 'verified', 'viewerAvatar']),
  imessageDirect: R('chat', imessageKinds, ['quote', 'reaction', 'failed', 'receipt', 'edited', 'wallpaper', 'sms', 'contactTitle', 'backBadge', 'typingBubble']),
  imessageGroup: R('chat', imessageKinds, ['quote', 'reaction', 'failed', 'receipt', 'edited', 'wallpaper', 'sms', 'groupNames', 'backBadge']),
  whatsappDirect: R('chat', whatsappKinds, ['quote', 'reaction', 'failed', 'receipt', 'edited', 'messageTime', 'statusLine', 'wallpaper', 'encryptionNotice', 'contactTitle', 'backBadge', 'typingTitle']),
  whatsappGroup: R('chat', whatsappKinds, ['quote', 'reaction', 'failed', 'receipt', 'edited', 'messageTime', 'statusLine', 'wallpaper', 'encryptionNotice', 'groupNames', 'backBadge']),
  telegramDirect: R('chat', telegramKinds, ['quote', 'reaction', 'failed', 'receipt', 'edited', 'messageTime', 'statusLine', 'wallpaper', 'contactTitle', 'backBadge', 'typingTitle']),
  telegramGroup: R('chat', telegramKinds, ['quote', 'reaction', 'failed', 'receipt', 'edited', 'messageTime', 'statusLine', 'wallpaper', 'groupNames', 'backBadge']),
  youtube: R('comments', ['text'], ['thread', 'replyTarget', 'likes', 'commentTime', 'pinned', 'authorLiked', 'moreReplies', 'verified', 'author', 'commentCount', 'viewerAvatar']),
  douyin: R('comments', ['text', 'image'], ['thread', 'replyTarget', 'likes', 'commentTime', 'authorLiked', 'moreReplies', 'author', 'commentCount', 'stickers']),
  tiktok: R('comments', ['text', 'image'], ['thread', 'replyTarget', 'likes', 'commentTime', 'pinned', 'authorLiked', 'moreReplies', 'verified', 'author', 'commentCount', 'stickers']),
  xiaohongshu: R('comments', ['text', 'image', 'voice'], ['thread', 'replyTarget', 'likes', 'commentTime', 'pinned', 'moreReplies', 'author', 'commentCount', 'lead']),
  snapchatDirect: R('chat', snapchatKinds, ['receipt', 'saved', 'contactTitle', 'typingBubble']),
  snapchatGroup: R('chat', snapchatKinds, ['receipt', 'saved', 'groupNames']),
  discord: R('chat', ['text', 'image', 'sticker', 'voice', 'link', 'file', 'time', 'system'], ['quote', 'reactions', 'edited', 'messageTime', 'groupNames', 'roles', 'typingBubble']),
  chatgpt: R('chat', ['text', 'image', 'file'], ['assistant']),
  deepseek: R('chat', ['text', 'image', 'file'], ['assistant']),
  gemini: R('chat', ['text', 'image', 'file'], ['assistant', 'viewerAvatar']),
  wechatMoments: R('feed', ['text', 'image'], ['thread', 'replyTarget', 'commentTime', 'likers', 'lead']),
}

export const rulesOf = (t: Template): Rules => RULES[t]

export const has = (r: Rules, trait: Trait) => r.traits.has(trait)
export const isChat = (r: Rules) => r.form === 'chat'
/** Chats always have a "me"; comment sections don't — everyone is an equal commenter. */
export const hasSelf = (r: Rules) => r.form !== 'comments'
/** After Return: chats keep the same sender; comments and feeds default to "someone new". */
export const freshSender = (r: Rules) => r.form !== 'chat'
export const isAssistant = (r: Rules) => r.traits.has('assistant')
export const oneOnOne = (r: Rules) => r.traits.has('contactTitle')

export function allows(r: Rules, kind: Kind): boolean {
  // Notifications dropping from the top exist in every chat scene.
  if (kind === 'notification') return r.form === 'chat'
  return r.kinds.has(kind)
}

export const isEncryptionNotice = (e: Entry) => e.kind === 'system' && e.text.startsWith('🔒')

export function shows(r: Rules, e: Entry): boolean {
  if (!allows(r, e.kind)) return false
  if (isEncryptionNotice(e)) return r.traits.has('encryptionNotice')
  return true
}

export function arrangements(r: Rules): Arrangement[] {
  if (isChat(r)) return ['page']
  return r.traits.has('stickers') ? ['page', 'cards', 'stickers'] : ['page', 'cards']
}

const INSERT_ORDER: Kind[] = ['text', 'image', 'sticker', 'snap', 'voice', 'call', 'link', 'file', 'location', 'card',
  'pat', 'recall', 'screenshot', 'notification', 'time', 'system']
export const insertable = (r: Rules) => INSERT_ORDER.filter(k => allows(r, k))

export const isNoticeKind = (k: Kind) => k === 'time' || k === 'recall' || k === 'pat' || k === 'system' || k === 'screenshot'
export const holdsImage = (k: Kind) => k === 'image' || k === 'sticker' || k === 'link' || k === 'location' || k === 'notification'

// MARK: content as seen in a scene

export const projectRules = (p: Project) => RULES[p.template]

export function showsMomentsProfile(p: Project) {
  return RULES[p.template].traits.has('likers') && p.momentsProfile === true
}

/** Entries this scene can draw. Others stay in the data, just undrawn. */
export function visibleEntries(p: Project): Entry[] {
  const r = RULES[p.template]
  const postsOnly = showsMomentsProfile(p)
  return p.entries.filter(e => shows(r, e) && !(postsOnly && e.isReply))
}

export const hiddenCount = (p: Project) => p.entries.length - visibleEntries(p).length

export function layoutOf(p: Project): Arrangement {
  const wanted = p.arrangement ?? 'page'
  return arrangements(RULES[p.template]).includes(wanted) ? wanted : 'page'
}

/** "Me" only counts in scenes that have one. */
export const viewerOf = (p: Project) => (hasSelf(RULES[p.template]) ? p.selfID : undefined)

export function personOf(p: Project, e: Entry) {
  return p.people.find(x => x.id === e.personID) ?? { id: e.personID, name: '访客', color: 0, level: '' }
}

/** The other person in a private chat: whoever spoke first, else the first non-me. */
export function contactOf(p: Project) {
  const others = p.people.filter(x => x.id !== p.selfID)
  const speaking = new Set(p.entries.filter(e => !isNoticeKind(e.kind)).map(e => e.personID))
  return others.find(x => speaking.has(x.id)) ?? others[0]
}

export const othersCount = (p: Project) => p.people.filter(x => x.id !== p.selfID).length

export function canSwitch(p: Project, target: Template) {
  return !oneOnOne(RULES[target]) || othersCount(p) <= 1
}

/** The cast row at the bottom. In comments a "me" who never commented doesn't show. */
export function castOf(p: Project) {
  const r = RULES[p.template]
  const me = p.selfID
  if (hasSelf(r) || !me || visibleEntries(p).some(e => e.personID === me)) return p.people
  return p.people.filter(x => x.id !== me)
}

/** Cards layout: each top-level comment with its replies. Chats have no threads, every entry is its own card. */
export function threadsOf(p: Project, list = visibleEntries(p)): Entry[][] {
  const threaded = RULES[p.template].traits.has('thread')
  const out: Entry[][] = []
  for (const e of list) {
    if (threaded && e.isReply && out.length) out[out.length - 1].push(e)
    else out.push([e])
  }
  return out
}

export function threadRoot(p: Project, id: string, list = visibleEntries(p)): Entry | undefined {
  const thread = threadsOf(p, list).find(t => t.some(e => e.id === id))
  return thread && !thread[0].isReply ? thread[0] : undefined
}

export function endsThread(p: Project, id: string, list = visibleEntries(p)): boolean {
  const thread = threadsOf(p, list).find(t => t.some(e => e.id === id))
  return thread?.[thread.length - 1].id === id
}

/** Reorder only the visible entries; hidden ones travel with the entry before them. */
export function reorderVisible(p: Project, ids: string[]) {
  const r = RULES[p.template]
  const followers = new Map<string, Entry[]>()
  const leading: Entry[] = []
  const byID = new Map<string, Entry>()
  let current: string | undefined
  for (const e of p.entries) {
    if (shows(r, e)) { current = e.id; byID.set(e.id, e) }
    else if (current) followers.set(current, [...(followers.get(current) ?? []), e])
    else leading.push(e)
  }
  const visible = ids.map(id => byID.get(id)).filter((e): e is Entry => !!e)
  if (visible.length !== byID.size || new Set(ids).size !== ids.length) return
  p.entries = [...leading, ...visible.flatMap(e => [e, ...(followers.get(e.id) ?? [])])]
}

export const platformOfProject = (p: Project) => platformOf(p.template)
