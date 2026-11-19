import { createContext, useContext } from 'react'
import type { Rules } from '../model/rules'
import type { Entry, Platform, Project } from '../model/types'
import type { Studio } from '../store/studio'

/** Everything a skin needs to draw one frame. Built once per render of the phone. */
export interface Scene {
  p: Project
  rules: Rules
  pl: Platform
  zh: boolean
  dark: boolean
  /** "Me" in this scene (undefined in comment sections). */
  viewer?: string
  /** Entries drawn, in order. */
  list: Entry[]
  /** WhatsApp / Telegram per-message clocks. */
  dates: Map<string, number>
  /** iMessage / Snapchat: the entry that carries "Delivered / Read". */
  holder?: string
  /** Editing on the workbench (double-click to edit, drag & drop…). False for exports and playback. */
  live: boolean
  studio: Studio | null
  /** Rendering a video frame: AI answer streaming. */
  stream?: { id: string; chars?: number; pulse: number }
  /** Moments: how many likers are visible per post (video). */
  likers?: Record<string, number>
  /** Who is shaking (pat) and by how much (video). */
  shake?: { person: string; angle: number }
  tx: (zh: string, en: string) => string
}

export const SceneContext = createContext<Scene | null>(null)

export function useScene(): Scene {
  const s = useContext(SceneContext)
  if (!s) throw new Error('useScene outside a phone')
  return s
}

export interface RowProps {
  e: Entry
  prev?: Entry
  next?: Entry
  /** Exporting this entry alone (transparent background): no separators, no indents. */
  isolated?: boolean
  /** Inside a card (cards layout): the last one has no separator. */
  inCard?: boolean
}
