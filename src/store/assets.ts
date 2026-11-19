// Images live once in IndexedDB as Blobs and are referenced by id from projects and the library.
// Rendering needs a URL synchronously, so loaded images are kept as object URLs in memory.

import { useSyncExternalStore } from 'react'
import { dbGet, dbPut } from './db'
import { uid } from '../model/types'

const urls = new Map<string, string>()
const blobs = new Map<string, Blob>()
const loading = new Map<string, Promise<string | undefined>>()
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version++
  listeners.forEach(l => l())
}

export function assetURL(id: string | undefined): string | undefined {
  if (!id) return undefined
  const hit = urls.get(id)
  if (hit) return hit
  void loadAsset(id)
  return undefined
}

export function assetBlob(id: string) { return blobs.get(id) }

export function loadAsset(id: string): Promise<string | undefined> {
  const hit = urls.get(id)
  if (hit) return Promise.resolve(hit)
  let job = loading.get(id)
  if (!job) {
    job = dbGet<Blob>('assets', id).then(blob => {
      if (!blob) return undefined
      const url = URL.createObjectURL(blob)
      urls.set(id, url)
      blobs.set(id, blob)
      changed()
      return url
    }).catch(() => undefined)
    loading.set(id, job)
  }
  return job
}

/** Re-render when any image finishes loading. */
export function useAssetVersion() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => version)
}

export function useAsset(id: string | undefined) {
  useAssetVersion()
  return assetURL(id)
}

export async function preloadAssets(ids: (string | undefined)[]) {
  await Promise.all(ids.filter((x): x is string => !!x).map(loadAsset))
}

export async function putBlob(blob: Blob, id = uid()): Promise<string> {
  await dbPut('assets', blob, id)
  urls.set(id, URL.createObjectURL(blob))
  blobs.set(id, blob)
  changed()
  return id
}

/** Downscale to at most `maxPixels` on the longest side. PNG/WebP/GIF keep transparency, photos become JPEG. */
export async function importImage(file: Blob, maxPixels: number): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxPixels / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const transparent = /png|webp|gif/.test(file.type)
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), transparent ? 'image/png' : 'image/jpeg', 0.9))
  return putBlob(out)
}

export async function dataURLToAsset(dataURL: string): Promise<string> {
  const blob = await (await fetch(dataURL)).blob()
  return putBlob(blob)
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export const MAX_PIXELS = {
  photo: 1080, sticker: 480, wallpaper: 1600, cover: 1600, avatar: 240,
} as const
