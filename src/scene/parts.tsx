// Shared pieces every skin uses: editable text, avatars, images, the row wrapper, the status bar, gray notices.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type * as R from 'react'
import { useScene, type RowProps } from './context'
import { useAsset } from '../store/assets'
import { isNumericKey, useStudio, useStudioRef, type Studio } from '../store/studio'
import { critterURL, noticeText } from '../model/project'
import { allows, has, holdsImage, isChat } from '../model/rules'
import { timeText } from '../model/time'
import type { Entry, Person } from '../model/types'
import { Io } from '../ui/icons'
import { listContinuation } from './markdown'

// MARK: drag & drop payloads

export type Payload = { type: 'persona' | 'person' | 'entry'; id: string }
const MIME = 'application/x-mimic'

export function setPayload(dt: DataTransfer, payload: Payload) {
  dt.setData(MIME, JSON.stringify(payload))
  dt.setData('text/plain', '')
  dt.effectAllowed = 'copyMove'
}

export function readPayload(dt: DataTransfer): Payload | undefined {
  try { const raw = dt.getData(MIME); return raw ? JSON.parse(raw) : undefined } catch { return undefined }
}

export const hasPayload = (dt: DataTransfer) => dt.types.includes(MIME)
export const imageFile = (dt: DataTransfer) => Array.from(dt.files).find(f => f.type.startsWith('image/'))
const accepts = (dt: DataTransfer) => hasPayload(dt) || dt.types.includes('Files')

/** Drag-over highlight + drop for any target. The element gets data-drop while something hovers it. */
export function dropHandlers(studio: Studio | null, onDrop: (dt: DataTransfer) => boolean | void) {
  if (!studio) return {}
  return {
    onDragOver: (ev: R.DragEvent<HTMLElement>) => {
      if (!accepts(ev.dataTransfer)) return
      ev.preventDefault()
      ev.stopPropagation()
      const el = ev.currentTarget
      if (!el.hasAttribute('data-drop')) { el.setAttribute('data-drop', ''); studio.sound('target') }
    },
    onDragLeave: (ev: R.DragEvent<HTMLElement>) => {
      if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) ev.currentTarget.removeAttribute('data-drop')
    },
    onDrop: (ev: R.DragEvent<HTMLElement>) => {
      ev.currentTarget.removeAttribute('data-drop')
      if (!accepts(ev.dataTransfer)) return
      ev.preventDefault()
      ev.stopPropagation()
      if (onDrop(ev.dataTransfer) === false) studio.sound('reject')
    },
  }
}

// MARK: editable text

interface EdProps {
  k: string
  value: string
  className?: string
  style?: CSSProperties
  multiline?: boolean
  /** Text to start editing from (defaults to value). */
  start?: string
  /** Shown faintly when the value is empty and not editing (editor only). */
  placeholder?: string
  /** Markdown source (AI answers): Enter is a new line (continuing lists), ⌘Enter / Ctrl+Enter finishes. */
  markdown?: boolean
}

/** Plain text that turns into an in-place editor on double-click, with the exact same font and wrapping. */
export function Ed({ k, value, className, style, multiline = true, start, placeholder, markdown }: EdProps) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const editing = useStudio(s => s.editing === k, false) && !!studio
  if (editing && studio) return <EdField k={k} initial={start ?? value} className={className} style={style} multiline={multiline} markdown={markdown} studio={studio} />
  const shown = value || (studio && placeholder ? placeholder : '')
  return (
    <span className={cx(className, !value && studio && placeholder ? 'ed-ph' : undefined)} style={style}
      onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.beginEdit(k) } : undefined}>
      {shown}
    </span>
  )
}

