// How a conversation plays out: when each entry appears and which sound plays when.
// The preview and the exported video use the same timeline.
// Pacing is always "Auto" and errs on the long side — cutting in an editor is cleaner than duplicating.

import { has, isAssistant, isChat, isNoticeKind, projectRules, showsMomentsProfile, visibleEntries } from '../model/rules'
import type { Project } from '../model/types'
import type { Cue } from '../sound/board'

export interface Playback {
  revealed: number
  previous: number
  blend: number
  typing: boolean
  composer?: string
  shake?: string
  shakeAngle: number
  /** Screen recordings show the home indicator; screenshots don't. */
  indicator: boolean
  banner?: string
  bannerShown: number
  /** Moments: likers visible per post at this moment (missing = all). */
  likers: Record<string, number>
  stream?: { id: string; chars?: number; pulse: number }
}

export interface TimedCue { time: number; sound: Cue; seconds?: number }

export const BANNER_HOLD = 3
export const BANNER_SLIDE = 0.3

export const typingWait = (length: number) => 0.7 + Math.min(length * 0.04, 1.3)
export const hold = (length?: number) => (length === undefined ? 1.1 : 0.7 + Math.min(length * 0.05, 2.2))

/** A screenshot: everything shown, resting at the bottom. A trailing notification shows its banner. */
export function stillPlayback(p: Project): Playback {
  const list = visibleEntries(p)
  const last = list[list.length - 1]
  return {
    revealed: list.length, previous: list.length, blend: 1, typing: false, shakeAngle: 0, indicator: false,
    banner: last?.kind === 'notification' ? last.id : undefined, bannerShown: last?.kind === 'notification' ? 1 : 0, likers: {},
  }
}

export class Timeline {
  appear: number[] = []
  typing: [number, number][] = []
  typed: { start: number; per: number; chars: string[] }[] = []
  cues: TimedCue[] = []
  shakes: { time: number; person: string }[] = []
  banners: { start: number; end: number; id: string }[] = []
  likes: { time: number; post: string; count: number }[] = []
  streams: { id: string; appear: number; from: number; to: number; total: number }[] = []
  begins: number[] = []
  ids: string[] = []
  duration = 1

  constructor(p: Project, typeOwn: boolean) {
    const entries = visibleEntries(p)
    const r = projectRules(p)
    this.ids = entries.map(e => e.id)
    this.begins = entries.map(() => 0)
    this.appear = entries.map(() => -1)
    const chat = isChat(r)
    const showsTyping = has(r, 'typingTitle') || has(r, 'typingBubble')
    let t = 0.8
    let pending: number[] = []
    const flush = (at: number) => { for (const j of pending) this.appear[j] = at; pending = [] }
    entries.forEach((e, i) => {
      this.begins[i] = t
      if (e.kind === 'time') { pending.push(i); return }
      const mine = e.personID === p.selfID
      const length = [...e.text].length
      if (isAssistant(r) && !mine && e.kind === 'text') {
        flush(t)
        this.appear[i] = t
        const think = 0.8
        const chinese = [...e.text].filter(c => c.codePointAt(0)! > 0x2e80).length * 3 > length
        const speak = Math.min(8, length / (chinese ? 45 : 160))
        const from = t + think
        this.streams.push({ id: e.id, appear: t, from, to: from + speak, total: length })
        for (let tick = from; tick < from + speak; tick += 0.09) this.cues.push({ time: tick, sound: 'stream' })
        t = from + speak + 1
        return
      }
      if (showsTyping && !mine && !isNoticeKind(e.kind) && e.kind !== 'notification') {
        const wait = typingWait(length)
        this.typing.push([t, t + wait])
        this.cues.push({ time: t, sound: 'otherTyping', seconds: wait })
        t += wait
      }
      if (typeOwn && chat && mine && e.kind === 'text' && p.showComposer && e.text) {
        const chars = [...e.text.replace(/\n/g, ' ')]
        const per = Math.min(Math.max(1.6 / chars.length, 0.04), 0.095)
        this.typed.push({ start: t, per, chars })
        chars.forEach((_, k) => this.cues.push({ time: t + k * per, sound: 'tick' }))
        t += chars.length * per + 0.2
      }
      flush(t)
      this.appear[i] = t
      switch (e.kind) {
        case 'notification':
          this.cues.push({ time: t, sound: 'notify' })
          this.banners.push({ start: t, end: t + BANNER_HOLD, id: e.id })
          break
        case 'screenshot': this.cues.push({ time: t, sound: 'shutter' }); break
        case 'recall': this.cues.push({ time: t, sound: 'recall' }); break
        case 'pat': {
          this.cues.push({ time: t, sound: 'pat' })
          const fallback = mine ? p.people.find(x => x.id !== p.selfID)?.id : p.selfID
          const target = e.target ?? fallback
          if (target) this.shakes.push({ time: t, person: target })
          break
        }
        case 'system': this.cues.push({ time: t, sound: 'system' }); break
        default:
          this.cues.push({ time: t, sound: !chat ? (e.isReply ? 'reply' : 'comment') : e.kind === 'image' ? 'image' : mine ? 'send' : 'receive' })
      }
      t += hold(e.kind === 'text' ? length : undefined)
      if (has(r, 'likers') && !showsMomentsProfile(p) && !e.isReply && e.likers?.length) {
        for (let count = 1; count <= e.likers.length; count++) {
          this.likes.push({ time: t, post: e.id, count })
          this.cues.push({ time: t, sound: 'react' })
          t += 0.32
        }
        t += 0.25
      }
    })
    flush(t)
    const lastBanner = this.banners[this.banners.length - 1]
    this.duration = Math.max(t + 1.5, lastBanner ? lastBanner.end + BANNER_SLIDE + 0.4 : 0)
  }

