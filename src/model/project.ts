// Operations on the content. Pure functions over a mutable draft (the store clones before calling them).

import {
  allows, contactOf, has, hasSelf, isAssistant, isChat, isNoticeKind, projectRules, rulesOf, viewerOf, visibleEntries,
} from './rules'
import { defaultLanguage, guestName, isSampleTitle, platformOf, sampleTitle } from './templates'
import { readTime } from './time'
import type { Entry, Kind, Lang, Person, Project, Receipt, Template } from './types'
import { ITEM_LIMIT, REPLY_LIMIT, SCHEMA_VERSION, TEXT_LIMIT, makeEntry, makePerson, uid } from './types'

export const zhen = (lang: Lang, zh: string, en: string) => (lang === 'chinese' ? zh : en)

// MARK: critters — the 30 default avatars. Order is stored in files: only ever append.

export const CRITTERS = [
  'cat', 'dog', 'fox', 'rabbit', 'penguin', 'owl', 'robin', 'bluejay', 'greattit', 'kingfisher',
  'pig', 'sheep', 'cow', 'horse', 'duck', 'goose', 'frog', 'elephant', 'seal', 'turtle', 'fish',
  'tit', 'calico', 'poodle', 'hamster', 'budgie', 'fluffycat', 'chihuahua', 'guineapig', 'chick',
] as const

export const critterIndex = (color: number) => ((color % CRITTERS.length) + CRITTERS.length) % CRITTERS.length
export const critterURL = (color: number) => `${import.meta.env.BASE_URL}avatars/${CRITTERS[critterIndex(color)]}.jpg`

export function freshCritter(used: number[]): number {
  const taken = new Set(used.map(critterIndex))
  const free = CRITTERS.map((_, i) => i).filter(i => !taken.has(i))
  const pool = free.length ? free : CRITTERS.map((_, i) => i)
  return pool[Math.floor(Math.random() * pool.length)]
}

export function critterPair(): [number, number] {
  const a = freshCritter([])
  return [a, freshCritter([a])]
}

// MARK: people

export function addPerson(p: Project, name: string): string {
  const person = makePerson(name, freshCritter(p.people.map(x => x.color)))
  p.people.push(person)
  return person.id
}

export function findPerson(p: Project, name: string): Person | undefined {
  const lower = name.toLowerCase()
  return p.people.find(x => x.name.toLowerCase() === lower)
}

export function deletePerson(p: Project, id: string) {
  const substitute = p.people.find(x => x.id !== id)
  if (p.people.length <= 1 || !substitute) return
  p.people = p.people.filter(x => x.id !== id)
  for (const e of p.entries) {
    if (e.personID === id) e.personID = substitute.id
    if (e.target === id) e.target = undefined
    if (e.likers) e.likers = e.likers.filter(x => x !== id)
  }
  if (p.selfID === id) p.selfID = undefined
  if (p.authorID === id) p.authorID = undefined
}

export function rename(p: Project, personID: string, value: string) {
  const person = p.people.find(x => x.id === personID)
  if (!person) return
  const old = person.name
  person.name = value.slice(0, 35)
  if (has(projectRules(p), 'contactTitle') && p.title === old) p.title = person.name
}

// MARK: titles

export function groupTitle(p: Project) {
  if (!has(projectRules(p), 'groupCount')) return p.title
  const speakers = new Set(visibleEntries(p).filter(e => !isNoticeKind(e.kind)).map(e => e.personID))
  const count = p.groupCount || String(Math.max(speakers.size, 1))
  return `${p.title}(${count})`
}

/** Editing the title on screen: in WeChat groups a trailing "(23)" is the member count. */
export function applyTitle(p: Project, raw: string) {
  const value = raw.trim()
  if (!has(projectRules(p), 'groupCount')) { p.title = value; return }
  const m = /^(.*?)[(（](\d+)[)）]$/.exec(value)
  if (m) { p.title = m[1].trim(); p.groupCount = m[2]; return }
  p.title = value
  p.groupCount = ''
}

export function assistantID(p: Project) {
  return p.people.find(x => x.id !== p.selfID)?.id
}

export function assistantSpeaker(p: Project, mine: boolean): string {
  if (mine) {
    if (p.selfID && p.people.some(x => x.id === p.selfID)) return p.selfID
    const me = makePerson(zhen(p.language, '我', 'Me'), freshCritter(p.people.map(x => x.color)))
    p.people.push(me)
    p.selfID = me.id
    return me.id
  }
  return assistantID(p) ?? addPerson(p, 'AI')
}

