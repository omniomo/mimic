// Pieces shared by several skins: the composer's input, the "+" button, the iOS keyboard, the notification banner.

import type * as R from 'react'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useScene } from './context'
import { Avatar, Ed, Img, RowShell, cx, dropHandlers, editOn, imageFile } from './parts'
import { useStudio } from '../store/studio'
import { isAssistant } from '../model/rules'
import type { Entry } from '../model/types'
import { Io, type IoName } from '../ui/icons'

/** The composer's text: a real input while editing, the typed text in videos, the pinned text or the placeholder in exports. */
export function ComposerField({ placeholder, className, typed, live, style }: { placeholder: string; className?: string; typed?: string; live: boolean; style?: CSSProperties }) {
  const scene = useScene()
  const studio = live && scene.live ? scene.studio : null
  const draft = useStudio(s => s.draft, '')
  const focusTick = useStudio(s => s.focusTick, 0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusTick) ref.current?.focus() }, [focusTick])
  if (studio) {
    return (
      <input ref={ref} className={cx('cf', className)} style={style} value={draft} placeholder={placeholder} spellCheck={false}
        onChange={ev => studio.setDraft(ev.target.value)}
        onClick={ev => ev.stopPropagation()}
        onPointerDown={ev => ev.stopPropagation()}
        onKeyDown={ev => {
          ev.stopPropagation()
          if (ev.nativeEvent.isComposing || ev.nativeEvent.keyCode === 229) return
          if (ev.key === 'Enter') {
            ev.preventDefault()
            if (studio.send(draft)) studio.setDraft('')
          } else if (ev.key === 'Tab') {
            ev.preventDefault()
            studio.cycleSender(ev.shiftKey ? -1 : 1)
          } else if ((ev.metaKey || ev.ctrlKey) && /^[0-9]$/.test(ev.key)) {
            ev.preventDefault()
            studio.pickSender(Number(ev.key))
          } else if (ev.key === 'Escape') {
            ev.currentTarget.blur()
          }
        }}
        onPaste={ev => {
          const file = Array.from(ev.clipboardData.files).find(f => f.type.startsWith('image/'))
          if (file) { ev.preventDefault(); void studio.deliver(file, { kind: 'newEntry' }); return }
          const text = ev.clipboardData.getData('text/plain')
          if (text.includes('\n') || isAssistant(scene.rules)) { ev.preventDefault(); studio.pasteText(text) }
        }} />
    )
  }
  const text = typed || scene.p.composerText
  if (text) return <span className={cx('cf', 'cf-text', className)} style={style}><span dir="auto">{text}</span></span>
  return <span className={cx('cf', 'cf-ph', className)} style={style}>{placeholder}</span>
}

/** Whether the composer has text right now (send button state). */
export function useComposerHasText(typed: string | undefined, live: boolean) {
  const scene = useScene()
  const draft = useStudio(s => s.draft, '')
  if (scene.p.composerText) return true
  return live && scene.live ? draft.trim().length > 0 : !!typed
}

/** The composer's "+": opens the "add one" panel with every kind this scene has. */
export function PlusButton({ icon = 'addCircle', size = 28, className, children }: { icon?: IoName; size?: number; className?: string; children?: ReactNode }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  return (
    <span className={cx('plus', className)} data-anchor="composerPlus"
      onClick={studio ? ev => {
        ev.stopPropagation()
        const s = studio.s
        if (s.floating?.kind === 'insert') { studio.closeFloating(); return }
        studio.openFloating({ kind: 'insert', after: s.selection }, ev.currentTarget.getBoundingClientRect())
      } : undefined}>
      {children ?? <Io name={icon} size={size} />}
    </span>
  )
}

export function Glyph({ name, size = 24, className, onClick, style }: { name: IoName; size?: number; className?: string; onClick?: () => void; style?: CSSProperties }) {
  const scene = useScene()
  const live = scene.live && onClick
  return (
    <span className={cx('glyph', className)} style={style} onClick={live ? ev => { ev.stopPropagation(); onClick!() } : undefined}>
      <Io name={name} size={size} />
    </span>
  )
}

// MARK: iOS keyboard (just a picture)

export const KEYBOARD_HEIGHT = 336

export function Keyboard() {
  const { zh } = useScene()
  const row = (letters: string) => letters.split('').map(l => <span key={l} className="kb-key">{l}</span>)
  return (
    <div className="keyboard" aria-hidden="true">
      <div className="kb-bar" />
      <div className="kb-rows">
        <div className="kb-row">{row('qwertyuiop')}</div>
        <div className="kb-row kb-indent">{row('asdfghjkl')}</div>
        <div className="kb-row">
          <span className="kb-key kb-fn kb-wide"><Io name="arrowUp" size={18} /></span>
          <span className="kb-group">{row('zxcvbnm')}</span>
          <span className="kb-key kb-fn kb-wide"><Io name="back" size={18} /></span>
        </div>
        <div className="kb-row">
          <span className="kb-key kb-fn kb-w44">123</span>
          <span className="kb-key kb-fn kb-w44"><Io name="smile" size={20} /></span>
          <span className="kb-key kb-space">{zh ? '空格' : 'space'}</span>
          <span className="kb-key kb-send">{zh ? '发送' : 'send'}</span>
        </div>
      </div>
      <div className="kb-foot"><Io name="globe" size={24} /><Io name="mic" size={24} /></div>
    </div>
  )
}

