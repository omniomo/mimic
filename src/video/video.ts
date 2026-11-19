// Export an MP4 (1080×2338, 30 fps, H.264 + AAC) entirely in the browser.
//
// Rendering every frame through the DOM would be slow, so frames are composited from a few snapshots:
// - a full snapshot for every distinct state (what's revealed, typing, likes, AI streaming, a nudge's wobble…),
// - while a new row pops in (0.26 s), the previous rows and the new row are drawn as separate layers and moved,
// - the composer while I type and the notification banner are small snapshots drawn on top.
// Encoding uses WebCodecs; the MP4 container is written by mp4.ts.

import { createElement } from 'react'
import { Phone, PHONE_H, PHONE_W } from '../scene/Phone'
import { Offscreen, prepare, settleImages, snapshot } from '../export/render'
import { Timeline, type Playback } from './timeline'
import { encodeAAC, mixTimeline } from './audio'
import { writeMP4, writeWAV, type Sample } from './mp4'
import { SAMPLE_RATE } from '../sound/board'
import type { Project } from '../model/types'

export const VIDEO_W = 1080
export const VIDEO_H = 2338
export const FPS = 30
const SCALE = VIDEO_W / PHONE_W

interface Geometry { bodyTop: number; bodyH: number; shift: number; newTop: number; newBottom: number; composerTop: number; composerH: number }
interface Shot { canvas: HTMLCanvasElement; geo: Geometry }

const CODECS = ['avc1.640033', 'avc1.640032', 'avc1.4d0033', 'avc1.4d0032', 'avc1.42003e', 'avc1.420033']

export async function videoSupport(): Promise<string | undefined> {
  if (typeof VideoEncoder === 'undefined') return undefined
  for (const codec of CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: VIDEO_W, height: VIDEO_H, bitrate: 10_000_000, framerate: FPS, avc: { format: 'avc' } })
      if (r.supported) return codec
    } catch { /* try next */ }
  }
  return undefined
}

export interface VideoResult { mp4: Blob; wav?: Blob }