export function assistantTitle(p: Project) {
  if (p.title) return p.title
  const first = visibleEntries(p).find(e => e.personID === p.selfID && e.kind === 'text')
  if (!first) return ''
  const line = first.text.split('\n')[0] ?? ''
  if (p.language === 'chinese' || /[⺀-￿]/.test(line)) {
    const cut = [...line].slice(0, 10).join('')
    return cut.length < line.length ? `${cut}…` : cut
  }
  return line.split(' ').slice(0, 4).join(' ').replace(/[.,!?;:]+$/, '')
}

export const assistantPartner = (p: Project, person: string) => (person === p.selfID ? assistantID(p) : p.selfID)

// MARK: switching scenes

export function switchTemplate(p: Project, next: Template) {
  const wasOneOnOne = has(rulesOf(p.template), 'contactTitle')
  if (isSampleTitle(p.template, p.title) || !p.title) p.title = sampleTitle(next)
  p.template = next
  const r = rulesOf(next)
  if (has(r, 'contactTitle') && !wasOneOnOne) {
    const c = contactOf(p)
    if (c) p.title = c.name
  }
  if (!p.entries.length) p.language = defaultLanguage(platformOf(next))
  if (hasSelf(r) && !p.selfID) {
    const me = makePerson(zhen(p.language, '我', 'Me'), freshCritter(p.people.map(x => x.color)))
    p.people.push(me)
    p.selfID = me.id
  }
}

// MARK: new projects

function base(template: Template, people: Person[], selfID?: string): Project {
  return {
    schemaVersion: SCHEMA_VERSION, template, title: sampleTitle(template), language: defaultLanguage(platformOf(template)),
    dark: false, showStatusBar: true, showComposer: true, statusTime: '9:41', groupCount: '',
    people, selfID, entries: [],
  }
}

/** Chats: me + one other. Comments: nobody until the first comment is written. */
export function blankProject(template: Template): Project {
  const lang = defaultLanguage(platformOf(template))
  const r = rulesOf(template)
  if (template === 'xiaohongshu') {
    const author = makePerson(guestName(template), freshCritter([]))
    const p = base(template, [author])
    p.authorID = author.id
    return p
  }
  if (!hasSelf(r)) return base(template, [])
  const [mine, theirs] = critterPair()
  if (isAssistant(r)) {
    const me = makePerson(zhen(lang, '我', 'Me'), mine)
    const ai = makePerson('AI', theirs)
    const p = base(template, [ai, me], me.id)
    p.title = ''
    return p
  }
  if (template === 'wechatMoments') {
    const me = makePerson('不要葱谢谢', mine)
    const friend = makePerson('梨先不削', theirs)
    const p = base(template, [me, friend], me.id)
    p.showComposer = false
    return p
  }
  const me = makePerson(zhen(lang, '我', 'Me'), mine)
  const guest = makePerson(guestName(template), theirs)
  const p = base(template, [guest, me], me.id)
  if (template === 'discord') p.dark = true
  return p
}

// MARK: notices

export function noticeText(p: Project, e: Entry): string {
  const en = p.language === 'english'
  const q = (name: string) => (en ? name : `"${name}"`)
  const pl = platformOf(p.template)
  const name = () => p.people.find(x => x.id === e.personID)?.name ?? ''
  switch (e.kind) {
    case 'recall':
      if (pl === 'snapchat') {
        if (e.personID === p.selfID) return en ? 'You deleted a chat' : '你删除了一条消息'
        return en ? `${name()} deleted a chat` : `${name()} 删除了一条消息`
      }
      if (e.personID === p.selfID) return en ? 'You unsent a message' : '你撤回了一条消息'
      if (en) return `${name()} unsent a message`
      return p.template === 'wechatGroup' ? `${q(name())}撤回了一条消息` : '对方撤回了一条消息'
    case 'screenshot':
      if (e.personID === p.selfID) return en ? 'You took a screenshot of chat!' : '你截了这段聊天的图！'
      return en ? `${name()} took a screenshot of chat!` : `${name()} 截了这段聊天的图！`
    case 'pat': {
      const mine = e.personID === p.selfID
      const actor = mine ? (en ? 'You' : '我') : q(name())
      const fallback = mine ? p.people.find(x => x.id !== p.selfID)?.id : p.selfID
      const targetID = e.target ?? fallback
      let target: string
      if (!targetID || targetID === e.personID) target = en ? (mine ? 'yourself' : 'themselves') : '自己'
      else if (targetID === p.selfID) target = en ? 'you' : '我'
      else target = q(p.people.find(x => x.id === targetID)?.name ?? '')
      return en ? `${actor} nudged ${target}${e.text ? ' ' + e.text : ''}` : `${actor}拍了拍${target}${e.text}`
    }
    default:
      return e.text
  }
}

