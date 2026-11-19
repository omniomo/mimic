// The workbench: a sheet of white paper with one phone on it. Top: back to the projects, undo, redo, export.
// Bottom: the people in the conversation; pull up (or tap the grip) for the avatar library.
// With a mouse it works like the Mac app: click selects (four blue corners), right-click opens the panels,
// a blue "+" shows up between two messages. With touch it works like the iPad: toolbars float over what you tap.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Phone, PHONE_W, PHONE_H } from '../scene/Phone'
import { Studio, StudioContext, cancelExport, pickFile, useStudio, useStudioRef, type StudioState } from '../store/studio'
import { getProject, saveProject } from '../app/projects'
import { castOf, freshSender, has, hasSelf, isAssistant, layoutOf, projectRules, threadsOf } from '../model/rules'
import { platformOf } from '../model/templates'
import { critterURL } from '../model/project'
import { useAsset } from '../store/assets'
import { library, useLibrary, type Persona } from '../store/library'
import { t } from '../i18n'
import { Lu } from './icons'
import { AssistantMark, Face, GlyphButton, cx, desktop } from './kit'
import { EntryActionBar, FloatingHost, ImportSheet, PageActionBar } from './panels'
import { Player } from './Player'
import { imageFile, readPayload, setPayload } from '../scene/parts'
import { saveThumbnail } from '../export/images'
import type { Person, Project } from '../model/types'

export function Workbench({ id, onClose }: { id: string; onClose: () => void }) {
  const [studio, setStudio] = useState<Studio | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    void getProject(id).then(p => {
      if (!alive) return
      if (!p) { setMissing(true); return }
      setStudio(new Studio(id, p, next => void saveProject(id, next)))
    })
    return () => { alive = false }
  }, [id])

  if (missing) {
    return (
      <div className="bench">
        <div className="bench-top"><GlyphButton icon="grid" title={t('Projects')} size={28} glyph={15} onClick={onClose} /></div>
        <p className="bench-missing">{t('This project is gone.')}</p>
      </div>
    )
  }
  if (!studio) return null
  return (
    <StudioContext.Provider value={studio}>
      <Bench studio={studio} onClose={async () => {
        studio.endEditing()
        studio.stop()
        studio.closeFloating()
        const p = studio.project
        await saveProject(id, p, true)
        onClose()
        void saveThumbnail(id, p)
      }} />
    </StudioContext.Provider>
  )
}

const sel = <T,>(f: (s: StudioState) => T) => f

