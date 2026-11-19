// Time rows hold a real moment and are written the way each app writes them, relative to "the screenshot day".
// See the design doc 《Mimic 数据与场景》 for each app's format.

import { datesOnly, platformOf } from './templates'
import type { Entry, Lang, Platform, Project } from './types'
import { isNoticeKind, projectRules, visibleEntries } from './rules'

const WEEK_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function startOfDay(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const addDays = (ms: number, n: number) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime() }

// MARK: read

const CLOCK = /(上午|下午|凌晨|早上|中午|晚上)?\s*(\d{1,2}):(\d{2})\s*([AaPp]\.?[Mm]\.?)?/

function findClock(text: string) {
  const m = CLOCK.exec(text)
  if (!m) return undefined
  let hour = Number(m[2])
  const minute = Number(m[3])
  if (hour >= 24 || minute >= 60) return undefined
  const prefix = m[1]
  const suffix = m[4]?.toLowerCase().replace(/\./g, '')
  const pm = prefix === '下午' || prefix === '晚上' || suffix === 'pm' || (prefix === '中午' && hour < 11)
  const am = prefix === '上午' || prefix === '凌晨' || prefix === '早上' || suffix === 'am'
  if (pm && hour < 12) hour += 12
  if (am && hour === 12) hour = 0
  return { hour, minute, index: m.index, length: m[0].length }
}

/** 1 = Sunday … 7 = Saturday. */
function weekday(day: string): number | undefined {
  const zh: Record<string, number> = { 日: 1, 天: 1, 一: 2, 二: 3, 三: 4, 四: 5, 五: 6, 六: 7 }
  for (const prefix of ['星期', '周', '礼拜']) {
    if (day.startsWith(prefix)) {
      const n = zh[day.slice(prefix.length)]
      if (n) return n
    }
  }
  const en = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const i = en.findIndex(w => day === w || (day.startsWith(w) && day.endsWith('day')))
  return i >= 0 ? i + 1 : undefined
}

function tidyDay(raw: string) {
  let day = raw.trim()
  if (day.endsWith(' at')) day = day.slice(0, -3).trim()
  const comma = day.indexOf(',')
  if (comma >= 0 && weekday(day.slice(0, comma).trim())) {
    const rest = day.slice(comma + 1).trim()
    if (rest) day = rest
  }
  const space = day.lastIndexOf(' ')
  if (space >= 0 && weekday(day.slice(space + 1)) && /\d/.test(day.slice(0, space))) day = day.slice(0, space).trim()
  return day.replace(/^[\s,，]+|[\s,，]+$/g, '')
}

