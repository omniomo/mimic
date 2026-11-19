// The avatar library: accounts (a name + an avatar) shared by every project. Fill one into any person at any time.

import { useSyncExternalStore } from 'react'
import { dbGet, dbPut } from './db'
import { CRITTERS, critterIndex, freshCritter } from '../model/project'
import { uid } from '../model/types'

export interface Persona {
  id: string
  name: string
  avatar?: string
  color: number
}

const STARTER = ['小满', '梨先不削', '阿椰', '半格电', '卷卷没醒', '周三不上线', '不要葱谢谢', '缓冲中',
  'nori.jpeg', 'outofmiso', 'tabhoarder', 'soup.dev']

let personas: Persona[] = STARTER.map((name, i) => ({ id: uid(), name, color: i }))
let loaded = false
const listeners = new Set<() => void>()
let saveTimer: number | undefined

function emit() { listeners.forEach(l => l()) }

function save() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { void dbPut('kv', personas, 'library') }, 300)
}

export async function loadLibrary() {
  if (loaded) return
  loaded = true
  const saved = await dbGet<Persona[]>('kv', 'library').catch(() => undefined)
  if (saved && Array.isArray(saved)) {
    personas = saved
    // Accounts without a picture are each a different critter.
    const seen = new Set<number>()
    for (const p of personas) {
      if (p.avatar) continue
      if (seen.has(critterIndex(p.color))) p.color = freshCritter(personas.map(x => x.color))
      seen.add(critterIndex(p.color))
    }
    emit()
  }
}

export const library = {
  all: () => personas,
  get: (id: string) => personas.find(p => p.id === id),
  match: (name: string) => personas.find(p => p.name.toLowerCase() === name.toLowerCase()),
  add(name: string, avatar?: string): string {
    const p: Persona = { id: uid(), name: name.slice(0, 35), avatar, color: freshCritter(personas.map(x => x.color)) }
    personas = [...personas, p]
    save(); emit()
    return p.id
  },
  update(id: string, change: (p: Persona) => Persona) {
    personas = personas.map(p => (p.id === id ? change({ ...p }) : p))
    save(); emit()
  },
  remove(id: string) {
    personas = personas.filter(p => p.id !== id)
    save(); emit()
  },
  move(id: string, before: string) {
    if (id === before) return
    const item = personas.find(p => p.id === id)
    if (!item) return
    const rest = personas.filter(p => p.id !== id)
    const at = rest.findIndex(p => p.id === before)
    rest.splice(at < 0 ? rest.length : at, 0, item)
    personas = rest
    save(); emit()
  },
  /** Accounts not yet in this conversation, the ones with real pictures first. */
  pick(count: number, avoiding: Set<string>): Persona[] {
    const fresh = personas.filter(p => !avoiding.has(p.name)).sort(() => Math.random() - 0.5)
    return [...fresh.filter(p => p.avatar), ...fresh.filter(p => !p.avatar)].slice(0, count)
  },
}

export function useLibrary() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => personas)
}

export const critterCount = CRITTERS.length
