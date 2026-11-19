// The phone: status bar, navigation, rows, composer — one frame of a scene.
// Two ways to draw it:
// - "page": everything, as tall as the content (the workbench and long images);
// - "screen": a 390×844 screen. With a playback it scrolls like a real chat (newest at the bottom);
//   with a window it shows those rows from the top (one screen of "screen by screen").

import './phone.css'
import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { SceneContext, useScene, type RowProps, type Scene } from './context'
import { Img, Notice, RowShell, StatusBar, cx } from './parts'
import { Banner, KEYBOARD_HEIGHT, Keyboard, NotificationMark } from './shared'
import { sizeOf, type Skin } from './skin'
import { skinOf } from './skins'
import { screenStarts } from './paging'
import { has, isChat, projectRules, threadsOf, viewerOf, visibleEntries } from '../model/rules'
import { isBubble, messageDates } from '../model/time'
import { receiptHolder } from '../model/project'
import { platformOf } from '../model/templates'
import type { Entry, Project } from '../model/types'
import type { Studio } from '../store/studio'
import type { Playback } from '../video/timeline'
import { t } from '../i18n'

export const PHONE_W = 390
export const PHONE_H = 844
export const STATUS_H = 47
export const HOME_H = 34

export function insetsOf(p: Project, skin = skinOf(p.template)) {
  return skin.insets ?? (isChat(projectRules(p)) ? { top: 12, bottom: 12 } : { top: 4, bottom: 7 })
}

export function showsKeyboard(p: Project) { return p.keyboard === true && p.showComposer }
export function showsLead(p: Project) { return has(projectRules(p), 'lead') && p.hideLead !== true }

export function chromeHeight(p: Project, skin = skinOf(p.template)) {
  const bottom = showsKeyboard(p) ? KEYBOARD_HEIGHT : HOME_H
  return (p.showStatusBar ? STATUS_H : 0) + sizeOf(skin.navHeight, p) + (p.showComposer ? sizeOf(skin.composerHeight, p) + bottom : 0)
}

/** Height available for rows in one screen (used to split into screens). */
export function messageArea(p: Project) {
  const ins = insetsOf(p)
  return PHONE_H - chromeHeight(p) - ins.top - ins.bottom
}

export interface PhoneProps {
  p: Project
  mode: 'page' | 'screen'
  live?: boolean
  studio?: Studio | null
  playback?: Playback
  window?: { start: number; end: number; skip?: number; shown?: number }
  /** "card": one card of the cards layout (no bars). "composer": only the composer (under the cards on the workbench).
   *  "stickers": each top-level comment as a reply sticker (Douyin / TikTok) — a checkerboard board, or one bare sticker with "isolated". */
  variant?: 'phone' | 'card' | 'composer' | 'stickers'
  /** Video compositing: draw only the rows (transparent elsewhere) or only the background. Layout is unchanged. */
  layer?: 'full' | 'rows' | 'background'
  className?: string
  style?: CSSProperties
}