/** Default content of a new link / file / location / call, per app and language. */
export function starter(p: Project, kind: Kind): { text: string; detail?: string; source?: string } {
  const zh = p.language === 'chinese'
  switch (kind) {
    case 'link':
      return zh ? { text: '按长椅密度排了一条散步路线', detail: '全程三公里，能坐七次。', source: '周三不上线' }
        : { text: 'A walk ranked by bench density', detail: 'Three miles. Seven places to sit.', source: 'outofmiso.example' }
    case 'file': return zh ? { text: '真的最终版3.pdf', detail: '18.2 KB' } : { text: 'final_final_v3.pdf', detail: '18.2 KB' }
    case 'location': return zh ? { text: '两把椅子咖啡', detail: '梧桐路 18 号' } : { text: 'Two Chairs Coffee', detail: '18 Linden St' }
    case 'call': return callLabel(p, '', false)
    default: return { text: '' }
  }
}

export function callLabel(p: Project, raw: string, video: boolean): { text: string; detail?: string } {
  const zh = p.language === 'chinese'
  const value = raw.trim()
  const isDuration = /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)
  const pl = platformOf(p.template)
  if (pl === 'wechat') {
    if (!value) return { text: zh ? '通话时长 03:12' : 'Duration 03:12' }
    return { text: isDuration ? (zh ? `通话时长 ${value}` : `Duration ${value}`) : value }
  }
  if (pl === 'telegram') return { text: '', detail: value || (zh ? '12 分钟' : '12 min') }
  if (pl === 'whatsapp') {
    return { text: video ? (zh ? '视频通话' : 'Video call') : (zh ? '语音通话' : 'Voice call'), detail: value || (zh ? '12 分钟' : '12 min') }
  }
  return { text: video ? (zh ? '视频聊天' : 'Video chat') : (zh ? '语音通话' : 'Audio call'), detail: value || '3:12' }
}

export function summary(e: Entry): string {
  switch (e.kind) {
    case 'image': return e.text || '[图片]'
    case 'voice': return '[语音]'
    case 'recall': return '撤回了一条消息'
    case 'pat': return '拍一拍'
    case 'sticker': return '[表情]'
    case 'link': return e.text ? `[链接] ${e.text}` : '[链接]'
    case 'file': return `[文件] ${e.text}`
    case 'location': return `[位置] ${e.text}`
    case 'card': return '[名片]'
    case 'call': return e.text || '[通话]'
    case 'snap': return '[Snap]'
    case 'screenshot': return '[截图]'
    default: return e.text || '空白内容'
  }
}

export const voiceDuration = (e: Entry) => Math.min(Math.max(e.seconds ?? 3, 1), 60)

// MARK: receipts, quotes, status line

export function receiptSteps(p: Project): Receipt[] {
  switch (platformOf(p.template)) {
    case 'imessage': case 'snapchat': return ['delivered', 'read']
    case 'telegram': return ['pending', 'sent', 'read']
    default: return ['pending', 'sent', 'delivered', 'read']
  }
}

/** iMessage / Snapchat: only the last message, if it's mine, shows "Delivered / Read". */
export function receiptHolder(p: Project, list = visibleEntries(p)): string | undefined {
  const me = viewerOf(p)
  if (!me) return undefined
  const bubbles = list.filter(e => e.kind !== 'notification' && (!isNoticeKind(e.kind) || (platformOf(p.template) === 'whatsapp' && e.kind === 'recall')))
  const last = bubbles[bubbles.length - 1]
  return last && last.personID === me ? last.id : undefined
}