  begin(id: string) {
    const i = this.ids.indexOf(id)
    return i >= 0 ? this.begins[i] : undefined
  }

  frame(t: number): Playback {
    let revealed = 0
    let key = -Infinity
    for (let i = 0; i < this.appear.length; i++) {
      if (this.appear[i] > t) break
      revealed = i + 1
      key = Math.max(key, this.appear[i])
    }
    let previous = revealed
    let progress = 1
    if (key > 0) {
      previous = this.appear.filter(x => x < key).length
      previous = Math.min(previous, revealed)
      progress = Math.min(1, (t - key) / 0.26)
    }
    const pb: Playback = {
      revealed, previous, blend: 1 - Math.pow(1 - progress, 3), typing: this.typing.some(([a, b]) => t >= a && t <= b),
      shakeAngle: 0, indicator: true, bannerShown: 0, likers: {},
    }
    for (const item of this.typed) {
      const end = item.start + item.chars.length * item.per
      if (t >= item.start && t < end + 0.2) {
        const shown = Math.min(item.chars.length, Math.floor((t - item.start) / item.per) + 1)
        pb.composer = item.chars.slice(0, shown).join('')
        break
      }
    }
    const note = [...this.banners].reverse().find(b => t >= b.start && t < b.end + BANNER_SLIDE)
    if (note) {
      const slideIn = Math.min(1, (t - note.start) / BANNER_SLIDE)
      const slideOut = Math.min(1, Math.max(0, (note.end + BANNER_SLIDE - t) / BANNER_SLIDE))
      pb.banner = note.id
      pb.bannerShown = 1 - Math.pow(1 - Math.min(slideIn, slideOut), 3)
    }
    for (const like of this.likes) {
      if (like.time <= t) pb.likers[like.post] = Math.max(pb.likers[like.post] ?? 0, like.count)
      else if (pb.likers[like.post] === undefined) pb.likers[like.post] = 0
    }
    const s = [...this.streams].reverse().find(x => t >= x.appear && t < x.to)
    if (s) {
      const pulse = t - s.appear
      if (t < s.from) pb.stream = { id: s.id, pulse }
      else {
        const progress = (t - s.from) / Math.max(s.to - s.from, 0.001)
        const step = 4
        const shown = (Math.floor((s.total * progress) / step) + 1) * step
        pb.stream = { id: s.id, chars: Math.min(s.total, Math.max(1, shown)), pulse }
      }
    }
    for (const sh of this.shakes) {
      if (t >= sh.time && t < sh.time + 0.6) {
        const dt = t - sh.time
        pb.shake = sh.person
        pb.shakeAngle = Math.sin(dt * 38) * 9 * (1 - dt / 0.6)
      }
    }
    return pb
  }
}