export function Phone({ p, mode, live = false, studio = null, playback, window: win, variant = 'phone', layer = 'full', className, style }: PhoneProps) {
  const skin = skinOf(p.template)
  const rules = projectRules(p)
  const all = useMemo(() => visibleEntries(p), [p])
  const likers = playback?.likers
  const list = useMemo(() => {
    if (!likers || !Object.keys(likers).length) return all
    return all.map(e => {
      const n = likers[e.id]
      return n !== undefined && e.likers ? { ...e, likers: n > 0 ? e.likers.slice(0, n) : undefined } : e
    })
  }, [all, likers])

  const scene: Scene = useMemo(() => ({
    p, rules, pl: platformOf(p.template), zh: p.language === 'chinese', dark: p.dark, viewer: viewerOf(p), list,
    dates: messageDates(p), holder: receiptHolder(p, list), live, studio: live ? studio : null,
    stream: playback?.stream, likers, shake: playback?.shake ? { person: playback.shake, angle: playback.shakeAngle } : undefined,
    tx: (zh: string, en: string) => (p.language === 'chinese' ? zh : en),
  }), [p, rules, list, live, studio, playback?.stream, likers, playback?.shake, playback?.shakeAngle])

  const card = variant === 'card'
  const navH = sizeOf(skin.navHeight, p)
  const chrome = chromeHeight(p, skin)
  const ins = insetsOf(p, skin)
  const keyboard = showsKeyboard(p)
  const lead = showsLead(p) && !!skin.Lead
  const over = !!skin.navOverLead && lead
  const chromeTop = (p.showStatusBar ? STATUS_H : 0) + navH
  const viewport = PHONE_H - chrome
  const screen = mode === 'screen'

  // Which rows and what's around them.
  let rows: Entry[] = list
  let fromRow = 0
  if (screen && playback) rows = list.slice(0, playback.revealed)
  else if (screen && win) { rows = list.slice(win.start, win.end); fromRow = win.start }
  const typingRow = !!playback?.typing && has(rules, 'typingBubble') && !!skin.Typing
  const showLeadHere = lead && !(win && (win.start > 0 || (win.skip ?? 0) > 0))

  const rowsRef = useRef<HTMLDivElement>(null)
  const coverRef = useRef<HTMLDivElement>(null)

  // Screen mode: scroll so the newest revealed row sits just above the composer (with the pop-in blend).
  useLayoutEffect(() => {
    const el = rowsRef.current
    if (!el) return
    if (!screen) { el.style.transform = ''; return }
    if (win) {
      el.style.transform = win.skip ? `translateY(${-win.skip}px)` : ''
    } else {
      const kids = Array.from(el.children) as HTMLElement[]
      const leadN = showLeadHere ? 1 : 0
      const count = rows.length
      const revealed = leadN + count + (typingRow ? 1 : 0)
      const previous = leadN + (typingRow ? count + 1 : Math.min(playback?.previous ?? count, count))
      const offset = (n: number) => {
        if (n <= 0 || !kids.length) return 0
        const k = kids[Math.min(n, kids.length) - 1]
        return Math.max(0, k.offsetTop + k.offsetHeight + ins.bottom - viewport)
      }
      const from = offset(previous)
      const blend = playback?.blend ?? 1
      const shift = from + (offset(revealed) - from) * blend
      el.style.transform = shift ? `translateY(${-shift}px)` : ''
    }
    // Moments: the transparent chrome fades to white once the cover scrolls under it.
    if (over && coverRef.current && playback) {
      const leadEl = el.querySelector('[data-lead]') as HTMLElement | null
      let fade = 1
      if (leadEl) {
        const shift = -new DOMMatrixReadOnly(getComputedStyle(el).transform).m42
        const picture = Number((leadEl.querySelector('[data-picture]') as HTMLElement | null)?.dataset.picture ?? leadEl.offsetHeight)
        fade = Math.min(1, Math.max(0, 1 - (leadEl.offsetTop + picture - shift) / 48))
      }
      coverRef.current.style.setProperty('--fade', String(fade))
    }
  })

  // Workbench: dashed "Screen 2" lines where the export would cut.
  useLayoutEffect(() => {
    const el = rowsRef.current
    if (!el || !live || screen) return
    const kids = (Array.from(el.children) as HTMLElement[]).filter(k => k.dataset.row)
    kids.forEach(k => { k.removeAttribute('data-screen') })
    if (rules.traits.has('assistant')) return
    const leadEl = el.querySelector('[data-lead]') as HTMLElement | null
    const heights = kids.map(k => k.offsetHeight)
    const starts = screenStarts(heights, messageArea(p), list.map(e => e.kind === 'time'), leadEl?.offsetHeight ?? 0)
    starts.forEach((start, n) => { if (n > 0 && kids[start]) kids[start].setAttribute('data-screen', t('Screen {0}', n + 1)) })
  })

  const wall = skin.wall(p.dark)
  const bar = (skin.bar ?? skin.wall)(p.dark)
  const banner = bannerEntry(list, playback, screen, win, studio, live)

  const statusAndNav = (overCover = false) => (
    <>
      {p.showStatusBar && <StatusBarFor skin={skin} over={overCover} />}
      <skin.Nav typing={!!playback?.typing && has(rules, 'typingTitle')} overCover={overCover} />
    </>
  )

  return (
    <SceneContext.Provider value={scene}>
      <div className={cx('phone', skin.className, p.dark && 'dark', screen ? 'screen' : variant === 'phone' ? 'page' : `v-${variant}`, live && 'live', layer !== 'full' && `layer-${layer}`, className)}
        style={{ ...style, ['--wall' as string]: wall, ['--bar' as string]: bar, ['--nav-h' as string]: `${navH}px` }}
        lang={p.language === 'chinese' ? 'zh-Hans' : 'en'}>
        {variant === 'composer' && (
          <div className="composer" style={{ background: bar }}>
            <div className="composer-bar" style={{ height: sizeOf(skin.composerHeight, p) }}><skin.Composer live={live} /></div>
            {skin.divider && <div className="composer-line" />}
          </div>
        )}
        {variant === 'phone' && (over ? <div style={{ height: chromeTop }} /> : statusAndNav())}
        {variant === 'stickers' && skin.Sticker && <StickerBoard skin={skin} live={live} studio={studio} />}
        {variant !== 'composer' && variant !== 'stickers' && <div className={cx('body', over && showLeadHere && 'under-chrome')} style={card ? undefined : screen ? { height: viewport } : { minHeight: Math.max(0, PHONE_H - chrome) }}
          onClick={live && studio ? ev => { ev.stopPropagation(); studio.tapWall({ x: ev.clientX, y: ev.clientY }) } : undefined}>
          <Backdrop skin={skin} />
          <div ref={rowsRef} className="rows" style={{ paddingTop: showLeadHere ? 0 : ins.top, paddingBottom: ins.bottom }}>
            {showLeadHere && skin.Lead && <div data-lead="" className="lead" style={{ paddingBottom: ins.top }}><skin.Lead underNav={over ? chromeTop : 0} /></div>}
            {rows.map((e, i) => {
              const at = fromRow + i
              const fresh = !!playback && i >= playback.previous && !typingRow
              return (
                <RowSwitch key={e.id} e={e} prev={list[at - 1]} next={at + 1 < (playback ? playback.revealed : list.length) ? list[at + 1] : undefined}
                  skin={skin} live={live} fade={fresh ? playback!.blend : undefined} />
              )
            })}
            {typingRow && skin.Typing && <div className="row" data-typing=""><skin.Typing /></div>}
            {live && !list.length && !card && <EmptyHint />}
          </div>
        </div>}
        {variant === 'phone' && p.showComposer && (
          <div className="composer" style={{ background: bar }}>
            <div className="composer-bar" style={{ height: sizeOf(skin.composerHeight, p) }}>
              <skin.Composer typed={playback?.composer} live={live && !playback} busy={!!playback?.stream} />
            </div>
            {skin.divider && <div className="composer-line" />}
            {keyboard ? <Keyboard /> : <div style={{ height: HOME_H }} />}
          </div>
        )}
        {variant === 'phone' && over && (
          <div ref={coverRef} className={cx('cover-chrome', !playback && win && win.start > 0 && 'solid')} style={{ height: chromeTop, ['--fade' as string]: playback ? undefined : (win && win.start > 0 ? 1 : 0) }}>
            <div className="cc-clear">{statusAndNav(true)}</div>
            <div className="cc-solid" style={{ background: wall }}>{statusAndNav(false)}</div>
          </div>
        )}
        {variant === 'phone' && banner && (
          <div className="banner-wrap" style={playback && playback.banner ? { transform: `translateY(${-140 * (1 - playback.bannerShown)}px)`, opacity: Math.min(1, playback.bannerShown * 1.6) } : undefined}>
            <Banner e={banner} />
          </div>
        )}
        {screen && playback?.indicator && <div className="home-indicator" />}
      </div>
    </SceneContext.Provider>
  )
}