export function effectiveReceipt(p: Project, e: Entry, holder = receiptHolder(p)): Receipt | undefined {
  const r = projectRules(p)
  const bubble = e.kind !== 'notification' && (!isNoticeKind(e.kind) || (platformOf(p.template) === 'whatsapp' && e.kind === 'recall'))
  if (!has(r, 'receipt') || e.personID !== viewerOf(p) || !bubble || e.kind === 'recall' || e.kind === 'snap' || e.failed) return undefined
  const pl = platformOf(p.template)
  if (pl === 'imessage' || pl === 'snapchat') {
    if (e.id !== holder) return undefined
    return e.receipt === 'read' ? 'read' : 'delivered'
  }
  return e.receipt ?? 'read'
}

/** "Name: text" → name, text, person. Only split when the name is someone in this chat (so "9:41" stays whole). */
export function quoteParts(p: Project, quote: string): { name?: string; text: string; person?: string } {
  const m = /^([^:：]+)[:：](.+)$/s.exec(quote)
  if (!m) return { text: quote }
  const name = m[1].trim(), text = m[2].trim()
  if (!name || !text) return { text: quote }
  const match = findPerson(p, name)
  if (match) return { name: match.id === p.selfID ? zhen(p.language, '你', 'You') : match.name, text, person: match.id }
  if (['我', 'me', 'you', '你'].includes(name.toLowerCase()) && p.selfID) return { name: zhen(p.language, '你', 'You'), text, person: p.selfID }
  return { text: quote }
}

export function statusLine(p: Project) {
  if (p.status !== undefined) return p.status
  const r = projectRules(p)
  if (platformOf(p.template) === 'telegram') {
    if (has(r, 'contactTitle')) return zhen(p.language, '最近上线', 'last seen recently')
    return zhen(p.language, `${p.people.length} 位成员`, `${p.people.length} members`)
  }
  if (has(r, 'contactTitle')) return zhen(p.language, '在线', 'online')
  const names = [...p.people.filter(x => x.id !== p.selfID).map(x => x.name), zhen(p.language, '你', 'You')]
  return names.join(p.language === 'chinese' ? '、' : ', ')
}

export function isJumboEmoji(text: string) {
  const v = text.trim()
  if (!v) return false
  const chars = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v)].map(s => s.segment)
  if (chars.length > 3) return false
  return chars.every(c => /\p{Extended_Pictographic}/u.test(c) || /\p{Emoji_Presentation}/u.test(c))
}

// MARK: script ("写法") import

const SELF_NAMES = new Set(['我', 'me', 'you', 'user', '你', 'q', 'you said', '你说', '用户'])
const UNASSIGNED = '__unassigned__'

const TOKEN_HEADS = new Set(['语音', 'voice', '图片', '照片', 'photo', 'image', '撤回', 'unsent', 'unsend', '拍一拍', 'nudge',
  '表情', 'sticker', '链接', 'link', '文件', 'file', '位置', 'location', '名片', 'contact',
  '通话', '语音通话', '视频通话', 'call', 'videocall', 'snap'])

export function isToken(value: string) {
  if (!value.startsWith('[') || !value.endsWith(']')) return false
  const head = value.slice(1, -1).split(' ')[0]?.toLowerCase() ?? ''
  return TOKEN_HEADS.has(head)
}

function bracketHead(value: string, heads: string[]): string | undefined {
  if (!value.startsWith('[') || !value.endsWith(']')) return undefined
  const inner = value.slice(1, -1).trim()
  const head = heads.find(h => inner.toLowerCase().startsWith(h + ' '))
  return head === undefined ? undefined : inner.slice(head.length).trim()
}

export function notificationLine(value: string) {
  const rest = bracketHead(value, ['通知', 'notification', 'notify'])
  if (rest === undefined) return undefined
  const m = /^([^:：]+)[:：](.+)$/s.exec(rest)
  if (!m) return undefined
  const name = m[1].trim(), text = m[2].trim()
  return name && name.length <= 35 && text ? { name, text } : undefined
}

export function screenshotName(value: string) {
  const name = bracketHead(value, ['截图', 'screenshot'])
  return name && name.length <= 35 ? name : undefined
}

export function likerNames(value: string) {
  const rest = bracketHead(value, ['赞', 'likes', 'like'])
  if (rest === undefined) return undefined
  const names = rest.split(/[ ，,、]+/).map(s => s.trim()).filter(s => s && s.length <= 35)
  return names.length ? names : undefined
}

const looksLikeSize = (w: string) => /^\d+(\.\d+)?\s?(B|KB|MB|GB|K|M|G)$/i.test(w)

