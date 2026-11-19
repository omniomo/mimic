// The project library: everything stored in IndexedDB, plus import/export of .mimic files
// (both this web format and files saved by the old Mac/iOS app).

import { useSyncExternalStore } from 'react'
import { dbAll, dbDelete, dbGet, dbPut } from '../store/db'
import { assetBlob, blobToDataURL, dataURLToAsset, loadAsset, putBlob } from '../store/assets'
import { blankProject, validate } from '../model/project'
import { DISPLAY_NAME } from '../model/templates'
import { exampleProject } from '../model/examples'
import { TEMPLATES, type Project, type Template, uid } from '../model/types'

export interface ProjectRecord {
  id: string
  title: string
  template: Template
  updated: number
  project: Project
}

export interface ProjectMeta { id: string; title: string; template: Template; updated: number }

let metas: ProjectMeta[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export function useProjects() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => metas)
}

const toMeta = (r: ProjectRecord): ProjectMeta => ({ id: r.id, title: r.title, template: r.template, updated: r.updated })

export async function loadProjects() {
  const all = await dbAll<ProjectRecord>('projects').catch(() => [])
  metas = all.map(toMeta).sort((a, b) => b.updated - a.updated)
  emit()
}

export async function getProject(id: string) {
  return (await dbGet<ProjectRecord>('projects', id))?.project
}

export function projectTitle(p: Project) {
  return p.title || DISPLAY_NAME[p.template]
}

const timers = new Map<string, number>()

/** Debounced save (called on every change). */
export function saveProject(id: string, p: Project, now = false) {
  window.clearTimeout(timers.get(id))
  const write = async () => {
    timers.delete(id)
    const record: ProjectRecord = { id, title: projectTitle(p), template: p.template, updated: Date.now(), project: p }
    await dbPut('projects', record)
    metas = [toMeta(record), ...metas.filter(m => m.id !== id)]
    emit()
  }
  if (now) return write()
  timers.set(id, window.setTimeout(() => void write(), 400))
  return Promise.resolve()
}

export async function createProject(template: Template, example = false) {
  const id = uid()
  await saveProject(id, example ? exampleProject(template) : blankProject(template), true)
  return id
}

export async function duplicateProject(id: string, suffix: string) {
  const p = await getProject(id)
  if (!p) return
  const copy = structuredClone(p)
  copy.title = p.title ? `${p.title} ${suffix}` : p.title
  const next = uid()
  await saveProject(next, copy, true)
  const thumb = assetBlob(`thumb-${id}`)
  if (thumb) await putBlob(thumb, `thumb-${next}`)
  return next
}

export async function renameProject(id: string, title: string) {
  const p = await getProject(id)
  if (!p) return
  await saveProject(id, { ...p, title }, true)
}

/** Delete, returning a function that brings it back (the toast's Undo). */
export async function deleteProject(id: string) {
  const record = await dbGet<ProjectRecord>('projects', id)
  await dbDelete('projects', id)
  metas = metas.filter(m => m.id !== id)
  emit()
  return async () => {
    if (!record) return
    await dbPut('projects', record)
    metas = [toMeta(record), ...metas].sort((a, b) => b.updated - a.updated)
    emit()
  }
}

// MARK: .mimic files

interface WebFile { format: 'mimic'; version: number; project: Project; assets: Record<string, string> }

function refsOf(p: Project): string[] {
  const out = [p.wallpaper, p.cover, p.viewerAvatar, ...(p.noteImages ?? []), ...p.people.map(x => x.avatar)]
  for (const e of p.entries) out.push(e.image, ...(e.gallery ?? []))
  return out.filter((x): x is string => !!x)
}

export async function exportFile(p: Project): Promise<Blob> {
  const assets: Record<string, string> = {}
  for (const ref of new Set(refsOf(p))) {
    await loadAsset(ref)
    const blob = assetBlob(ref)
    if (blob) assets[ref] = await blobToDataURL(blob)
  }
  const file: WebFile = { format: 'mimic', version: 1, project: p, assets }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

/** Reads a .mimic file from this app or from the old native app. Returns the new project id. */
export async function importFile(file: Blob): Promise<string> {
  const json = JSON.parse(await file.text())
  const p = json?.format === 'mimic' ? await fromWeb(json as WebFile) : await fromNative(json)
  validate(p)
  const id = uid()
  await saveProject(id, p, true)
  return id
}

async function fromWeb(file: WebFile): Promise<Project> {
  const map = new Map<string, string>()
  for (const [ref, data] of Object.entries(file.assets ?? {})) map.set(ref, await dataURLToAsset(data))
  const p = file.project
  const swap = (ref?: string) => (ref ? map.get(ref) ?? ref : undefined)
  p.wallpaper = swap(p.wallpaper); p.cover = swap(p.cover); p.viewerAvatar = swap(p.viewerAvatar)
  p.noteImages = p.noteImages?.map(r => swap(r)!)
  for (const x of p.people) x.avatar = swap(x.avatar)
  for (const e of p.entries) { e.image = swap(e.image); e.gallery = e.gallery?.map(r => swap(r)!) }
  return p
}

/** The native app saved Swift's JSON: images as base64, dates as seconds since 2001-01-01. */
async function fromNative(raw: any): Promise<Project> {
  if (!raw || !Array.isArray(raw.people) || !Array.isArray(raw.entries) || !TEMPLATES.includes(raw.template)) throw new Error('invalid')
  const image = async (b64?: string) => (typeof b64 === 'string' && b64 ? dataURLToAsset(`data:image/png;base64,${b64}`) : undefined)
  const date = (v?: number) => (typeof v === 'number' ? Math.round((v + 978307200) * 1000) : undefined)
  const p: Project = { ...raw }
  p.wallpaper = await image(raw.wallpaper)
  p.cover = await image(raw.cover)
  p.viewerAvatar = await image(raw.viewerAvatar)
  p.noteImages = raw.noteImages ? await Promise.all(raw.noteImages.map(image)) : undefined
  p.today = date(raw.today)
  p.people = await Promise.all(raw.people.map(async (x: any) => ({ ...x, avatar: await image(x.avatar), level: x.level ?? '' })))
  p.entries = await Promise.all(raw.entries.map(async (e: any) => ({
    ...e, image: await image(e.image), gallery: e.gallery ? await Promise.all(e.gallery.map(image)) : undefined, date: date(e.date),
    metadata: e.metadata ?? '', likes: e.likes ?? '', quote: e.quote ?? '', isReply: !!e.isReply, isLiked: !!e.isLiked,
  })))
  return p
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function fileName(base: string, ext: string) {
  const safe = base.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Mimic'
  return `${safe}.${ext}`
}