/** Douyin / TikTok "reply to …'s comment" stickers: one per thread. */
function StickerBoard({ skin, live, studio }: { skin: Skin; live: boolean; studio: Studio | null }) {
  const scene = useScene()
  const roots = threadsOf(scene.p).map(t => t[0])
  const Sticker = skin.Sticker!
  return (
    <div className="rows sticker-board" onClick={live && studio ? ev => { ev.stopPropagation(); studio.tapWall({ x: ev.clientX, y: ev.clientY }) } : undefined}>
      {roots.map(e => <RowShell key={e.id} e={e} className="sticker-row"><Sticker e={e} /></RowShell>)}
      {live && !roots.length && <EmptyHint />}
    </div>
  )
}

function bannerEntry(list: Entry[], playback: Playback | undefined, screen: boolean, win: PhoneProps['window'], studio: Studio | null, live: boolean): Entry | undefined {
  if (playback) return playback.banner ? list.find(e => e.id === playback.banner) : undefined
  if (live && studio) {
    const sel = studio.s.selection
    const chosen = sel ? list.find(e => e.id === sel && e.kind === 'notification') : undefined
    if (chosen) return chosen
  }
  if (screen && win && win.end < list.length) return undefined
  const last = list[list.length - 1]
  return last?.kind === 'notification' ? last : undefined
}