function personNamed(p: Project, name: string) {
  return findPerson(p, name)?.id ?? addPerson(p, name)
}

/** Recognise [语音 12], [撤回], [拍一拍 名字], [图片], trailing [引用 …] etc. Kinds the scene doesn't have stay literal. */
export function readTokens(p: Project, e: Entry) {
  const r = projectRules(p)
  let body = e.text
  const strip = (marks: string[], cond: boolean, apply: () => void) => {
    for (const mark of marks) {
      if (cond && body.endsWith(mark)) {
        apply()
        body = body.slice(0, -mark.length).trim()
        e.text = body
      }
    }
  }
  strip(['[发送失败]', '[failed]'], has(r, 'failed'), () => { e.failed = true })
  strip(['[已编辑]', '[edited]'], has(r, 'edited'), () => { e.edited = true })
  strip(['[已保存]', '[saved]'], has(r, 'saved'), () => { e.saved = true })
  if (has(r, 'quote') && body.endsWith(']')) {
    const open = body.lastIndexOf('[引用')
    if (open >= 0) {
      e.quote = body.slice(open + 3, -1).trim()
      body = body.slice(0, open).trim()
      e.text = body
    }
  }
  if (!isToken(body)) return
  const words = body.slice(1, -1).split(' ').filter(Boolean)
  const head = words[0]?.toLowerCase() ?? ''
  const rest = words.slice(1).join(' ')
  switch (head) {
    case '语音': case 'voice':
      if (!allows(r, 'voice')) return
      e.kind = 'voice'
      e.seconds = words.slice(1).map(w => parseInt(w.replace(/\D/g, ''), 10)).find(n => !Number.isNaN(n)) ?? 3
      e.unread = words.includes('未读') || words.includes('unread')
      e.text = ''
      return
    case '图片': case '照片': case 'photo': case 'image':
      if (!allows(r, 'image')) return
      e.kind = 'image'; e.text = ''
      return
    case '撤回': case 'unsent': case 'unsend':
      if (!allows(r, 'recall')) return
      e.kind = 'recall'; e.text = ''
      return
    case '拍一拍': case 'nudge':
      if (!allows(r, 'pat')) return
      e.kind = 'pat'; e.text = ''
      if (rest) {
        const existing = findPerson(p, rest)
        if (existing) e.target = existing.id
        else if (['我', 'me'].includes(rest.toLowerCase()) && p.selfID) e.target = p.selfID
        else e.target = addPerson(p, rest)
      }
      return
    case '表情': case 'sticker':
      if (!allows(r, 'sticker')) return
      e.kind = 'sticker'; e.text = ''
      return
    case '链接': case 'link': {
      if (!allows(r, 'link')) return
      const s = starter(p, 'link')
      e.kind = 'link'; e.text = rest || s.text; e.detail = s.detail; e.source = s.source
      return
    }
    case '文件': case 'file': {
      if (!allows(r, 'file')) return
      const parts = words.slice(1)
      e.kind = 'file'
      if (parts.length > 1 && looksLikeSize(parts[parts.length - 1])) e.detail = parts.pop()
      else e.detail = starter(p, 'file').detail
      e.text = parts.length ? parts.join(' ') : starter(p, 'file').text
      return
    }
    case '位置': case 'location': {
      if (!allows(r, 'location')) return
      const s = starter(p, 'location')
      e.kind = 'location'; e.text = rest || s.text; e.detail = s.detail
      return
    }
    case '名片': case 'contact':
      if (!allows(r, 'card')) return
      e.kind = 'card'; e.text = ''
      if (rest) e.target = personNamed(p, rest)
      return
    case 'snap':
      if (!allows(r, 'snap')) return
      e.kind = 'snap'; e.text = ''
      e.video = words.slice(1).some(w => ['video', '视频', 'sound', '声音'].includes(w.toLowerCase())) || undefined
      return
    case '通话': case '语音通话': case '视频通话': case 'call': case 'videocall': {
      if (!allows(r, 'call')) return
      e.kind = 'call'
      e.video = head === '视频通话' || head === 'videocall' || undefined
      const label = callLabel(p, rest, e.video === true)
      e.text = label.text; e.detail = label.detail
      return
    }
  }
}

