import type { FC } from 'react'
import type { RowProps } from './context'
import type { Entry, Project } from '../model/types'

export interface ComposerProps {
  /** Video: the text being typed so far. */
  typed?: string
  /** A real input (editing on the workbench). */
  live: boolean
  /** Video: an AI answer is streaming (send turns into stop). */
  busy?: boolean
}

/** A skin only draws: navigation bar, composer, one row. What exists in the scene is decided by rules.ts. */
export interface Skin {
  /** Root class, e.g. "sk-wechat". Skin CSS is scoped under it. */
  className: string
  navHeight: number | ((p: Project) => number)
  composerHeight: number | ((p: Project) => number)
  /** Message-area color. */
  wall: (dark: boolean) => string
  /** Composer background (defaults to wall). */
  bar?: (dark: boolean) => string
  /** A hairline above the composer. */
  divider?: boolean
  /** Status bar over a dark video (Douyin, TikTok). */
  darkStatus?: boolean
  /** Inset above the first and below the last row. */
  insets?: { top: number; bottom: number }
  Nav: FC<{ typing?: boolean; overCover?: boolean }>
  Composer: FC<ComposerProps>
  Row: FC<RowProps>
  Notice?: FC<RowProps>
  /** Content before the rows that scrolls with them (Moments cover, Xiaohongshu note). */
  Lead?: FC<{ underNav: number }>
  /** Default chat background when no wallpaper is set. */
  Backdrop?: FC<{}>
  /** The other side is typing (a bubble row). */
  Typing?: FC<{}>
  /** Moments: status + nav drawn transparent over the cover while it's on screen. */
  navOverLead?: boolean
  /** Douyin / TikTok: a top-level comment as a "Reply to …'s comment" sticker. */
  Sticker?: FC<{ e: Entry }>
}

export const sizeOf = (v: number | ((p: Project) => number), p: Project) => (typeof v === 'number' ? v : v(p))