function EdField({ k, initial, className, style, multiline, markdown, studio }: { k: string; initial: string; className?: string; style?: CSSProperties; multiline: boolean; markdown?: boolean; studio: Studio }) {
  const ref = useRef<HTMLSpanElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = initial
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    const commit = () => { if (!done.current) { done.current = true; studio.commit(k, text(el)) } }
    studio.registerCommit(commit)
    return () => { if (!done.current) { done.current = true; studio.commit(k, text(el)) } }
  }, [k])
  const text = (el: HTMLElement) => (el.innerText ?? el.textContent ?? '').replace(/ /g, ' ')
  return (
    <span ref={ref} className={cx(className, 'ed-live')} style={style} contentEditable="plaintext-only" suppressContentEditableWarning
      spellCheck={false} inputMode={isNumericKey(k) ? 'numeric' : undefined}
      onClick={ev => ev.stopPropagation()} onPointerDown={ev => ev.stopPropagation()} onDoubleClick={ev => ev.stopPropagation()}
      onKeyDown={ev => {
        ev.stopPropagation()
        if (ev.nativeEvent.isComposing || ev.nativeEvent.keyCode === 229) return
        if (ev.key === 'Escape') { ev.preventDefault(); done.current = true; studio.cancelEdit(k) }
        if (markdown && ev.key === 'Enter' && !(ev.metaKey || ev.ctrlKey)) {
          ev.preventDefault()
          const next = listContinuation(lineBeforeCaret(ev.currentTarget))
          if (next === '') {
            const sel = window.getSelection()
            const line = lineBeforeCaret(ev.currentTarget)
            for (let i = 0; i < [...line].length; i++) sel?.modify('extend', 'backward', 'character')
            document.execCommand('insertText', false, '')
          } else document.execCommand('insertText', false, '\n' + (next ?? ''))
          return
        }
        if (ev.key === 'Enter' && (!multiline || !ev.shiftKey)) {
          ev.preventDefault()
          done.current = true
          studio.commit(k, text(ev.currentTarget), true)
        }
      }}
      onBlur={ev => { if (!done.current) { done.current = true; studio.commit(k, text(ev.currentTarget)) } }}
      onPaste={ev => {
        ev.preventDefault()
        const plain = ev.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, multiline ? plain : plain.replace(/\s*\n\s*/g, ' '))
      }}
    />
  )
}

/** The text of the current line up to the caret, inside an editing field. */
function lineBeforeCaret(el: HTMLElement) {
  const sel = window.getSelection()
  if (!sel?.rangeCount) return ''
  const caret = sel.getRangeAt(0)
  const r = document.createRange()
  r.selectNodeContents(el)
  r.setEnd(caret.startContainer, caret.startOffset)
  const box = document.createElement('div')
  box.appendChild(r.cloneContents())
  box.querySelectorAll('br').forEach(b => b.replaceWith('\n'))
  const before = box.textContent ?? ''
  return before.slice(before.lastIndexOf('\n') + 1)
}

/** Double-click on a bigger area (a bubble) to edit. */
export function editOn(studio: Studio | null, k: string) {
  return studio ? { onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); studio.beginEdit(k) } } : {}
}

export function cx(...names: (string | false | undefined | null)[]) {
  return names.filter(Boolean).join(' ')
}

// MARK: images

export function Img({ id, className, style, alt = '' }: { id?: string; className?: string; style?: CSSProperties; alt?: string }) {
  const url = useAsset(id)
  if (!url) return null
  return <img src={url} className={className} style={style} alt={alt} draggable={false} decoding="sync" />
}

/** An image message: fitted inside max width/height. No picture yet → a placeholder (double-click to pick). */
export function ImageContent({ e, maxW, maxH, radius, className }: { e: Entry; maxW: number; maxH: number; radius: number; className?: string }) {
  const scene = useScene()
  const url = useAsset(e.image)
  const studio = scene.live ? scene.studio : null
  const pick = studio ? { onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'entry', id: e.id }) } } : {}
  if (url) {
    return (
      <span className={cx('msg-img hit', className)} style={{ borderRadius: radius }} {...pick}>
        <img src={url} draggable={false} decoding="sync" alt="" style={{ maxWidth: maxW, maxHeight: maxH, borderRadius: radius }} />
      </span>
    )
  }
  return (
    <div className={cx('img-ph hit', className)} style={{ width: Math.min(120, maxW), height: Math.min(150, maxH), borderRadius: radius }} {...pick}>
      <Io name="image" size={24} />
    </div>
  )
}