/** Replies starting with "回复 @someone：" or "@someone " record whom they answer. */
export function readReplyTarget(p: Project, e: Entry) {
  if (!has(projectRules(p), 'replyTarget') || !e.isReply || e.kind !== 'text') return
  let body = e.text
  if (body.startsWith('回复')) body = body.slice(2).trimStart()
  else if (body.toLowerCase().startsWith('reply ')) body = body.slice(6).trimStart()
  if (!body.startsWith('@')) return
  body = body.slice(1)
  const m = /^([^:：\s]+)[\s:：]+(.+)$/s.exec(body)
  if (!m) return
  const name = m[1].trim()
  if (!name || name.length > 35) return
  e.target = personNamed(p, name)
  e.text = m[2]
}

export class ScriptError extends Error {}

/** "名字：内容" is one entry; leading ">" is a reply; "[time]" alone is a time row; "==" starts a system notice. */
export function importScript(p: Project, script: string, replace: boolean): string[] {
  const lines = script.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) throw new ScriptError('empty')
  if (lines.length + (replace ? 0 : p.entries.length) > ITEM_LIMIT) throw new ScriptError('tooMany')
  const r = projectRules(p)
  const chat = isChat(r)
  const generic = zhen(p.language, chat ? '对方' : '访客', chat ? 'Contact' : 'Viewer')
  const added: Entry[] = []
  let commentTime = ''
  for (const line of lines) {
    const reply = line.startsWith('>')
    const value = reply ? line.slice(1).trim() : line
    if (has(r, 'likers')) {
      const names = likerNames(value)
      if (names) {
        const post = [...added].reverse().find(e => !e.isReply)
        if (post) post.likers = names.map(n => personNamed(p, n))
        continue
      }
    }
    if (!reply && allows(r, 'notification')) {
      const note = notificationLine(value)
      if (note) {
        const who = p.people.find(x => x.id !== p.selfID)?.id ?? p.people[0]?.id ?? UNASSIGNED
        added.push(makeEntry(who, { kind: 'notification', text: note.text.slice(0, TEXT_LIMIT), source: note.name }))
        continue
      }
    }
    if (!reply && allows(r, 'screenshot')) {
      const who = screenshotName(value)
      if (who) {
        const id = findPerson(p, who)?.id ?? (['我', 'me'].includes(who.toLowerCase()) ? p.selfID : undefined) ?? addPerson(p, who)
        added.push(makeEntry(id, { kind: 'screenshot' }))
        continue
      }
    }
    const isSystem = allows(r, 'system') && value.startsWith('==')
    const bracketed = !isSystem && value.startsWith('[') && value.endsWith(']') && value.length > 2 && !isToken(value)
    if (bracketed && !allows(r, 'time') && has(r, 'commentTime')) {
      commentTime = value.slice(1, -1).slice(0, 40)
      continue
    }
    const isTime = bracketed && allows(r, 'time')
    const ordinal = (replace ? 0 : p.entries.length) + added.length + 1
    let name = chat || isTime ? generic : `${generic} ${ordinal}`
    let body = value
    let replyTo: string | undefined
    if (isTime) body = value.slice(1, -1)
    else if (isSystem) body = value.replace(/^=+/, '').trim()
    else {
      const sep = value.search(/[:：]/)
      if (sep >= 0 && !value.slice(sep + 1).startsWith('//')) {
        const candidate = value.slice(0, sep).trim()
        const message = value.slice(sep + 1).trim()
        if (candidate && candidate.length <= 35 && message) {
          name = candidate
          body = message
          if (has(r, 'replyTarget') && reply) {
            const mark = / 回复 | replied to /i.exec(name)
            if (mark) {
              const author = name.slice(0, mark.index).trim()
              const target = name.slice(mark.index + mark[0].length).trim()
              if (author && target) { name = author; replyTo = target }
            }
          }
        }
      }
    }
    let personID: string
    if (isTime || isSystem) personID = p.people[0]?.id ?? UNASSIGNED
    else if (isAssistant(r)) personID = assistantSpeaker(p, SELF_NAMES.has(name.toLowerCase()))
    else personID = personNamed(p, name)
    if (hasSelf(r) && !isTime && !isSystem && ['我', 'me'].includes(name.toLowerCase())) {
      const spoke = p.selfID !== undefined && (
        (!replace && p.entries.some(e => e.personID === p.selfID && e.kind !== 'time')) ||
        added.some(e => e.personID === p.selfID && e.kind !== 'time'))
      if (!spoke) p.selfID = personID
    }
    const e = makeEntry(personID, {
      kind: isTime ? 'time' : isSystem ? 'system' : 'text',
      text: body.slice(0, TEXT_LIMIT),
      isReply: reply && has(r, 'thread'),
    })
    if (e.kind === 'time') readTime(p, e.text, e)
    if (e.kind === 'text') {
      readTokens(p, e)
      readReplyTarget(p, e)
      if (has(r, 'commentTime')) e.metadata = commentTime
    }
    if (replyTo && e.isReply) e.target = personNamed(p, replyTo)
    added.push(e)
  }
  if (added.some(e => e.personID === UNASSIGNED)) {
    const author = p.people[0]?.id ?? addPerson(p, generic)
    for (const e of added) if (e.personID === UNASSIGNED) e.personID = author
  }
  p.entries = replace ? added : [...p.entries, ...added]
  if (has(r, 'contactTitle') && (!p.title || isSampleTitle(p.template, p.title))) {
    const c = p.entries.find(e => !isNoticeKind(e.kind) && e.personID !== p.selfID)
    if (c) p.title = p.people.find(x => x.id === c.personID)?.name ?? p.title
  }
  return added.map(e => e.id)
}

