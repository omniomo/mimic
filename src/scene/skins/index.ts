// Which skin draws which scene.

import type { Template } from '../../model/types'
import type { Skin } from '../skin'
import { wechat } from './wechat'
import { imessage } from './imessage'
import { whatsapp } from './whatsapp'
import { telegram } from './telegram'
import { instagram, instagramComments } from './instagram'
import { snapchat } from './snapchat'
import { discord } from './discord'
import { chatgpt, deepseek, gemini } from './assistant'
import { youtube } from './youtube'
import { bilibili } from './bilibili'
import { douyin, tiktok } from './shortVideo'
import { xiaohongshu } from './xiaohongshu'
import { moments } from './moments'

const SKINS: Partial<Record<Template, Skin>> = {
  wechatGroup: wechat,
  wechatDirect: wechat,
  imessageDirect: imessage,
  imessageGroup: imessage,
  whatsappDirect: whatsapp,
  whatsappGroup: whatsapp,
  telegramDirect: telegram,
  telegramGroup: telegram,
  instagramDirect: instagram,
  instagramGroup: instagram,
  instagramComments,
  snapchatDirect: snapchat,
  snapchatGroup: snapchat,
  discord,
  chatgpt,
  gemini,
  deepseek,
  youtube,
  bilibili,
  tiktok,
  douyin,
  xiaohongshu,
  wechatMoments: moments,
}

export function registerSkin(templates: Template[], skin: Skin) {
  for (const t of templates) SKINS[t] = skin
}

export function skinOf(t: Template): Skin {
  return SKINS[t] ?? wechat
}