// MARK: avatars

interface AvatarProps {
  person: Pick<Person, 'id' | 'name' | 'avatar' | 'color'>
  size: number
  square?: boolean
  /** Corner radius when square (defaults to 10% of the size). */
  radius?: number
  /** The entry this avatar belongs to (dropping a cast member on it changes the author). */
  entry?: string
  className?: string
  /** Not a slot (e.g. a contact card's own picture). */
  plain?: boolean
}

export function Avatar({ person, size, square, radius, entry, className, plain }: AvatarProps) {
  const scene = useScene()
  const studio = scene.live && !plain ? scene.studio : null
  const url = useAsset(person.avatar) ?? critterURL(person.color)
  const shakes = useStudio(s => s.shakes[person.id] ?? 0, 0)
  const angle = scene.shake?.person === person.id ? scene.shake.angle : 0
  const r = square ? (radius ?? size * 0.1) : size / 2
  const style: CSSProperties = { width: size, height: size, borderRadius: r, ['--r' as string]: `${r}px` }
  if (angle) style.transform = `rotate(${angle}deg)`
  const handlers = studio ? {
    onClick: (ev: R.MouseEvent<HTMLElement>) => {
      ev.stopPropagation()
      studio.openFloating({ kind: 'avatar', person: person.id }, ev.currentTarget.getBoundingClientRect())
    },
    onDoubleClick: (ev: R.MouseEvent) => {
      ev.stopPropagation()
      if (has(scene.rules, 'avatarPat') && entry) { studio.closeFloating(); studio.pat(person.id, entry) }
    },
    ...dropHandlers(studio, dt => {
      const file = imageFile(dt)
      if (file) { void studio.deliver(file, { kind: 'avatar', person: person.id }); return }
      const payload = readPayload(dt)
      if (payload?.type === 'persona') { studio.fillPerson(person.id, payload.id); return }
      if (payload?.type === 'person' && entry) { studio.setAuthor(entry, payload.id); return }
      return false
    }),
  } : {}
  return (
    <span className={cx('avatar', studio && 'slot', className)} style={style} data-person={person.id} {...handlers}>
      <img key={shakes} src={url} alt="" draggable={false} decoding="sync" className={shakes ? 'shake' : undefined} style={{ borderRadius: r }} />
    </span>
  )
}

// MARK: one row

/** Wraps every entry on the canvas: selection, right-click, reorder drag, drops. Exports get a plain div. */
export function RowShell({ e, children, className, style }: { e: Entry; children: ReactNode; className?: string; style?: CSSProperties }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const selected = useStudio(s => s.selection === e.id && !s.playing, false) && !!studio
  if (!studio) return <div className={cx('row', className)} style={style} data-row={e.id}>{children}</div>
  return (
    <div className={cx('row', className)} style={style} data-row={e.id} data-sel={selected ? '' : undefined}
      onClick={ev => {
        ev.stopPropagation()
        if (dragged.current) { dragged.current = false; return }
        studio.select(e.id)
      }}
      onContextMenu={ev => {
        ev.preventDefault()
        ev.stopPropagation()
        studio.select(e.id)
        studio.openFloating({ kind: 'more', id: e.id }, { x: ev.clientX, y: ev.clientY, w: 1, h: 1 })
      }}
      onPointerDown={ev => startReorder(ev, e, studio, scene.rules)}
      {...dropHandlers(studio, dt => {
        const file = imageFile(dt)
        if (file) {
          if (holdsImage(e.kind)) void studio.deliver(file, { kind: 'entry', id: e.id })
          else void studio.deliver(file, { kind: 'newEntry', after: e.id })
          return
        }
        const payload = readPayload(dt)
        if (payload?.type === 'person') { studio.setAuthor(e.id, payload.id); return }
        return false
      })}>
      {children}
    </div>
  )
}

const dragged = { current: false }