// MARK: notification banner

export function bannerTitle(scene: ReturnType<typeof useScene>, e: Entry) {
  return e.source || scene.p.people.find(x => x.id === e.personID)?.name || ''
}

/** iOS notification banner at the top of the phone. Its name and picture live on the entry, not on a person. */
export function Banner({ e, style }: { e: Entry; style?: CSSProperties }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const selected = useStudio(s => s.selection === e.id, false) && !!studio
  const person = scene.p.people.find(x => x.id === e.personID) ?? { id: e.personID, name: '', color: 0 }
  return (
    <div className={cx('banner', selected && 'banner-sel')} style={style}
      onClick={studio ? ev => { ev.stopPropagation(); studio.select(e.id) } : undefined}>
      <span className="banner-face" {...(studio ? {
        onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'entry', id: e.id }) },
        ...dropHandlers(studio, dt => { const f = imageFile(dt); if (f) { void studio.deliver(f, { kind: 'entry', id: e.id }); return } return false }),
      } : {})}>
        {e.image ? <Img id={e.image} className="banner-img" /> : <Avatar person={person} size={38} plain />}
      </span>
      <div className="banner-text">
        <div className="banner-head">
          <Ed k={`source:${e.id}`} value={bannerTitle(scene, e)} className="banner-name" multiline={false} />
          <span className="banner-now">{scene.tx('现在', 'now')}</span>
        </div>
        <Ed k={`text:${e.id}`} value={e.text} className="banner-body" />
      </div>
    </div>
  )
}

/** On the canvas, a notification is just a dashed line with a bell and the name. Exports don't have it. */
export function NotificationMark({ e }: { e: Entry }) {
  const scene = useScene()
  return (
    <RowShell e={e} className="notify-mark">
      <span className="hit nm-inner"><Io name="bell" size={10} /><span className="nm-name">{bannerTitle(scene, e)}</span><span className="nm-dash" /></span>
    </RowShell>
  )
}

/** Three gray dots (the other side is typing). */
export function TypingDots({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cx('typing-dots', className)} style={style}><i /><i /><i /></span>
}

/** The phone owner's avatar left of the comment field (Instagram comments, YouTube, Gemini). Not a commenter. */
export function ViewerAvatar({ size }: { size: number }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const p = scene.p
  const me = p.people.find(x => x.id === p.selfID)
  const ref = p.viewerAvatar ?? me?.avatar
  return (
    <span className="viewer-avatar avatar slot" style={{ width: size, height: size, ['--r' as string]: `${size / 2}px` }}
      title={studio ? 'Your avatar. Tap or drop a photo to change it' : undefined}
      {...(studio ? {
        onClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'viewer' }) },
        ...dropHandlers(studio, dt => {
          const f = imageFile(dt)
          if (f) { void studio.deliver(f, { kind: 'viewer' }); return }
          return false
        }),
      } : {})}>
      {ref ? <Img id={ref} className="va-img" /> : <span className="va-empty"><Io name="personFill" size={size * 0.56} /></span>}
    </span>
  )
}

/** A comment's words, with an optional "@name " (or "回复 name：") in front that isn't part of the text. */
export function CommentText({ e, prefix, className }: { e: Entry; prefix?: ReactNode; className?: string }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const editing = useStudio(s => s.editing === `text:${e.id}`, false)
  return (
    <div className={className} {...(prefix && !editing ? editOn(studio, `text:${e.id}`) : {})}>
      {prefix}
      <Ed k={`text:${e.id}`} value={e.text} />
    </div>
  )
}

/** The scene's cover picture (short-video frame, Moments cover, Xiaohongshu photo). Double-click or drop a picture to change it. */
export function Cover({ className, style, empty, children }: { className?: string; style?: CSSProperties; empty?: ReactNode; children?: ReactNode }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const ref = scene.p.cover
  return (
    <div className={cx('cover', className)} style={style} title={studio ? 'Double-click or drop a picture here' : undefined}
      {...(studio ? {
        onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'cover' }) },
        ...dropHandlers(studio, dt => {
          const f = imageFile(dt)
          if (f) { void studio.deliver(f, { kind: 'cover' }); return }
          return false
        }),
      } : {})}>
      {ref ? <Img id={ref} className="cover-img" /> : empty}
      {children}
    </div>
  )
}