// MARK: AI chat paste

const MINE_MARKERS = ['you said', 'user', 'me', 'you', '我', '你说', '用户', 'q', '问']
const AI_MARKERS = ['chatgpt said', 'gemini said', 'deepseek said', 'assistant', 'ai', 'chatgpt', 'gemini', 'deepseek', 'a', '答', '回答']

function speakerMarker(line: string) {
  const t = line.trim()
  const i = t.search(/[:：]/)
  if (i < 0) return undefined
  const head = t.slice(0, i).trim().toLowerCase()
  if (head.length > 14) return undefined
  const rest = t.slice(i + 1).trim()
  if (MINE_MARKERS.includes(head)) return { mine: true, rest }
  if (AI_MARKERS.includes(head)) return { mine: false, rest }
  return undefined
}

/** A pasted Q&A ("You said: … ChatGPT said: …") splits into turns; anything else is one entry. */
export function assistantTurns(text: string): { mine: boolean; text: string }[] | undefined {
  const turns: { mine: boolean; text: string }[] = []
  let current: { mine: boolean; lines: string[] } | undefined
  let sawMine = false, sawAI = false
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const marker = speakerMarker(raw)
    if (marker) {
      if (current) turns.push({ mine: current.mine, text: current.lines.join('\n') })
      current = { mine: marker.mine, lines: marker.rest ? [marker.rest] : [] }
      if (marker.mine) sawMine = true; else sawAI = true
    } else if (current) current.lines.push(raw)
    else if (raw.trim()) return undefined
  }
  if (current) turns.push({ mine: current.mine, text: current.lines.join('\n') })
  if (!sawMine || !sawAI) return undefined
  return turns.map(t => ({ mine: t.mine, text: t.text.trim() })).filter(t => t.text)
}

export function validate(p: Project) {
  const ids = new Set(p.people.map(x => x.id))
  const ok = p.entries.length <= ITEM_LIMIT && ids.size === p.people.length &&
    (!p.selfID || ids.has(p.selfID)) && (!p.authorID || ids.has(p.authorID)) &&
    new Set(p.entries.map(e => e.id)).size === p.entries.length &&
    p.entries.every(e => ids.has(e.personID) && (!e.target || ids.has(e.target)) && (e.likers ?? []).every(x => ids.has(x)))
  if (!ok) throw new ScriptError('invalid')
}

export { REPLY_LIMIT, TEXT_LIMIT, ITEM_LIMIT, uid, viewerOf }

// MARK: Xiaohongshu note pictures (the cover is the first)

export const NOTE_PICTURE_LIMIT = 18
export const notePictures = (p: Project): string[] => [...(p.cover ? [p.cover] : []), ...(p.noteImages ?? [])]
export const notePictureIndex = (p: Project) => Math.min(Math.max(p.notePage ?? 0, 0), Math.max(notePictures(p).length - 1, 0))
export function setNotePictures(p: Project, list: string[]) {
  p.cover = list[0]
  p.noteImages = list.length > 1 ? list.slice(1) : undefined
  if (p.notePage !== undefined && p.notePage >= list.length) p.notePage = list.length > 1 ? list.length - 1 : undefined
}
