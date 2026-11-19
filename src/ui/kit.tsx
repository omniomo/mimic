// The editor's parts, as in the app's design system: icon buttons without a background (filled = ink circle),
// panel cells, panel rows, pill pickers, hairlines, the ink ring of the person speaking, and panel placement.

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Anchor } from '../store/studio'
import { critterURL } from '../model/project'
import { useAsset } from '../store/assets'
import type { Person, Template } from '../model/types'
import { Lu, type LuName } from './icons'

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

/** Mouse and trackpad: the Mac app's way (right-click, hover "+"). Touch: the iPad / iPhone way (toolbars). */
export const desktop = typeof matchMedia === 'function' ? matchMedia('(pointer: fine)').matches : true

/** Icon-only button: no background; `filled` is an ink circle with a white glyph (export, new). */
export function GlyphButton({ icon, title, size = 36, glyph = 17, filled, tint, onClick, disabled, className, style, children, anchor }: {
  icon?: LuName; title: string; size?: number; glyph?: number; filled?: boolean; tint?: string; onClick?: (ev: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean; className?: string; style?: CSSProperties; children?: ReactNode; anchor?: string
}) {
  return (
    <button className={cx('gb', filled && 'filled', className)} title={title} aria-label={title} disabled={disabled} data-anchor={anchor}
      style={{ width: size, height: size, color: filled ? undefined : tint, ...style }}
      onClick={ev => { ev.stopPropagation(); onClick?.(ev) }}>
      {children ?? (icon && <Lu name={icon} size={glyph} strokeWidth={filled ? 2 : 1.75} />)}
    </button>
  )
}

/** A cell in a panel: only an icon; a faint background when pressed; `on` is ink with a white icon. */
export function Cell({ icon, title, on, size = 40, glyph = 19, tint, onClick, children }: {
  icon?: LuName; title: string; on?: boolean; size?: number; glyph?: number; tint?: string; onClick: () => void; children?: ReactNode
}) {
  return (
    <button className={cx('cell', on && 'on')} title={title} aria-label={title} aria-pressed={on}
      style={{ width: size, height: size, borderRadius: Math.min(10, size * 0.28), color: on ? undefined : tint }}
      onClick={ev => { ev.stopPropagation(); onClick() }}>
      {children ?? (icon && <Lu name={icon} size={glyph} strokeWidth={1.6} />)}
    </button>
  )
}

/** A row in a panel: icon, words, a little text or a check on the right. */
export function PanelRow({ title, icon, tint, on, trailing, onClick, height = 34, anchor, children }: {
  title: string; icon: LuName; tint?: string; on?: boolean; trailing?: string; onClick: (ev: React.MouseEvent<HTMLButtonElement>) => void; height?: number; anchor?: string; children?: ReactNode
}) {
  return (
    <button className="prow" style={{ minHeight: height, color: tint }} data-anchor={anchor} onClick={ev => { ev.stopPropagation(); onClick(ev) }}>
      <span className="prow-icon"><Lu name={icon} size={15} /></span>
      {children ?? <span className="prow-title">{title}</span>}
      <span className="prow-space" />
      {trailing && <span className="prow-trailing">{trailing}</span>}
      {on && <Lu name="check" size={12} strokeWidth={2.6} />}
    </button>
  )
}

/** A row of little pills; the chosen one is ink. Language, arrangement, append / replace. */
export function PillPicker<T extends string | boolean>({ options, value, icon, onPick, bare }: {
  options: { value: T; title: string }[]; value: T; icon?: LuName; onPick: (v: T) => void; bare?: boolean
}) {
  return (
    <div className={cx('pills', bare && 'bare')}>
      {icon && <span className="prow-icon gray"><Lu name={icon} size={15} /></span>}
      <div className="pills-track">
        {options.map(o => (
          <button key={String(o.value)} className={cx('pill', o.value === value && 'on')} onClick={ev => { ev.stopPropagation(); onPick(o.value) }}>{o.title}</button>
        ))}
      </div>
    </div>
  )
}

export const HairLine = ({ inset = 12, gap = 0 }: { inset?: number; gap?: number }) => (
  <div className="hairline" style={{ marginLeft: inset, marginRight: inset, marginTop: gap, marginBottom: gap }} />
)

export const Separator = () => <span className="sep" />

/** An avatar as the editor draws it (round, or WeChat's square), with the ink ring of the one speaking. */
export function Face({ person, size, square, ring, className, style }: {
  person: Pick<Person, 'avatar' | 'color'>; size: number; square?: boolean; ring?: boolean; className?: string; style?: CSSProperties
}) {
  const url = useAsset(person.avatar) ?? critterURL(person.color)
  const radius = square ? size * 0.1 : size / 2
  return (
    <span className={cx('face', className)} style={{ width: size, height: size, ...style }}>
      <img src={url} alt="" draggable={false} style={{ borderRadius: radius }} />
      {ring && <i className="ink-ring" style={{ borderRadius: radius + 3.5 }} />}
    </span>
  )
}

/** The AI in an AI chat: "AI" in serif on an ink circle. */
export const AssistantMark = ({ size, ring }: { size: number; ring?: boolean }) => (
  <span className="face ai-mark" style={{ width: size, height: size, fontSize: size * 0.38 }}>
    AI{ring && <i className="ink-ring" style={{ borderRadius: size / 2 + 3.5 }} />}
  </span>
)

/** Each scene's icon. No platform's logo. */
export const TEMPLATE_GLYPH: Record<Template, LuName> = {
  wechatGroup: 'messages', wechatDirect: 'messageCircle', bilibili: 'messageText',
  instagramDirect: 'send', instagramComments: 'messageHeart', instagramGroup: 'send',
  imessageDirect: 'message', imessageGroup: 'users', whatsappDirect: 'phone', whatsappGroup: 'usersRound',
  telegramDirect: 'messageCircle', telegramGroup: 'users', youtube: 'squarePlay', tiktok: 'music',
  wechatMoments: 'aperture', douyin: 'listMusic', xiaohongshu: 'bookOpen', snapchatDirect: 'camera',
  snapchatGroup: 'users', discord: 'hash', chatgpt: 'messageMore', gemini: 'search', deepseek: 'brain',
}

// MARK: placement

/** Panels grow out of the spot that opened them: below it, or above when there's no room; inside the window.
 *  `left`: Moments' Like | Comment sits to the left of the "··", centered on it. */
export function usePlacement(anchor: Anchor | undefined, opts: { left?: boolean; above?: boolean; gap?: number } = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPosState] = useState<{ left: number; top: number; origin: string }>({ left: -9999, top: -9999, origin: 'top left' })
  const setPos = (next: { left: number; top: number; origin: string }) => {
    setPosState(old => (Math.abs(old.left - next.left) < 0.5 && Math.abs(old.top - next.top) < 0.5 && old.origin === next.origin ? old : next))
  }
  const margin = 10
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !anchor) return
    const w = el.offsetWidth, h = el.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight
    const gap = opts.gap ?? 8
    if (opts.left) {
      const left = Math.max(margin, anchor.x - w)
      const top = Math.min(Math.max(anchor.y + anchor.h / 2 - h / 2, margin), Math.max(margin, vh - margin - h))
      setPos({ left, top, origin: 'right center' })
      return
    }
    let left = anchor.x + anchor.w / 2 > vw * 0.62 ? anchor.x + anchor.w - w : anchor.x
    if (anchor.w > w) left = anchor.x + anchor.w / 2 - w / 2
    left = Math.min(Math.max(left, margin), Math.max(margin, vw - margin - w))
    let top: number
    let below = true
    if (opts.above) {
      top = anchor.y - gap - h
      if (top < margin) { top = anchor.y + anchor.h + gap } else below = false
    } else {
      top = anchor.y + anchor.h + gap
      if (top + h > vh - margin && anchor.y - gap - h > margin) { top = anchor.y - gap - h; below = false }
    }
    top = Math.min(Math.max(top, margin), Math.max(margin, vh - margin - h))
    const ox = Math.min(Math.max(anchor.x + anchor.w / 2 - left, 0), w)
    setPos({ left, top, origin: `${ox}px ${below ? '0' : '100%'}` })
  })
  return { ref, style: { left: pos.left, top: pos.top, transformOrigin: pos.origin } as CSSProperties }
}