function resolveDay(raw: string, today: number): number | undefined {
  const start = startOfDay(today)
  const day = tidyDay(raw)
  if (!day || day === '今天' || day === 'today') return start
  if (day === '昨天' || day === 'yesterday') return addDays(start, -1)
  if (day === '前天') return addDays(start, -2)
  const wd = weekday(day)
  if (wd) {
    for (let n = 1; n <= 7; n++) {
      const d = addDays(start, -n)
      if (new Date(d).getDay() + 1 === wd) return d
    }
  }
  const year = new Date(start).getFullYear()
  let g = /^(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?$/.exec(day)
  if (g) return new Date(Number(g[1]), Number(g[2]) - 1, Number(g[3])).getTime()
  g = /^(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?$/.exec(day)
  if (g) return new Date(year, Number(g[1]) - 1, Number(g[2])).getTime()
  g = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/.exec(day)
  if (g) {
    const month = MONTH_EN.findIndex(m => g![1].startsWith(m.toLowerCase()))
    if (month >= 0) return new Date(g[3] ? Number(g[3]) : year, month, Number(g[2])).getTime()
  }
  return undefined
}

/** Understands "21:42", "昨天 21:42", "星期三 8:15", "3月5日 21:42", "下午9:42", "Yesterday 9:42 PM", "Mar 5, 2024 9:42 PM"…
 *  No clock or not understood → undefined (kept as literal text). */
export function parseTime(raw: string, today: number): number | undefined {
  let text = raw.trim().replace(/：/g, ':')
  const clock = findClock(text)
  if (!clock) return undefined
  text = text.slice(0, clock.index) + text.slice(clock.index + clock.length)
  const day = resolveDay(text.replace(/^[\s,，]+|[\s,，]+$/g, '').toLowerCase(), today)
  if (day === undefined) return undefined
  const d = new Date(day)
  d.setHours(clock.hour, clock.minute, 0, 0)
  return d.getTime()
}

// MARK: write

export function clockText(ms: number, zh: boolean, twelve: boolean) {
  const d = new Date(ms)
  const hour = d.getHours()
  const minute = String(d.getMinutes()).padStart(2, '0')
  if (!twelve) return `${String(hour).padStart(2, '0')}:${minute}`
  const short = hour % 12 === 0 ? 12 : hour % 12
  if (zh) return `${hour < 12 ? '上午' : '下午'}${short}:${minute}`
  return `${short}:${minute} ${hour < 12 ? 'AM' : 'PM'}`
}

export function formatTime(ms: number, today: number, platform: Platform, lang: Lang, twelve: boolean): string {
  const zh = lang === 'chinese'
  const start = startOfDay(today)
  const days = Math.round((start - startOfDay(ms)) / 86400000)
  const clock = clockText(ms, zh, twelve)
  const d = new Date(ms)
  const wd = d.getDay(), month = d.getMonth() + 1, day = d.getDate(), year = d.getFullYear()
  const sameYear = year === new Date(start).getFullYear()

  switch (platform) {
    case 'imessage':
      if (days === 0) return zh ? `今天 ${clock}` : `Today ${clock}`
      if (days === 1) return zh ? `昨天 ${clock}` : `Yesterday ${clock}`
      if (days > 1 && days < 7) return `${zh ? WEEK_ZH[wd] : WEEK_FULL_EN[wd]} ${clock}`
      if (sameYear) return zh ? `${month}月${day}日 ${WEEK_ZH[wd]} ${clock}` : `${WEEK_EN[wd]}, ${MONTH_EN[month - 1]} ${day} at ${clock}`
      return zh ? `${year}年${month}月${day}日 ${clock}` : `${MONTH_EN[month - 1]} ${day}, ${year} at ${clock}`
    case 'whatsapp':
      if (days === 0) return zh ? '今天' : 'Today'
      if (days === 1) return zh ? '昨天' : 'Yesterday'
      if (days > 1 && days < 7) return zh ? WEEK_ZH[wd] : WEEK_FULL_EN[wd]
      if (sameYear) return zh ? `${month}月${day}日 ${WEEK_ZH[wd]}` : `${WEEK_EN[wd]}, ${MONTH_EN[month - 1]} ${day}`
      return zh ? `${year}年${month}月${day}日` : `${MONTH_EN[month - 1]} ${day}, ${year}`
    case 'telegram':
      if (days === 0) return zh ? '今天' : 'Today'
      if (days === 1) return zh ? '昨天' : 'Yesterday'
      if (sameYear) return zh ? `${month}月${day}日` : `${MONTH_FULL_EN[month - 1]} ${day}`
      return zh ? `${year}年${month}月${day}日` : `${MONTH_FULL_EN[month - 1]} ${day}, ${year}`
    case 'snapchat':
      if (days === 0) return zh ? '今天' : 'Today'
      if (days === 1) return zh ? '昨天' : 'Yesterday'
      if (days > 1 && days < 7) return zh ? WEEK_ZH[wd] : WEEK_FULL_EN[wd]
      if (sameYear) return zh ? `${month}月${day}日` : `${MONTH_EN[month - 1]} ${day}`
      return zh ? `${year}年${month}月${day}日` : `${MONTH_EN[month - 1]} ${day}, ${year}`
    case 'discord':
      return zh ? `${year}年${month}月${day}日` : `${MONTH_FULL_EN[month - 1]} ${day}, ${year}`
    case 'instagram': case 'youtube': case 'tiktok': case 'chatgpt': case 'gemini': case 'deepseek':
      if (days === 0) return zh ? `今天 ${clock}` : `Today ${clock}`
      if (days === 1) return zh ? `昨天 ${clock}` : `Yesterday ${clock}`
      if (days > 1 && days < 7) return `${zh ? WEEK_ZH[wd] : WEEK_EN[wd]} ${clock}`
      if (sameYear) return zh ? `${month}月${day}日 ${clock}` : `${MONTH_EN[month - 1]} ${day}, ${clock}`
      return zh ? `${year}年${month}月${day}日 ${clock}` : `${MONTH_EN[month - 1]} ${day}, ${year}, ${clock}`
    default: // wechat, bilibili, douyin, xiaohongshu
      if (days === 0) return clock
      if (days === 1) return zh ? `昨天 ${clock}` : `Yesterday ${clock}`
      if (days > 1 && days < 7) return `${zh ? WEEK_ZH[wd] : WEEK_EN[wd]} ${clock}`
      if (sameYear) return zh ? `${month}月${day}日 ${clock}` : `${MONTH_EN[month - 1]} ${day} ${clock}`
      return zh ? `${year}年${month}月${day}日 ${clock}` : `${MONTH_EN[month - 1]} ${day}, ${year} ${clock}`
  }
}

// MARK: in a project

/** 12-hour clock: unset → English in apps other than the Chinese ones. */
export function usesTwelveHour(p: Project) {
  const pl = platformOf(p.template)
  return p.clock12 ?? (p.language === 'english' && !['wechat', 'bilibili', 'douyin', 'xiaohongshu'].includes(pl))
}

export const screenshotDay = (p: Project) => p.today ?? startOfDay(Date.now())

export function timeText(p: Project, e: Entry) {
  if (e.date === undefined) return e.text
  return formatTime(e.date, screenshotDay(p), platformOf(p.template), p.language, usesTwelveHour(p))
}

/** Read a typed time: understood → stored as a real moment and the screenshot day is fixed; otherwise literal text. */
export function readTime(p: Project, text: string, e: Entry) {
  const day = screenshotDay(p)
  const pl = platformOf(p.template)
  let date = parseTime(text, day)
  if (date === undefined && datesOnly(pl)) {
    const old = e.date ?? day + 12 * 3600000
    date = parseTime(`${text} ${clockText(old, true, false)}`, day)
  }
  if (date !== undefined) {
    p.today = day
    e.date = date
    e.text = formatTime(date, day, pl, p.language, usesTwelveHour(p))
  } else {
    e.date = undefined
    e.text = text
  }
}

/** A new time row: 5 minutes after the closest earlier one; none → the status-bar time. */
export function timeEntryDate(p: Project, index: number): number {
  const day = screenshotDay(p)
  p.today = day
  const earlier = p.entries.slice(0, Math.max(0, Math.min(index, p.entries.length))).filter(e => e.kind === 'time' && e.date !== undefined).pop()
  return earlier?.date !== undefined ? earlier.date + 5 * 60000 : parseTime(p.statusTime, day) ?? day + 12 * 3600000
}

export function merge(dayMs: number, clockMs: number) {
  const d = new Date(dayMs), c = new Date(clockMs)
  d.setHours(c.getHours(), c.getMinutes(), 0, 0)
  return d.getTime()
}

/** Bubble rows. In WhatsApp a deleted message is still a bubble. Notifications are neither. */
export function isBubble(p: Project, e: Entry) {
  if (e.kind === 'notification') return false
  return !isNoticeKind(e.kind) || (platformOf(p.template) === 'whatsapp' && e.kind === 'recall')
}

/** Each message's moment (WhatsApp, Telegram show it in the bubble). Edited ones keep their clock; the rest count on from
 *  the closest time row, +1 minute whenever the speaker changes. */
export function messageDates(p: Project): Map<string, number> {
  const day = screenshotDay(p)
  const out = new Map<string, number>()
  let clock: number | undefined
  let last: string | undefined
  for (const e of visibleEntries(p)) {
    if (e.kind === 'time') {
      if (e.date !== undefined) { clock = e.date; last = undefined }
      continue
    }
    if (!isBubble(p, e)) continue
    let current = clock ?? parseTime(p.statusTime, day) ?? day + 12 * 3600000
    if (clock !== undefined && last && last !== e.personID) current += 60000
    if (e.metadata) {
      const typed = parseTime(e.metadata, day)
      if (typed !== undefined) current = merge(current, typed)
    }
    out.set(e.id, current)
    clock = current
    last = e.personID
  }
  return out
}

export function messageClock(p: Project, e: Entry, dates = messageDates(p)) {
  if (e.metadata) return e.metadata
  const d = dates.get(e.id)
  return d === undefined ? '' : clockText(d, p.language === 'chinese', usesTwelveHour(p))
}

export const rulesHasTime = (p: Project) => projectRules(p).kinds.has('time')
