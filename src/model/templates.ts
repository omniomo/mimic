import type { Lang, Platform, Template } from './types'

export const PLATFORM: Record<Template, Platform> = {
  wechatGroup: 'wechat', wechatDirect: 'wechat', wechatMoments: 'wechat',
  instagramDirect: 'instagram', instagramGroup: 'instagram', instagramComments: 'instagram',
  bilibili: 'bilibili',
  imessageDirect: 'imessage', imessageGroup: 'imessage',
  whatsappDirect: 'whatsapp', whatsappGroup: 'whatsapp',
  telegramDirect: 'telegram', telegramGroup: 'telegram',
  youtube: 'youtube', tiktok: 'tiktok', douyin: 'douyin', xiaohongshu: 'xiaohongshu',
  snapchatDirect: 'snapchat', snapchatGroup: 'snapchat',
  discord: 'discord', chatgpt: 'chatgpt', gemini: 'gemini', deepseek: 'deepseek',
}

export const platformOf = (t: Template): Platform => PLATFORM[t]

/** English-first scene names (the editor UI translates them). No logos anywhere: names are for hover and screen readers. */
export const DISPLAY_NAME: Record<Template, string> = {
  wechatGroup: 'WeChat Group', wechatDirect: 'WeChat', bilibili: 'Bilibili',
  instagramDirect: 'Instagram', instagramComments: 'IG Comments', instagramGroup: 'Instagram Group',
  imessageDirect: 'iMessage', imessageGroup: 'iMessage Group',
  whatsappDirect: 'WhatsApp', whatsappGroup: 'WhatsApp Group',
  telegramDirect: 'Telegram', telegramGroup: 'Telegram Group',
  youtube: 'YouTube Comments', tiktok: 'TikTok Comments', wechatMoments: 'Moments',
  douyin: 'Douyin Comments', xiaohongshu: 'Xiaohongshu',
  snapchatDirect: 'Snapchat', snapchatGroup: 'Snapchat Group', discord: 'Discord',
  chatgpt: 'ChatGPT', gemini: 'Gemini', deepseek: 'DeepSeek',
}

/** The same app's private and group chat are one card on the gallery: new projects start private,
 *  adding a third person turns them into the group version. */
export const FAMILIES = [
  'imessage', 'whatsapp', 'snapchat', 'telegram', 'instagram', 'instagramComments', 'youtube', 'tiktok', 'discord',
  'assistant', 'wechat', 'moments', 'bilibili', 'douyin', 'xiaohongshu',
] as const
export type Family = (typeof FAMILIES)[number]

export const FAMILY_NAME: Record<Family, string> = {
  imessage: 'iMessage', whatsapp: 'WhatsApp', telegram: 'Telegram', instagram: 'Instagram',
  instagramComments: 'IG Comments', youtube: 'YouTube', tiktok: 'TikTok', wechat: 'WeChat', moments: 'Moments',
  bilibili: 'Bilibili', douyin: 'Douyin', xiaohongshu: 'Xiaohongshu', snapchat: 'Snapchat', discord: 'Discord',
  assistant: 'AI Chat',
}

export function familyOf(t: Template): Family {
  switch (t) {
    case 'imessageDirect': case 'imessageGroup': return 'imessage'
    case 'whatsappDirect': case 'whatsappGroup': return 'whatsapp'
    case 'telegramDirect': case 'telegramGroup': return 'telegram'
    case 'instagramDirect': case 'instagramGroup': return 'instagram'
    case 'instagramComments': return 'instagramComments'
    case 'youtube': return 'youtube'
    case 'tiktok': return 'tiktok'
    case 'wechatGroup': case 'wechatDirect': return 'wechat'
    case 'wechatMoments': return 'moments'
    case 'bilibili': return 'bilibili'
    case 'douyin': return 'douyin'
    case 'xiaohongshu': return 'xiaohongshu'
    case 'snapchatDirect': case 'snapchatGroup': return 'snapchat'
    case 'discord': return 'discord'
    case 'chatgpt': case 'gemini': case 'deepseek': return 'assistant'
  }
}

export function familyBase(f: Family): Template {
  switch (f) {
    case 'imessage': return 'imessageDirect'
    case 'whatsapp': return 'whatsappDirect'
    case 'telegram': return 'telegramDirect'
    case 'instagram': return 'instagramDirect'
    case 'instagramComments': return 'instagramComments'
    case 'youtube': return 'youtube'
    case 'tiktok': return 'tiktok'
    case 'wechat': return 'wechatDirect'
    case 'moments': return 'wechatMoments'
    case 'bilibili': return 'bilibili'
    case 'douyin': return 'douyin'
    case 'xiaohongshu': return 'xiaohongshu'
    case 'snapchat': return 'snapchatDirect'
    case 'discord': return 'discord'
    case 'assistant': return lastAssistant()
  }
}