function StatusBarFor({ skin, over }: { skin: Skin; over: boolean }) {
  return <StatusBarImpl dark={!!skin.darkStatus} over={over} />
}

function StatusBarImpl({ dark, over }: { dark: boolean; over: boolean }) {
  return <StatusBar className={cx(dark && 'sb-dark', over && 'sb-over')} />
}

function Backdrop({ skin }: { skin: Skin }) {
  const scene = useScene()
  if (has(scene.rules, 'wallpaper') && scene.p.wallpaper) return <Img id={scene.p.wallpaper} className="wallpaper" />
  return skin.Backdrop ? <skin.Backdrop /> : null
}

interface RowSwitchProps extends RowProps { skin: Skin; live: boolean; fade?: number }

/** One entry: a bubble, a gray notice, or (on the canvas only) a notification marker. */
const RowSwitch = memo(function RowSwitch({ e, prev, next, skin, live, fade }: RowSwitchProps) {
  const scene = useScene()
  let inner
  if (e.kind === 'notification') inner = live ? <NotificationMark e={e} /> : <div className="row row-empty" data-row={e.id} />
  else if (!isBubble(scene.p, e)) inner = skin.Notice ? <skin.Notice e={e} prev={prev} next={next} /> : <Notice e={e} prev={prev} next={next} />
  else inner = <skin.Row e={e} prev={prev} next={next} />
  if (fade === undefined) return inner
  return <div className="fresh" style={{ opacity: fade, transform: `translateY(${(1 - fade) * 12}px)` }}>{inner}</div>
})

function EmptyHint() {
  const scene = useScene()
  const studio = scene.studio
  const r = scene.rules
  const text = has(r, 'likers')
    ? scene.tx('点右上角的相机发一条朋友圈', 'Tap the camera at the top to post')
    : scene.tx(isChat(r) ? '在下面的输入框打字，回车发出' : '在下面的输入框写评论，回车发出', 'Type below and press Return')
  return (
    <div className="empty-hint" onClick={ev => ev.stopPropagation()}>
      <div>{text}</div>
      <button onClick={() => studio?.loadSample()}>{scene.tx('换成示例', 'Load an example')}</button>
    </div>
  )
}