function startReorder(ev: R.PointerEvent<HTMLDivElement>, e: Entry, studio: Studio, rules: ReturnType<typeof useScene>['rules']) {
  if (ev.button !== 0 || (ev.target as HTMLElement).closest('[contenteditable], .slot, button, .no-drag')) return
  const row = ev.currentTarget
  const list = row.closest('.rows') as HTMLElement | null
  if (!list) return
  const phone = row.closest('.phone') as HTMLElement
  const scale = phone.getBoundingClientRect().width / phone.offsetWidth || 1
  const x0 = ev.clientX, y0 = ev.clientY
  let mode: 'reorder' | 'thread' | undefined
  let target: { id: string; after: boolean; el: HTMLElement } | undefined
  const threaded = has(rules, 'thread') && !isChat(rules)
  const timer = window.setTimeout(() => { if (!mode && ev.pointerType !== 'mouse') begin('reorder') }, 420)
  const others = () => Array.from(list.querySelectorAll<HTMLElement>(':scope > .row')).filter(x => x !== row)
  function begin(m: 'reorder' | 'thread') {
    mode = m
    row.classList.add('lifting')
    studio.select(e.id)
    studio.sound('lift')
  }
  function move(me: PointerEvent) {
    const dx = me.clientX - x0, dy = me.clientY - y0
    if (!mode) {
      if (threaded && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.5) begin('thread')
      else if (Math.abs(dy) > 7 && ev.pointerType === 'mouse') begin('reorder')
      else return
    }
    me.preventDefault()
    if (mode === 'thread') {
      row.style.transform = `translateX(${Math.max(-60, Math.min(60, dx / scale))}px)`
      return
    }
    row.style.transform = `translateY(${dy / scale}px)`
    let best: typeof target
    let bestDist = Infinity
    for (const other of others()) {
      const r = other.getBoundingClientRect()
      const mid = r.top + r.height / 2
      const d = Math.abs(me.clientY - mid)
      if (d < bestDist) { bestDist = d; best = { id: other.dataset.row!, after: me.clientY > mid, el: other } }
    }
    if (target?.el !== best?.el || target?.after !== best?.after) {
      target?.el.removeAttribute('data-insert')
      best?.el.setAttribute('data-insert', best.after ? 'after' : 'before')
      target = best
    }
  }
  function up(me: PointerEvent) {
    window.clearTimeout(timer)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (!mode) return
    dragged.current = true
    window.setTimeout(() => { dragged.current = false }, 0)
    row.classList.remove('lifting')
    row.style.transform = ''
    target?.el.removeAttribute('data-insert')
    if (mode === 'thread') {
      const dx = me.clientX - x0
      if (dx > 40 && !e.isReply) studio.setReply(e.id, true)
      else if (dx < -40 && e.isReply) studio.setReply(e.id, false)
      return
    }
    if (target) studio.move(e.id, target.id, target.after)
  }
  window.addEventListener('pointermove', move, { passive: false })
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

// MARK: status bar

export function StatusBar({ className, style }: { className?: string; style?: CSSProperties }) {
  const scene = useScene()
  return (
    <div className={cx('statusbar', className)} style={style}>
      <div className="sb-time"><Ed k="statusTime" value={scene.p.statusTime} multiline={false} /></div>
      <div className="sb-icons">
        <Io name="cellular" size={17} />
        <Io name="wifi" size={17} />
        <Battery />
      </div>
    </div>
  )
}

function Battery() {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const preview = useStudio(s => s.battery, undefined)
  const level = Math.min(Math.max(preview ?? scene.p.battery ?? 80, 1), 100)
  const start = useRef<{ x: number; level: number } | undefined>(undefined)
  const low = level <= 20
  return (
    <span className={cx('battery', studio && 'slot-battery')} title={studio ? 'Drag sideways to change the battery' : undefined}
      onPointerDown={studio ? ev => {
        ev.stopPropagation()
        ev.currentTarget.setPointerCapture(ev.pointerId)
        start.current = { x: ev.clientX, level }
      } : undefined}
      onPointerMove={studio ? ev => {
        if (!start.current) return
        studio.previewBattery(start.current.level + (ev.clientX - start.current.x) / 1.5)
      } : undefined}
      onPointerUp={studio ? () => { start.current = undefined; studio.commitBattery() } : undefined}
      onClick={ev => ev.stopPropagation()}>
      <svg width="27" height="13" viewBox="0 0 27 13">
        <rect x="0.5" y="0.5" width="22" height="12" rx="3.6" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="2" y="2" width={Math.max(1.5, 19 * level / 100)} height="9" rx="2.2" fill={low ? '#FF3B30' : 'currentColor'} />
        <path d="M24.2 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1z" fill="currentColor" fillOpacity="0.45" />
      </svg>
      {preview !== undefined && <span className="battery-pill">{level}%</span>}
    </span>
  )
}

// MARK: notices (time, system, recall, nudge)

/** Centered gray line. Skins can restyle it with a class. */
export function Notice({ e, className }: RowProps & { className?: string }) {
  return (
    <RowShell e={e} className={cx('notice', className)}>
      <NoticeText e={e} />
    </RowShell>
  )
}

export function NoticeText({ e, className }: { e: Entry; className?: string }) {
  const scene = useScene()
  const p = scene.p
  const editingPat = useStudio(s => e.kind === 'pat' && s.editing === `text:${e.id}`, false)
  if (e.kind === 'time') return <Ed k={`text:${e.id}`} value={timeText(p, e)} className={cx('hit', className)} multiline={false} />
  if (e.kind === 'system') return <Ed k={`text:${e.id}`} value={e.text} className={cx('hit', className)} />
  if (e.kind === 'pat') {
    const full = noticeText(p, e)
    if (editingPat) {
      const base = e.text ? full.slice(0, full.length - e.text.length) : full
      return <span className={cx('hit', className)}>{base}<Ed k={`text:${e.id}`} value={e.text} multiline={false} /></span>
    }
    return <span className={cx('hit', className)} {...editOn(scene.live ? scene.studio : null, `text:${e.id}`)}>{full}</span>
  }
  return <span className={cx('hit', className)}>{noticeText(p, e)}</span>
}

// MARK: misc

/** "共 N 条回复" under the last reply of a thread. */
export function useMoreReplies(e: Entry, isolated?: boolean) {
  const scene = useScene()
  if (!has(scene.rules, 'moreReplies') || isolated) return undefined
  const list = scene.list
  const i = list.findIndex(x => x.id === e.id)
  if (i < 0) return undefined
  const next = list[i + 1]
  if (next && next.isReply) return undefined
  let root: Entry | undefined
  for (let k = i; k >= 0; k--) { if (!list[k].isReply) { root = list[k]; break } }
  if (!root || !root.replies) return undefined
  return { root: root.id, count: root.replies }
}

export function replyTargetName(e: Entry): string | undefined {
  // Used through useReplyTarget; kept here for skins that render outside React hooks.
  return e.target
}

export function useReplyTarget(e: Entry) {
  const scene = useScene()
  if (!has(scene.rules, 'replyTarget') || !e.isReply || !e.target || e.target === e.personID) return undefined
  return scene.p.people.find(x => x.id === e.target)?.name
}

export const allowsKind = allows

/** Re-render once a little after mount (image sizes settle). */
export function useSettled() {
  const [, set] = useState(0)
  useEffect(() => { const id = window.setTimeout(() => set(1), 50); return () => window.clearTimeout(id) }, [])
}

export function usePerson(e: Entry): Person {
  const scene = useScene()
  return scene.p.people.find(x => x.id === e.personID) ?? { id: e.personID, name: scene.tx('访客', 'Guest'), color: 0, level: '' }
}

export function useSelected(id: string) {
  const scene = useScene()
  return useStudio(s => s.selection === id && !s.playing, false) && scene.live
}

export function useStudioLive(): Studio | null {
  const scene = useScene()
  const ref = useStudioRef()
  return scene.live ? ref : null
}