export function lastAssistant(): Template {
  try {
    const raw = localStorage.getItem('mimic.lastAssistant')
    if (raw === 'chatgpt' || raw === 'gemini' || raw === 'deepseek') return raw
  } catch { /* storage can be unavailable */ }
  return navigator.language.startsWith('zh') ? 'deepseek' : 'chatgpt'
}

export function rememberAssistant(t: Template) {
  if (familyOf(t) !== 'assistant') return
  try { localStorage.setItem('mimic.lastAssistant', t) } catch { /* ignore */ }
}

/** Private ↔ group pairs. */
export function counterpart(t: Template): Template | undefined {
  const pairs: Partial<Record<Template, Template>> = {
    wechatGroup: 'wechatDirect', wechatDirect: 'wechatGroup',
    imessageGroup: 'imessageDirect', imessageDirect: 'imessageGroup',
    whatsappGroup: 'whatsappDirect', whatsappDirect: 'whatsappGroup',
    telegramGroup: 'telegramDirect', telegramDirect: 'telegramGroup',
    instagramGroup: 'instagramDirect', instagramDirect: 'instagramGroup',
    snapchatGroup: 'snapchatDirect', snapchatDirect: 'snapchatGroup',
  }
  return pairs[t]
}

export function guestName(t: Template): string {
  switch (platformOf(t)) {
    case 'wechat': case 'bilibili': case 'douyin': return '小满'
    case 'xiaohongshu': return '雾面小满'
    case 'instagram': case 'youtube': case 'tiktok': return 'nori.jpeg'
    case 'imessage': return 'Jules'
    case 'whatsapp': return 'Noor'
    case 'telegram': return 'luma.zip'
    case 'snapchat': return 'Rue'
    case 'discord': return 'soup.dev'
    default: return 'AI'
  }
}

export function sampleTitle(t: Template): string {
  switch (t) {
    case 'wechatDirect': case 'instagramDirect': case 'imessageDirect': case 'whatsappDirect':
    case 'telegramDirect': case 'snapchatDirect':
      return guestName(t)
    case 'wechatGroup': return '人齐了再出门'
    case 'imessageGroup': return 'finding a time'
    case 'whatsappGroup': return 'who has the keys'
    case 'telegramGroup': return 'final_v12'
    case 'instagramGroup': return 'sent you a reel'
    case 'snapchatGroup': return 'the receipts'
    case 'discord': return 'general'
    default: return ''
  }
}

const LEGACY_TITLES: Partial<Record<Template, string>> = {
  wechatGroup: '夜班小分队', wechatDirect: '阿宁', instagramDirect: 'nightshift_ning', imessageDirect: 'Riley',
  imessageGroup: 'Night Shift', whatsappDirect: 'Maya', whatsappGroup: 'Night Shift 🥐', telegramDirect: 'Lena',
  telegramGroup: 'Bakery Club 🥐', instagramGroup: 'night shift 🥐', snapchatDirect: 'Jordan', snapchatGroup: 'weekend crew',
}

export function isSampleTitle(t: Template, title: string): boolean {
  return title === sampleTitle(t) || title === LEGACY_TITLES[t]
}

export function defaultLanguage(p: Platform): Lang {
  return p === 'wechat' || p === 'bilibili' || p === 'douyin' || p === 'xiaohongshu' || p === 'deepseek'
    ? 'chinese' : 'english'
}

/** Reactions offered in the More panel, in the app's own order. */
export function reactionChoices(p: Platform): string[] {
  switch (p) {
    case 'imessage': return ['❤️', '👍', '👎', '😂', '‼️', '❓']
    case 'whatsapp': return ['👍', '❤️', '😂', '😮', '😢', '🙏']
    case 'telegram': return ['👍', '❤️', '🔥', '🥰', '👏', '😁']
    case 'instagram': return ['❤️', '😂', '😮', '😢', '😡', '👍']
    case 'discord': return ['👍', '❤️', '😂', '😳', '💀', '🔥']
    default: return []
  }
}

/** Date chips only show the day; the clock is inside each bubble. Typing "Yesterday" alone is understood. */
export function datesOnly(p: Platform): boolean {
  return p === 'whatsapp' || p === 'telegram' || p === 'snapchat' || p === 'discord'
}

export const isAssistantPlatform = (p: Platform) => p === 'chatgpt' || p === 'gemini' || p === 'deepseek'
