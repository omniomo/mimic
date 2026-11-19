// Still images: a screenshot (one screen, or screen by screen when it doesn't fit), a long image, cards, one entry.

import { createElement } from 'react'
import { Phone, PHONE_H, PHONE_W, messageArea } from '../scene/Phone'
import { screenSlices, screenWindows, type ScreenWindow } from '../scene/paging'
import { Offscreen, canvasBlob, prepare, snapshot } from './render'
import { isAssistant, projectRules, threadsOf, visibleEntries } from '../model/rules'
import { stillPlayback } from '../video/timeline'
import { putBlob } from '../store/assets'
import type { Project } from '../model/types'
import { StickerCard } from '../scene/StickerCard'

export const SCALE = 3

/** Measure each row's height as drawn on a whole page (and where AI answers may be cut). */
async function measure(view: Offscreen, p: Project) {
  const el = await view.render(createElement(Phone, { p, mode: 'page' }))
  const rows = el.querySelector('.rows') as HTMLElement
  const kids = (Array.from(rows.children) as HTMLElement[]).filter(k => k.dataset.row !== undefined || k.classList.contains('fresh'))
  const heights = kids.map(k => k.offsetHeight)
  const lead = (rows.querySelector('[data-lead]') as HTMLElement | null)?.offsetHeight ?? 0
  const cuts = kids.map(k => Array.from(k.querySelectorAll<HTMLElement>('[data-cut]')).map(c => c.offsetTop))
  return { heights, lead, cuts }
}

export async function screenWindowsOf(view: Offscreen, p: Project): Promise<ScreenWindow[]> {
  const { heights, lead, cuts } = await measure(view, p)
  const available = messageArea(p)
  if (isAssistant(projectRules(p))) return screenSlices(heights, cuts, available)
  return screenWindows(heights, available, visibleEntries(p).map(e => e.kind === 'time'), lead)
}

/** How many screens "Screenshot" gives right now (the export panel says "Screen" or "Screens"). */
export async function screenCount(p: Project): Promise<number> {
  const view = new Offscreen()
  try {
    return Math.max(1, (await screenWindowsOf(view, p)).length)
  } finally {
    view.dispose()
  }
}

/** A screenshot: one screen if everything fits, otherwise one per screen. */
export async function screenshots(p: Project, scale = SCALE, onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
  await prepare(p)
  const view = new Offscreen()
  try {
    const windows = await screenWindowsOf(view, p)
    const out: Blob[] = []
    if (windows.length <= 1) {
      const el = await view.render(createElement(Phone, { p, mode: 'screen', playback: stillPlayback(p) }))
      out.push(await canvasBlob(await snapshot(el, { scale, width: PHONE_W, height: PHONE_H })))
      onProgress?.(1, 1)
      return out
    }
    for (const [i, w] of windows.entries()) {
      const el = await view.render(createElement(Phone, { p, mode: 'screen', window: w }))
      out.push(await canvasBlob(await snapshot(el, { scale, width: PHONE_W, height: PHONE_H })))
      onProgress?.(i + 1, windows.length)
    }
    return out
  } finally {
    view.dispose()
  }
}

export async function longImage(p: Project, scale = SCALE): Promise<Blob> {
  await prepare(p)
  const view = new Offscreen()
  try {
    const el = await view.render(createElement(Phone, { p, mode: 'page' }))
    // Very tall pages are limited by the browser's canvas size; scale down if needed.
    const h = el.offsetHeight
    const safe = Math.min(scale, 16000 / h)
    return await canvasBlob(await snapshot(el, { scale: safe, width: PHONE_W, height: h }))
  } finally {
    view.dispose()
  }
}

/** Cards layout: each top-level comment with its replies, 390 wide, the app's own background. */
export async function cards(p: Project, scale = SCALE): Promise<Blob[]> {
  await prepare(p)
  const view = new Offscreen()
  try {
    const out: Blob[] = []
    const lead = p.template === 'xiaohongshu' && p.hideLead !== true
    if (lead) {
      const el = await view.render(createElement(Phone, { p: { ...p, entries: [] }, mode: 'page', variant: 'card' }))
      out.push(await canvasBlob(await snapshot(el, { scale })))
    }
    for (const thread of threadsOf(p)) {
      const el = await view.render(createElement(Phone, { p: { ...p, entries: thread, hideLead: true }, mode: 'page', variant: 'card' }))
      out.push(await canvasBlob(await snapshot(el, { scale })))
    }
    return out
  } finally {
    view.dispose()
  }
}

/** Douyin / TikTok stickers: each top-level comment as a "Reply to …'s comment" sticker, transparent PNG. */
export async function stickers(p: Project, scale = SCALE): Promise<Blob[]> {
  await prepare(p)
  const view = new Offscreen()
  try {
    const out: Blob[] = []
    for (const thread of threadsOf(p)) {
      const el = await view.render(createElement(StickerCard, { p, e: thread[0] }))
      out.push(await canvasBlob(await snapshot(el, { scale, transparent: true })))
    }
    return out
  } finally {
    view.dispose()
  }
}

/** Just this entry, on a transparent background. */
export async function entryImage(p: Project, id: string, scale = SCALE): Promise<Blob> {
  await prepare(p)
  const view = new Offscreen()
  try {
    const e = p.entries.find(x => x.id === id)
    const el = await view.render(createElement(Phone, { p: { ...p, entries: e ? [e] : [], hideLead: true }, mode: 'page', variant: 'card', className: 'isolated' }))
    return await canvasBlob(await snapshot(el, { scale, transparent: true }))
  } finally {
    view.dispose()
  }
}

/** Small first-screen picture for the works page. */
export async function saveThumbnail(id: string, p: Project) {
  try {
    await prepare(p)
    const view = new Offscreen()
    try {
      const el = await view.render(createElement(Phone, { p, mode: 'screen', playback: stillPlayback(p) }))
      const canvas = await snapshot(el, { scale: 0.75, width: PHONE_W, height: PHONE_H })
      await putBlob(await canvasBlob(canvas, 'image/jpeg', 0.85), `thumb-${id}`)
    } finally {
      view.dispose()
    }
  } catch { /* a thumbnail is optional */ }
}