function Bench({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const playing = useStudio(sel(s => !!s.playing), false)
  const showLibrary = useStudio(sel(s => s.showLibrary), false)
  const pasting = useStudio(sel(s => s.floating?.kind === 'paste'), false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => keyboardShortcuts(studio), [studio])

  return (
    <div className="bench" ref={ref} tabIndex={-1}>
      <TopBar studio={studio} p={p} onClose={onClose} />
      <Stage studio={studio} p={p} />
      <CastStrip studio={studio} p={p} />
      {desktop ? <HoverInsert studio={studio} /> : <SelectionLayer studio={studio} />}
      {showLibrary && <LibraryDrawer studio={studio} p={p} />}
      <FloatingHost />
      {pasting && <ImportSheet />}
      {playing && <Player studio={studio} />}
      <NoticeToast studio={studio} />
    </div>
  )
}

// MARK: top bar

function TopBar({ studio, p, onClose }: { studio: Studio; p: Project; onClose: () => void }) {
  const undoCount = useStudio(sel(s => s.undoCount), 0)
  const redoCount = useStudio(sel(s => s.redoCount), 0)
  const job = useStudio(sel(s => s.exporting), undefined)
  const size = desktop ? 28 : 36
  const glyph = desktop ? 15 : 18
  const progress = job ? job.done / Math.max(1, job.total) : 0
  return (
    <div className="bench-top" style={{ height: size + (desktop ? 18 : 10) }}>
      <GlyphButton icon="grid" title={t('Projects')} size={size} glyph={glyph} onClick={onClose} />
      {p.title && <span className="bench-title">{p.title}</span>}
      <span className="grow" />
      <GlyphButton icon="undo2" title={`${t('Undo')}  ⌘Z`} size={size} glyph={glyph} disabled={!undoCount} onClick={() => studio.undo()} />
      <GlyphButton title={`${t('Redo')}  ⇧⌘Z`} className="redo" size={size} glyph={glyph} disabled={!redoCount} onClick={() => studio.redo()}>
        <Lu name="undo2" size={glyph} strokeWidth={1.75} style={{ transform: 'scaleX(-1)' }} />
      </GlyphButton>
      <span className="export-wrap">
        <GlyphButton icon="share" title={t('Export')} size={size} glyph={glyph - 2} filled disabled={!!job} anchor="export"
          onClick={ev => studio.openFloating({ kind: 'export' }, ev.currentTarget.getBoundingClientRect())} />
        {job && (
          <svg className="export-ring" width={size + 8} height={size + 8} viewBox={`0 0 ${size + 8} ${size + 8}`}>
            <circle cx={(size + 8) / 2} cy={(size + 8) / 2} r={(size + 8) / 2 - 1.5}
              strokeDasharray={`${progress * Math.PI * (size + 5)} ${Math.PI * (size + 5)}`} />
          </svg>
        )}
      </span>
    </div>
  )
}

// MARK: the stage

const compactWidth = 520

function Stage({ studio, p }: { studio: Studio; p: Project }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1000, h: 900 })
  const width = size.w
  const pageSelected = useStudio(sel(s => s.pageSelected), false)
  const scrollTo = useStudio(sel(s => s.scrollTo), undefined)
  const layout = layoutOf(p)
  const compact = width < compactWidth
  const cards = layout !== 'page'
  const bezel = compact ? (cards ? 0 : 5) : 8
  // Narrow: the whole phone shrinks to the width (as on iPhone). Wide: a browser window is usually shorter than the
  // phone, so a page shrinks a little to show the composer too — never below 0.7; past that, the stage scrolls.
  const scale = compact
    ? Math.min(1, Math.max(0.62, (width - 76 - bezel * 2) / PHONE_W))
    : cards ? 1 : Math.min(1, Math.max(0.7, (size.h - 20 - 24 - bezel * 2) / PHONE_H))
  // a shrunken page gets a thinner margin of paper, so it shrinks as little as it can
  const padTop = compact ? 6 : scale < 1 ? 20 : 28
  const padBottom = compact ? 20 : scale < 1 ? 24 : 40
  const radius = 34 * scale

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setSize(o => o.w === el.clientWidth && o.h === el.clientHeight ? o : { w: el.clientWidth, h: el.clientHeight })
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!scrollTo) return
    const row = ref.current?.querySelector(`[data-row="${scrollTo.id}"]`) as HTMLElement | null
    row?.scrollIntoView({ block: scrollTo.bottom ? 'end' : 'nearest', behavior: 'smooth' })
  }, [scrollTo])

  const onScroll = () => studio.store.set({ anchor: studio.s.anchor ? { ...studio.s.anchor } : undefined })

  const art = layout === 'page'
    ? <Phone p={p} mode="page" live studio={studio} />
    : layout === 'stickers' ? <StickersStage studio={studio} p={p} /> : <CardsStage studio={studio} p={p} />
  const scaled = (
    <div style={{ width: (cards ? PHONE_W + 32 : PHONE_W) * scale }}>
      <div style={{ width: cards ? PHONE_W + 32 : PHONE_W, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: 'top left', marginBottom: scale === 1 ? 0 : undefined }}>
        {art}
      </div>
    </div>
  )

  return (
    <div className="stage" ref={ref} onScroll={onScroll}
      onClick={ev => studio.tapWall({ x: ev.clientX, y: ev.clientY })}
      onContextMenu={ev => {
        if (studio.s.playing || studio.s.editing) return
        if ((ev.target as HTMLElement).closest('.row')) return
        ev.preventDefault()
        studio.clearSelection()
        studio.openFloating({ kind: 'page' }, { x: ev.clientX, y: ev.clientY, w: 1, h: 1 })
      }}
      onDragOver={ev => { if (ev.dataTransfer.types.includes('Files')) ev.preventDefault() }}
      onDrop={ev => {
        const file = imageFile(ev.dataTransfer)
        if (!file) return
        ev.preventDefault()
        void studio.deliver(file, { kind: 'newEntry' })
      }}>
      <div className="stage-inner" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        {cards
          ? <div data-anchor="phone" className="cards-anchor">{scaled}</div>
          : (
            <div className={cx('bezel', pageSelected && !desktop && 'page-selected')} data-anchor="phone"
              style={{ padding: bezel, borderRadius: radius + bezel }}>
              <div className="bezel-clip" style={{ borderRadius: radius, height: undefined }}>
                <ScaledHeight scale={scale}>{art}</ScaledHeight>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

/** A transform doesn't change layout size: give the scaled phone the height it shows at. */
function ScaledHeight({ scale, children }: { scale: number; children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number>()
  useLayoutEffect(() => {
    if (scale === 1) return
    const el = inner.current
    if (!el) return
    const measure = () => setH(el.offsetHeight * scale)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scale])
  if (scale === 1) return <>{children}</>
  return (
    <div style={{ width: PHONE_W * scale, height: h }}>
      <div ref={inner} style={{ width: PHONE_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}

/** Cards: each top-level comment with its replies is a picture of its own, laid on the paper. The composer under them isn't exported. */
function CardsStage({ studio, p }: { studio: Studio; p: Project }) {
  const threads = useMemo(() => threadsOf(p), [p])
  return (
    <div className="cards-stage">
      {p.template === 'xiaohongshu' && p.hideLead !== true && <Phone p={{ ...p, entries: [] }} mode="page" live studio={studio} variant="card" />}
      {threads.map(thread => {
        const card: Project = { ...p, entries: thread, hideLead: true }
        return <Phone key={thread[0].id} p={card} mode="page" live studio={studio} variant="card" />
      })}
      <Phone p={p} mode="page" live studio={studio} variant="composer" />
    </div>
  )
}

/** Stickers (Douyin, TikTok): each top-level comment as a "reply to …'s comment" sticker on a checkerboard. */
function StickersStage({ studio, p }: { studio: Studio; p: Project }) {
  return (
    <div className="cards-stage">
      <Phone p={p} mode="page" live studio={studio} variant="stickers" />
      <Phone p={p} mode="page" live studio={studio} variant="composer" />
    </div>
  )
}

// MARK: the blue "+" between two messages (mouse)

interface Gap { after: string; y: number }

function phoneRect() {
  return (document.querySelector('.bench [data-anchor="phone"]') as HTMLElement | null)?.getBoundingClientRect()
}

function rowRects() {
  return Array.from(document.querySelectorAll<HTMLElement>('.bench .stage .phone.live .row[data-row]'))
    .map(el => ({ id: el.dataset.row!, r: el.getBoundingClientRect() }))
    .sort((a, b) => a.r.top - b.r.top)
}

function HoverInsert({ studio }: { studio: Studio }) {
  const busy = useStudio(sel(s => !!s.floating || !!s.editing || !!s.playing || s.showLibrary), false)
  const [gap, setGap] = useState<Gap>()
  const onHandle = useRef(false)
  const hide = useRef(0)

  useEffect(() => {
    const stage = document.querySelector('.bench .stage') as HTMLElement | null
    if (!stage) return
    const move = (ev: PointerEvent) => {
      if (ev.buttons) { setGap(undefined); return }
      const phone = phoneRect()
      if (!phone || ev.clientX < phone.left - 24 || ev.clientX > phone.right + 24) { if (!onHandle.current) setGap(undefined); return }
      const rows = rowRects()
      let found: Gap | undefined
      for (let i = 0; i < rows.length; i++) {
        const y = i + 1 < rows.length ? (rows[i].r.bottom + rows[i + 1].r.top) / 2 : rows[i].r.bottom
        if (Math.abs(ev.clientY - y) < 7) { found = { after: rows[i].id, y }; break }
      }
      if (!found && onHandle.current) return
      setGap(old => (old?.after === found?.after && Math.abs((old?.y ?? 0) - (found?.y ?? 0)) < 0.5 ? old : found))
    }
    const leave = () => { hide.current = window.setTimeout(() => { if (!onHandle.current) setGap(undefined) }, 300) }
    const scroll = () => setGap(undefined)
    stage.addEventListener('pointermove', move)
    stage.addEventListener('pointerleave', leave)
    stage.addEventListener('scroll', scroll)
    return () => { stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerleave', leave); stage.removeEventListener('scroll', scroll); window.clearTimeout(hide.current) }
  }, [])

  const phone = phoneRect()
  if (!gap || busy || !phone) return null
  const x = Math.max(phone.left, 17)
  return (
    <>
      <div className="insert-line" style={{ left: phone.left + 14, width: phone.width - 24, top: gap.y }} />
      <button className="insert-plus" style={{ left: x, top: gap.y }} title={t('Insert here')} aria-label={t('Insert here')}
        onPointerEnter={() => { onHandle.current = true; window.clearTimeout(hide.current) }}
        onPointerLeave={() => { onHandle.current = false }}
        onClick={ev => {
          ev.stopPropagation()
          onHandle.current = false
          studio.openFloating({ kind: 'insert', after: gap.after }, ev.currentTarget.getBoundingClientRect())
        }}>
        <Lu name="plus" size={13} strokeWidth={3} />
      </button>
    </>
  )
}

// MARK: toolbars over what you tap (touch)

function SelectionLayer({ studio }: { studio: Studio }) {
  const selection = useStudio(sel(s => s.selection), undefined)
  const floating = useStudio(sel(s => s.floating), undefined)
  const quiet = useStudio(sel(s => !!s.editing || !!s.playing || s.showLibrary), false)
  const pageSelected = useStudio(sel(s => s.pageSelected), false)
  const pageTap = useStudio(sel(s => s.pageTap), undefined)
  const p = useStudio(sel(s => s.project), studio.project)
  useStudio(sel(s => s.anchor), undefined)
  const [, tick] = useState(0)
  useLayoutEffect(() => {
    const on = () => tick(n => n + 1)
    const stage = document.querySelector('.bench .stage')
    window.addEventListener('resize', on)
    stage?.addEventListener('scroll', on)
    return () => { window.removeEventListener('resize', on); stage?.removeEventListener('scroll', on) }
  }, [])
  const stage = (document.querySelector('.bench .stage') as HTMLElement | null)?.getBoundingClientRect()
  const phone = phoneRect()
  if (!stage || !phone || quiet) return null

  const entry = selection ? p.entries.find(x => x.id === selection) : undefined
  const row = entry ? document.querySelector(`.bench .stage [data-row="${entry.id}"]`) as HTMLElement | null : null
  const rect = (row?.querySelector('.hit') as HTMLElement | null ?? row)?.getBoundingClientRect()
  const rowRect = row?.getBoundingClientRect()
  const barShown = !!entry && !!rect && rect.bottom > stage.top + 8 && rect.top < stage.bottom - 8 && (!floating || floating.kind === 'more')
  const handleShown = !!entry && !!rowRect && rowRect.bottom > stage.top && rowRect.bottom < stage.bottom - 4 && (!floating || floating.kind === 'insert')
  const pageShown = pageSelected && !selection && (!floating || floating.kind === 'page')
  const x = Math.max(phone.left, 17)
  return (
    <>
      {barShown && <EntryActionBar entry={entry!} anchor={rect!} top={stage.top} bottom={stage.bottom} />}
      {handleShown && (
        <>
          <div className="insert-line" style={{ left: phone.left + 14, width: phone.width - 24, top: rowRect!.bottom }} />
          <button className="insert-plus" style={{ left: x, top: rowRect!.bottom }} title={t('Insert here')}
            onClick={ev => { ev.stopPropagation(); studio.openFloating({ kind: 'insert', after: entry!.id }, ev.currentTarget.getBoundingClientRect()) }}>
            <Lu name="plus" size={13} strokeWidth={3} />
          </button>
        </>
      )}
      {pageShown && (
        <>
          <div className="page-corners" style={{ left: phone.left - 8, top: phone.top - 8, width: phone.width + 16, height: phone.height + 16 }} />
          <PageActionBar anchor={{ x: (pageTap?.x ?? phone.left + phone.width / 2) - 1, y: (pageTap?.y ?? phone.top + 80) - 6, w: 2, h: 12 }} top={stage.top} bottom={stage.bottom} />
        </>
      )}
    </>
  )
}

// MARK: the people, under the phone

function CastStrip({ studio, p }: { studio: Studio; p: Project }) {
  useStudio(sel(s => s.sender), undefined)
  const r = projectRules(p)
  const assistant = isAssistant(r)
  const cast = castOf(p)
  const rowRef = useRef<HTMLDivElement>(null)
  const pull = useRef<{ y: number } | undefined>(undefined)
  return (
    <div className="cast" onClick={ev => ev.stopPropagation()}
      onPointerDown={ev => { if (!assistant) pull.current = { y: ev.clientY } }}
      onPointerUp={ev => { if (pull.current && pull.current.y - ev.clientY > 24) studio.store.set({ showLibrary: true }); pull.current = undefined }}>
      {assistant
        ? <div style={{ height: 16 }} />
        : <button className="grip" title={t('Library')} aria-label={t('Library')} onClick={() => studio.store.set({ showLibrary: !studio.s.showLibrary })}><i /></button>}
      <div className="cast-scroll" ref={rowRef}>
        <div className="cast-row">
          {cast.map(person => <CastKey key={person.id} studio={studio} p={p} person={person} />)}
          {!assistant && <AddKey studio={studio} p={p} />}
        </div>
      </div>
    </div>
  )
}

function CastKey({ studio, p, person }: { studio: Studio; p: Project; person: Person }) {
  const r = projectRules(p)
  const speaking = useStudio(sel(() => studio.activeSender() === person.id), false)
  const carded = useStudio(sel(s => s.floating?.kind === 'avatar' && s.floating.person === person.id), false)
  const [targeted, setTargeted] = useState(false)
  const square = platformOf(p.template) === 'wechat'
  const isSelf = hasSelf(r) && p.selfID === person.id
  const isAuthor = has(r, 'author') && p.authorID === person.id
  const ai = isAssistant(r) && person.id !== p.selfID
  const ringRadius = (square ? 4 : 20) + 3.5
  return (
    <span className={cx('cast-key', targeted && 'targeted')} title={person.name} aria-label={person.name} draggable
      onDragStart={ev => setPayload(ev.dataTransfer, { type: 'person', id: person.id })}
      onClick={ev => {
        ev.stopPropagation()
        if (speaking) studio.openFloating({ kind: 'avatar', person: person.id }, ev.currentTarget.getBoundingClientRect())
        else studio.setSender(person.id)
      }}
      onDragOver={ev => { ev.preventDefault(); if (!targeted) { setTargeted(true); studio.sound('lift') } }}
      onDragLeave={() => setTargeted(false)}
      onDrop={ev => {
        ev.preventDefault()
        setTargeted(false)
        const file = imageFile(ev.dataTransfer)
        if (file) { void studio.deliver(file, { kind: 'avatar', person: person.id }); return }
        const pl = readPayload(ev.dataTransfer)
        if (pl?.type === 'persona') studio.fillPerson(person.id, pl.id)
      }}>
      {ai ? <AssistantMark size={40} /> : <Face person={person} size={40} square={square} />}
      {(speaking || targeted) && <i className="ink-ring" style={{ borderRadius: ringRadius }} />}
      {isSelf
        ? <span className="cast-badge"><Lu name="user" size={11} strokeWidth={2.6} /></span>
        : isAuthor ? <span className="cast-badge"><Lu name="crown" size={10} strokeWidth={2.4} style={{ fill: 'currentColor' }} /></span> : null}
      {carded && <i className="cast-marks" />}
    </span>
  )
}

/** "+": in a chat, add a person; in comments, "someone new" — pick it and every comment comes from a new person. */
function AddKey({ studio, p }: { studio: Studio; p: Project }) {
  const r = projectRules(p)
  const fresh = freshSender(r)
  const current = useStudio(sel(() => fresh && studio.activeSender() === undefined), false)
  const [targeted, setTargeted] = useState(false)
  const square = platformOf(p.template) === 'wechat'
  return (
    <span className={cx('add-key', current && 'current', targeted && 'targeted', square && 'square')}
      title={fresh ? t('Next comment from someone new') : t('Add person')} aria-label={fresh ? t('Next comment from someone new') : t('Add person')}
      onClick={ev => { ev.stopPropagation(); if (fresh) studio.setFreshSender(); else studio.addPerson() }}
      onDragOver={ev => { ev.preventDefault(); if (!targeted) { setTargeted(true); studio.sound('lift') } }}
      onDragLeave={() => setTargeted(false)}
      onDrop={async ev => {
        ev.preventDefault()
        setTargeted(false)
        const pl = readPayload(ev.dataTransfer)
        if (pl?.type === 'persona') { studio.addFromPersona(pl.id); return }
        const file = imageFile(ev.dataTransfer)
        if (file) {
          const before = new Set(studio.project.people.map(x => x.id))
          studio.addPerson()
          const added = studio.project.people.find(x => !before.has(x.id))
          if (added) void studio.deliver(file, { kind: 'avatar', person: added.id })
        }
      }}>
      <Lu name={fresh ? 'userPlus' : 'plus'} size={16} strokeWidth={2} />
      {current && <i className="ink-ring" style={{ borderRadius: (square ? 4 : 20) + 3.5 }} />}
    </span>
  )
}

// MARK: the avatar library

function LibraryDrawer({ studio, p }: { studio: Studio; p: Project }) {
  const personas = useLibrary()
  const [editing, setEditing] = useState(false)
  const [targeted, setTargeted] = useState(false)
  const [pull, setPull] = useState(0)
  const drag = useRef<{ y: number } | undefined>(undefined)
  const used = new Set(p.people.map(x => x.name))
  const close = () => studio.store.set({ showLibrary: false })
  return (
    <div className="library-wrap" onClick={ev => ev.stopPropagation()}>
      <div className={cx('library', targeted && 'targeted')} style={{ transform: pull > 0 ? `translateY(${pull}px)` : undefined }}
        onDragOver={ev => { if (ev.dataTransfer.types.includes('Files') || ev.dataTransfer.types.includes('application/x-mimic')) { ev.preventDefault(); setTargeted(true) } }}
        onDragLeave={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setTargeted(false) }}
        onDrop={async ev => {
          ev.preventDefault()
          setTargeted(false)
          const pl = readPayload(ev.dataTransfer)
          if (pl?.type === 'person') { studio.savePerson(pl.id); return }
          const files = Array.from(ev.dataTransfer.files).filter(f => f.type.startsWith('image/'))
          await addPersonas(studio, files)
        }}>
        <div className="lib-head"
          onPointerDown={ev => {
            // the buttons in the header must still get their clicks: capturing the pointer would steal them
            if ((ev.target as HTMLElement).closest('button')) return
            drag.current = { y: ev.clientY }; ev.currentTarget.setPointerCapture(ev.pointerId)
          }}
          onPointerMove={ev => { if (drag.current) setPull(Math.max(0, ev.clientY - drag.current.y)) }}
          onPointerUp={ev => { if (drag.current && ev.clientY - drag.current.y > 80) close(); drag.current = undefined; setPull(0) }}>
          <i className="lib-grip" />
          <div className="lib-title">
            <span className="lib-name">{t('Library')}</span>
            <span className="lib-count">{personas.length}</span>
            <span className="grow" />
            <RoundButton icon="imagePlus" title={t('Import photos')} onClick={async () => addPersonas(studio, await pickFile('image/*', true))} />
            <RoundButton icon="shuffle" title={t('Shuffle people')} onClick={() => studio.shuffleCast()} />
            <RoundButton icon={editing ? 'check' : 'pencil'} title={editing ? t('Done') : t('Edit')} on={editing} onClick={() => setEditing(!editing)} />
          </div>
        </div>
        <div className="lib-cast">
          <div className="cast-row">
            {castOf(p).map(person => <CastKey key={person.id} studio={studio} p={p} person={person} />)}
            <AddKey studio={studio} p={p} />
          </div>
        </div>
        <div className="lib-rule" />
        <div className="lib-grid">
          {personas.map(x => <PersonaTile key={x.id} studio={studio} p={p} persona={x} editing={editing} used={used.has(x.name)} />)}
          {!editing && (
            <button className="persona new" title={t('New person')} onClick={() => addBlankPersona(studio)}>
              <span className="persona-new"><Lu name="plus" size={18} /></span>
              <span className="persona-name gray">{t('New')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RoundButton({ icon, title, on, onClick }: { icon: Parameters<typeof Lu>[0]['name']; title: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={cx('round-button', on && 'on')} title={title} aria-label={title} onClick={ev => { ev.stopPropagation(); onClick() }}>
      <Lu name={icon} size={16} />
    </button>
  )
}

async function addPersonas(studio: Studio, files: File[]) {
  const { importImage, MAX_PIXELS } = await import('../store/assets')
  let n = 0
  for (const f of files) {
    try {
      const ref = await importImage(f, MAX_PIXELS.avatar)
      library.add(t('New person {0}', library.all().length + 1), ref)
      n++
    } catch { /* skip unreadable */ }
  }
  if (n) { studio.say(t('Added {0} to the library', n)); studio.sound('save') }
}

function addBlankPersona(studio: Studio) {
  library.add(t('New person {0}', library.all().length + 1))
  studio.sound('save')
}

function PersonaTile({ studio, p, persona, editing, used }: { studio: Studio; p: Project; persona: Persona; editing: boolean; used: boolean }) {
  const url = useAsset(persona.avatar) ?? critterURL(persona.color)
  const [renaming, setRenaming] = useState(false)
  const [targeted, setTargeted] = useState(false)
  const square = platformOf(p.template) === 'wechat'
  const radius = square ? 5.2 : 26
  return (
    <div className={cx('persona', targeted && 'targeted')} draggable={!editing && !renaming} style={{ opacity: used && !editing ? 0.4 : 1 }}
      title={persona.name}
      onDragStart={ev => setPayload(ev.dataTransfer, { type: 'persona', id: persona.id })}
      onClick={() => { if (editing) void studio.requestImage({ kind: 'persona', id: persona.id }); else studio.fillSender(persona.id) }}
      onDoubleClick={ev => { ev.stopPropagation(); setRenaming(true) }}
      onDragOver={ev => { if (ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); if (!targeted) { setTargeted(true); studio.sound('lift') } } }}
      onDragLeave={() => setTargeted(false)}
      onDrop={ev => {
        setTargeted(false)
        const f = imageFile(ev.dataTransfer)
        if (!f) return
        ev.preventDefault(); ev.stopPropagation()
        void studio.deliver(f, { kind: 'persona', id: persona.id })
      }}>
      <span className="persona-face">
        <img src={url} alt="" draggable={false} style={{ borderRadius: radius }} />
        {targeted && <i className="ink-ring" style={{ borderRadius: radius + 3.5 }} />}
        {editing && (
          <button className="persona-remove" title={t('Remove from library')} aria-label={t('Remove from library')}
            onClick={ev => { ev.stopPropagation(); library.remove(persona.id); studio.sound('delete') }}><Lu name="minus" size={11} strokeWidth={3.2} /></button>
        )}
        {editing && <span className="persona-camera"><Lu name="camera" size={10} strokeWidth={2.4} /></span>}
      </span>
      {renaming
        ? <input className="persona-name" autoFocus defaultValue={persona.name} onClick={ev => ev.stopPropagation()}
          onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') setRenaming(false) }}
          onBlur={ev => { const v = ev.currentTarget.value.trim(); if (v) library.update(persona.id, x => ({ ...x, name: v.slice(0, 35) })); setRenaming(false) }} />
        : <span className="persona-name">{persona.name}</span>}
    </div>
  )
}

// MARK: notices and export progress

function NoticeToast({ studio }: { studio: Studio }) {
  const notice = useStudio(sel(s => s.notice), undefined)
  const job = useStudio(sel(s => s.exporting), undefined)
  if (job) {
    const percent = Math.round((job.done / Math.max(1, job.total)) * 100)
    return (
      <div className="toast frost">
        <span className="toast-bar"><i style={{ width: `${percent}%` }} /></span>
        <span className="toast-num">{t('Exporting {0}%', percent)}</span>
        <GlyphButton icon="x" title={t('Cancel')} size={26} glyph={12} tint="var(--gray)"
          onClick={() => { cancelExport.current = true; studio.store.set({ exporting: undefined }) }} />
      </div>
    )
  }
  if (!notice) return null
  return <div className="toast frost" key={notice} onClick={() => studio.store.set({ notice: undefined })}><span className="toast-text">{notice}</span></div>
}

// MARK: keyboard

function keyboardShortcuts(studio: Studio) {
  const isTyping = (el: EventTarget | null) => {
    const e = el as HTMLElement | null
    return !!e && (e.isContentEditable || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA')
  }
  const down = (ev: KeyboardEvent) => {
    const mod = ev.metaKey || ev.ctrlKey
    const s = studio.s
    if (mod && ev.key.toLowerCase() === 'z' && !isTyping(ev.target)) {
      ev.preventDefault()
      if (ev.shiftKey) studio.redo(); else studio.undo()
      return
    }
    if (mod && ev.key.toLowerCase() === 'y' && !isTyping(ev.target)) { ev.preventDefault(); studio.redo(); return }
    if (isTyping(ev.target)) return
    if (s.playing) {
      if (ev.key === 'Escape' || ev.key === ' ') { ev.preventDefault(); studio.stop() }
      return
    }
    if (mod && ev.shiftKey && ev.key.toLowerCase() === 'v') { ev.preventDefault(); studio.openFloating({ kind: 'paste' }, { x: 0, y: 0, w: 0, h: 0 }); return }
    if (mod && ev.key.toLowerCase() === 'd' && s.selection) { ev.preventDefault(); studio.duplicate(s.selection); return }
    if (mod && ev.key.toLowerCase() === 'e') {
      ev.preventDefault()
      if (ev.altKey && s.selection) { const id = s.selection; void import('../export/actions').then(m => m.exportEntryNow(studio, id)); return }
      void import('../export/actions').then(m => (ev.shiftKey ? m.exportVideoNow(studio) : m.exportScreenshotNow(studio)))
      return
    }
    if (mod && /^[0-9]$/.test(ev.key)) { ev.preventDefault(); studio.pickSender(Number(ev.key)); return }
    if (mod) return
    switch (ev.key) {
      case 'Escape':
        if (s.floating) studio.closeFloating()
        else if (s.showLibrary) studio.store.set({ showLibrary: false })
        else studio.clearSelection()
        break
      case 'Backspace': case 'Delete': if (s.selection) { ev.preventDefault(); studio.delete(s.selection) } break
      case 'Enter': if (s.selection) { ev.preventDefault(); studio.editSelected() } else studio.focusComposer(); break
      case 'ArrowUp': ev.preventDefault(); studio.moveSelection(-1); break
      case 'ArrowDown': ev.preventDefault(); studio.moveSelection(1); break
      case ' ': {
        ev.preventDefault()
        void import('../video/timeline').then(({ Timeline }) => {
          const tl = new Timeline(studio.project, true)
          studio.play(s.selection ? tl.begin(s.selection) ?? 0 : 0)
        })
        break
      }
      case 'Tab':
        ev.preventDefault()
        if (s.selection) studio.cycleAuthor(s.selection, ev.shiftKey ? -1 : 1)
        else studio.cycleSender(ev.shiftKey ? -1 : 1)
        break
      default:
        if (/^[0-9]$/.test(ev.key)) studio.pickSender(Number(ev.key))
    }
  }
  const paste = (ev: ClipboardEvent) => {
    if (isTyping(ev.target) || !ev.clipboardData || studio.s.playing) return
    const file = Array.from(ev.clipboardData.files).find(f => f.type.startsWith('image/'))
    if (file) { ev.preventDefault(); void studio.deliver(file, { kind: 'newEntry', after: studio.s.selection }); return }
    const text = ev.clipboardData.getData('text/plain')
    if (text.trim()) { ev.preventDefault(); studio.pasteText(text, studio.s.selection) }
  }
  window.addEventListener('keydown', down)
  window.addEventListener('paste', paste)
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('paste', paste) }
}

export { useStudioRef }
