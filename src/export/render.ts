// Render React offscreen and turn DOM into pixels (via html-to-image: the DOM is serialized into an SVG foreignObject).

import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toCanvas } from 'html-to-image'
import { preloadAssets } from '../store/assets'
import type { Project } from '../model/types'

export function projectRefs(p: Project): string[] {
  const out = [p.wallpaper, p.cover, p.viewerAvatar, ...(p.noteImages ?? []), ...p.people.map(x => x.avatar)]
  for (const e of p.entries) out.push(e.image, ...(e.gallery ?? []))
  return out.filter((x): x is string => !!x)
}

export const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

export class Offscreen {
  private host = document.createElement('div')
  private root = createRoot(this.host)

  constructor() {
    this.host.className = 'offscreen'
    document.body.appendChild(this.host)
  }

  /** Render synchronously, then wait until every image has decoded. */
  async render(node: ReactNode): Promise<HTMLElement> {
    flushSync(() => this.root.render(node))
    await settleImages(this.host)
    return this.host.firstElementChild as HTMLElement
  }

  /** Render without waiting for images (they're already decoded from a previous frame). */
  renderNow(node: ReactNode): HTMLElement {
    flushSync(() => this.root.render(node))
    return this.host.firstElementChild as HTMLElement
  }

  dispose() {
    this.root.unmount()
    this.host.remove()
  }
}

export async function settleImages(el: HTMLElement) {
  const imgs = Array.from(el.querySelectorAll('img'))
  await Promise.all(imgs.map(img => (img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => undefined))))
  await nextFrame()
}

export async function prepare(p: Project) {
  await preloadAssets(projectRefs(p))
  try { await document.fonts?.ready } catch { /* ignore */ }
}

export interface SnapOptions { scale: number; width?: number; height?: number; transparent?: boolean }

export async function snapshot(el: HTMLElement, o: SnapOptions): Promise<HTMLCanvasElement> {
  const width = o.width ?? el.offsetWidth
  const height = o.height ?? el.offsetHeight
  return toCanvas(el, {
    pixelRatio: o.scale,
    width, height,
    canvasWidth: width, canvasHeight: height,
    skipFonts: true,
    cacheBust: false,
    backgroundColor: o.transparent ? undefined : undefined,
    style: { margin: '0', transform: 'none', left: '0', top: '0' },
  })
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), type, quality))
}