export async function renderVideo(p: Project, typing: boolean, onProgress: (done: number, total: number) => void, cancelled: () => boolean): Promise<VideoResult> {
  const codec = await videoSupport()
  if (!codec) throw new Error('no-webcodecs')
  const tl = new Timeline(p, typing)
  const frames = Math.max(1, Math.ceil(tl.duration * FPS))
  await prepare(p)
  const view = new Offscreen()
  const frame = document.createElement('canvas')
  frame.width = VIDEO_W
  frame.height = VIDEO_H
  const ctx = frame.getContext('2d', { alpha: false })!
  ctx.imageSmoothingQuality = 'high'

  const samples: Sample[] = []
  let avcC: Uint8Array | undefined
  let failure: unknown
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      if (meta?.decoderConfig?.description && !avcC) avcC = bytes(meta.decoderConfig.description)
      samples.push({ data, duration: 1000, key: chunk.type === 'key' })
    },
    error: e => { failure = e },
  })
  encoder.configure({ codec, width: VIDEO_W, height: VIDEO_H, bitrate: 10_000_000, framerate: FPS, avc: { format: 'avc' }, latencyMode: 'quality' })

  // Snapshots, keyed by state. Only a handful are kept (they're ~10 MB each).
  const cache = new Map<string, Shot>()
  const remember = (key: string, shot: Shot) => {
    cache.set(key, shot)
    if (cache.size > 6) cache.delete(cache.keys().next().value!)
    return shot
  }
  const small = new Map<string, HTMLCanvasElement>()

  const render = async (pb: Playback, layer: 'full' | 'rows' | 'background', composer?: string) => {
    const el = view.renderNow(createElement(Phone, { p, mode: 'screen', playback: { ...pb, composer }, layer }))
    await settleImages(el)
    return el
  }
  const measure = (el: HTMLElement, pb: Playback): Geometry => {
    const body = el.querySelector('.body') as HTMLElement
    const rows = el.querySelector('.rows') as HTMLElement
    const kids = Array.from(rows.children) as HTMLElement[]
    const shift = -(new DOMMatrixReadOnly(getComputedStyle(rows).transform).m42 || 0)
    const leadN = rows.querySelector(':scope > [data-lead]') ? 1 : 0
    const first = kids[leadN + pb.previous]
    const last = kids[kids.length - 1]
    const composer = el.querySelector('.composer') as HTMLElement | null
    return {
      bodyTop: body.offsetTop, bodyH: body.offsetHeight, shift,
      newTop: first ? first.offsetTop : 0, newBottom: last ? last.offsetTop + last.offsetHeight : 0,
      composerTop: composer?.offsetTop ?? PHONE_H, composerH: composer?.offsetHeight ?? 0,
    }
  }
  const settled = (pb: Playback): Playback => ({ ...pb, previous: pb.revealed, blend: 1, banner: undefined, bannerShown: 0, composer: undefined })
  const keyOf = (pb: Playback) => [
    pb.revealed, pb.typing ? 1 : 0, pb.shake ?? '', Math.round(pb.shakeAngle), JSON.stringify(pb.likers),
    pb.stream ? `${pb.stream.id}:${pb.stream.chars ?? 'think'}:${pb.stream.chars === undefined ? Math.floor(pb.stream.pulse * 2) % 2 : ''}` : '',
  ].join('|')

  const full = async (pb: Playback): Promise<Shot> => {
    const s = settled(pb)
    const key = `full:${keyOf(s)}`
    const hit = cache.get(key)
    if (hit) return hit
    const el = await render(s, 'full')
    const geo = measure(el, s)
    return remember(key, { canvas: await snapshot(el, { scale: SCALE, width: PHONE_W, height: PHONE_H }), geo })
  }
  const rowsLayer = async (pb: Playback): Promise<Shot> => {
    const s = { ...settled(pb), previous: pb.previous }
    const key = `rows:${keyOf(s)}:${s.previous}`
    const hit = cache.get(key)
    if (hit) return hit
    const el = await render({ ...s, previous: s.revealed }, 'rows')
    const geo = measure(el, s)
    return remember(key, { canvas: await snapshot(el, { scale: SCALE, width: PHONE_W, height: PHONE_H }), geo })
  }
  let background: HTMLCanvasElement | undefined
  const backgroundLayer = async (pb: Playback) => {
    if (!background) background = await snapshot(await render(settled(pb), 'background'), { scale: SCALE, width: PHONE_W, height: PHONE_H })
    return background
  }
  const composerLayer = async (pb: Playback, text: string) => {
    const key = `composer:${text}`
    let hit = small.get(key)
    if (!hit) {
      const el = await render(settled(pb), 'full', text)
      const c = el.querySelector('.composer') as HTMLElement
      hit = await snapshot(c, { scale: SCALE })
      small.set(key, hit)
      if (small.size > 40) small.delete(small.keys().next().value!)
    }
    return hit
  }
  const bannerLayer = async (pb: Playback) => {
    const key = `banner:${pb.banner}`
    let hit = small.get(key)
    if (!hit) {
      const el = await render({ ...settled(pb), banner: pb.banner, bannerShown: 1 }, 'full')
      const b = el.querySelector('.banner-wrap') as HTMLElement
      hit = await snapshot(b, { scale: SCALE })
      small.set(key, hit)
    }
    return hit
  }

  const X = VIDEO_W / PHONE_W
  const Y = VIDEO_H / PHONE_H
  /** Copy a horizontal band of a snapshot (phone points) onto the frame at another y (phone points). */
  const draw = (src: HTMLCanvasElement, sy: number, sh: number, dy: number, alpha = 1) => {
    if (sh <= 0) return
    const k = src.height / PHONE_H
    ctx.globalAlpha = alpha
    ctx.drawImage(src, 0, sy * k, src.width, sh * k, 0, dy * Y, VIDEO_W, sh * Y)
    ctx.globalAlpha = 1
  }

  try {
    let lastKey = ''
    for (let f = 0; f < frames; f++) {
      if (cancelled()) throw new Error('cancelled')
      if (failure) throw failure
      const t = f / FPS
      const pb = tl.frame(t)
      const frameKey = `${keyOf(pb)}|${pb.blend.toFixed(3)}|${pb.previous}|${pb.composer ?? ''}|${pb.banner ?? ''}:${pb.bannerShown.toFixed(3)}`
      if (frameKey !== lastKey) {
        lastKey = frameKey
        const cur = await full(pb)
        ctx.globalAlpha = 1
        ctx.drawImage(cur.canvas, 0, 0, VIDEO_W, VIDEO_H)
        const transitioning = pb.blend < 1 && pb.previous < pb.revealed && !pb.typing
        if (transitioning) {
          const prev = await rowsLayer({ ...pb, revealed: pb.previous, previous: pb.previous, blend: 1 })
          const now = await rowsLayer(pb)
          const bg = await backgroundLayer(pb)
          const g = now.geo
          const shiftB = prev.geo.shift + (g.shift - prev.geo.shift) * pb.blend
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, g.bodyTop * Y, VIDEO_W, g.bodyH * Y)
          ctx.clip()
          draw(bg, g.bodyTop, g.bodyH, g.bodyTop)
          // Previous rows, moving up.
          draw(prev.canvas, 0, PHONE_H, prev.geo.shift - shiftB)
          // The new rows, fading in and rising 12pt.
          const top = g.bodyTop + g.newTop - g.shift
          draw(now.canvas, top, g.newBottom - g.newTop, top + (g.shift - shiftB) + (1 - pb.blend) * 12, pb.blend)
          ctx.restore()
        }
        if (pb.composer) {
          const c = await composerLayer(pb, pb.composer)
          ctx.drawImage(c, 0, cur.geo.composerTop * Y, VIDEO_W, (c.height / (c.width / PHONE_W)) * Y)
        }
        if (pb.banner && pb.bannerShown > 0) {
          const b = await bannerLayer(pb)
          const w = b.width / SCALE, h = b.height / SCALE
          ctx.globalAlpha = Math.min(1, pb.bannerShown * 1.6)
          ctx.drawImage(b, 8 * X, (10 - 140 * (1 - pb.bannerShown)) * Y, w * X, h * Y)
          ctx.globalAlpha = 1
        }
      }
      while (encoder.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2))
      const vf = new VideoFrame(frame, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
      encoder.encode(vf, { keyFrame: f % (FPS * 2) === 0 })
      vf.close()
      if (f % 10 === 0) { onProgress(f, frames + 10); await new Promise(r => setTimeout(r, 0)) }
    }
    await encoder.flush()
    if (failure) throw failure
  } finally {
    try { encoder.close() } catch { /* closed */ }
    view.dispose()
  }
  if (!avcC) throw new Error('no-avcC')
  const mix = await mixTimeline(tl, frames / FPS)
  const audio = await encodeAAC(mix)
  onProgress(frames + 10, frames + 10)
  const mp4 = writeMP4({ width: VIDEO_W, height: VIDEO_H, timescale: FPS * 1000, avcC, samples }, audio)
  return { mp4, wav: audio ? undefined : writeWAV(mix, SAMPLE_RATE) }
}

function bytes(d: AllowSharedBufferSource): Uint8Array {
  if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0))
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength))
  return new Uint8Array(d as unknown as ArrayBuffer)
}
