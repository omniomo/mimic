// What the export buttons do: render, then hand the files over (download, a .zip for several, or the share sheet on phones).

import type { Studio } from '../store/studio'
import { cards, entryImage, longImage, screenshots, stickers, saveThumbnail } from './images'
import { zip } from './zip'
import { download, exportFile, fileName, projectTitle } from '../app/projects'
import { cancelExport } from '../store/studio'
import { t } from '../i18n'

async function deliver(files: { name: string; blob: Blob }[], base: string) {
  if (!files.length) return
  const shareable = files.map(f => new File([f.blob], f.name, { type: f.blob.type }))
  const touch = matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: shareable })) {
    try { await navigator.share({ files: shareable }); return } catch { /* cancelled or not allowed: fall back to download */ }
  }
  if (files.length === 1) { download(files[0].blob, files[0].name); return }
  download(await zip(files), fileName(base, 'zip'))
}

async function job(studio: Studio, label: string, run: (progress: (done: number, total: number) => void) => Promise<void>) {
  cancelExport.current = false
  studio.store.set({ exporting: { label, done: 0, total: 1 } })
  try {
    await run((done, total) => { if (!cancelExport.current) studio.store.set({ exporting: { label, done, total } }) })
    if (!cancelExport.current) studio.sound('shutter')
  } catch (err) {
    if (!cancelExport.current) {
      console.error(err)
      const msg = err instanceof Error && err.message === 'no-webcodecs'
        ? t('This browser can’t encode video. Try a recent Chrome, Edge or Safari.')
        : t('Export failed. Try again.')
      studio.say(msg)
    }
  } finally {
    studio.store.set({ exporting: undefined })
  }
}

const base = (studio: Studio) => projectTitle(studio.project)

export async function exportScreenshotNow(studio: Studio) {
  const p = studio.project
  await job(studio, t('Screenshot'), async progress => {
    const shots = await screenshots(p, 3, progress)
    const b = base(studio)
    await deliver(shots.map((blob, i) => ({ blob, name: fileName(shots.length > 1 ? `${b} ${i + 1}` : b, 'png') })), b)
  })
  void saveThumbnail(studio.s.projectId, p)
}

export async function exportLongNow(studio: Studio) {
  await job(studio, t('Long image'), async () => {
    const blob = await longImage(studio.project)
    await deliver([{ blob, name: fileName(`${base(studio)} long`, 'png') }], base(studio))
  })
}

export async function exportCardsNow(studio: Studio) {
  await job(studio, t('Cards'), async () => {
    const list = await cards(studio.project)
    await deliver(list.map((blob, i) => ({ blob, name: fileName(`${base(studio)} ${i + 1}`, 'png') })), base(studio))
  })
}

export async function exportStickersNow(studio: Studio) {
  await job(studio, t('Stickers'), async () => {
    const list = await stickers(studio.project)
    await deliver(list.map((blob, i) => ({ blob, name: fileName(`${base(studio)} sticker ${i + 1}`, 'png') })), base(studio))
  })
}

export async function exportEntryNow(studio: Studio, id: string) {
  await job(studio, t('Save as image'), async () => {
    const blob = await entryImage(studio.project, id)
    await deliver([{ blob, name: fileName(`${base(studio)} item`, 'png') }], base(studio))
  })
}

export async function exportVideoNow(studio: Studio, typing = true) {
  const p = studio.project
  await job(studio, t('Video'), async progress => {
    const { renderVideo } = await import('../video/video')
    const out = await renderVideo(p, typing, progress, () => cancelExport.current)
    const b = base(studio)
    const files = [{ blob: out.mp4, name: fileName(b, 'mp4') }]
    if (out.wav) {
      files.push({ blob: out.wav, name: fileName(`${b} sound`, 'wav') })
      studio.say(t('This browser can’t encode AAC: the sound is a separate WAV.'))
    }
    await deliver(files, b)
  })
}

export async function exportProjectFile(studio: Studio) {
  const blob = await exportFile(studio.project)
  download(blob, fileName(base(studio), 'mimic'))
}
