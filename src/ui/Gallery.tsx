// Projects: where the app opens. One brushed-silver card holds one scene — only that scene's little phone, no name,
// no button; click the resting card to start. Swipe (or ← →, or the dots) for another scene. Recent projects below.
// Scroll up and the header folds into one line. Hold (or right-click) a project: the others fade, and a column of
// duplicate, rename, download and delete appears beside it. .mimic files can be dropped anywhere.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Phone, PHONE_H, PHONE_W } from '../scene/Phone'
import { exampleProject } from '../model/examples'
import { DISPLAY_NAME, FAMILIES, FAMILY_NAME, familyBase, rememberAssistant, type Family } from '../model/templates'
import { createProject, deleteProject, download, duplicateProject, exportFile, fileName, getProject, importFile, renameProject, useProjects, type ProjectMeta } from '../app/projects'
import { stillPlayback } from '../video/timeline'
import { useAsset } from '../store/assets'
import { play } from '../sound/board'
import { t, locale, setLocale } from '../i18n'
import { Lu } from './icons'
import { GlyphButton, TEMPLATE_GLYPH, cx } from './kit'
import { pickFile } from '../store/studio'

const LAST_FAMILY = 'mimic.lastFamily'

function readFamily(): Family {
  try {
    const v = localStorage.getItem(LAST_FAMILY) as Family | null
    if (v && (FAMILIES as readonly string[]).includes(v)) return v
  } catch { /* ignore */ }
  return locale === 'zh' ? 'wechat' : 'imessage'
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(() => window.innerWidth)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return w
}

export function Gallery({ onOpen }: { onOpen: (id: string) => void }) {
  const works = useProjects()
  const root = useRef<HTMLDivElement>(null)
  const width = useWidth(root)
  const card = Math.max(220, Math.min(width - 72, 360))
  const cardH = Math.round(card * 1.46)
  const margin = width < 500 ? 16 : 28
  const [collapsed, setCollapsed] = useState(false)
  const [family, setFamily] = useState<Family>(readFamily)
  const [deleted, setDeleted] = useState<{ title: string; undo: () => Promise<void> }>()
  const [notice, setNotice] = useState<string>()
  const [dropping, setDropping] = useState(false)
  const [, force] = useState(0)

  const start = async (f: Family, example = false) => {
    try { localStorage.setItem(LAST_FAMILY, f) } catch { /* ignore */ }
    const template = familyBase(f)
    rememberAssistant(template)
    play('select')
    onOpen(await createProject(template, example))
  }

  const importFiles = async (files: File[]) => {
    let last: string | undefined
    for (const f of files) {
      try { last = await importFile(f); play('drop') } catch { setNotice(t('Can’t read this Mimic project.')) }
    }
    if (last && files.length === 1) onOpen(last)
  }

  useEffect(() => {
    if (!deleted) return
    const id = window.setTimeout(() => setDeleted(undefined), 4000)
    return () => window.clearTimeout(id)
  }, [deleted])
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(undefined), 3200)
    return () => window.clearTimeout(id)
  }, [notice])

  return (
    <div className="gallery" ref={root} onScroll={ev => setCollapsed(ev.currentTarget.scrollTop > cardH + 80)}
      onDragOver={ev => { if (ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); setDropping(true) } }}
      onDragLeave={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDropping(false) }}
      onDrop={ev => { ev.preventDefault(); setDropping(false); void importFiles(Array.from(ev.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.mimic') || f.type === 'application/json')) }}>
      <div className="g-header" style={{ paddingLeft: margin, paddingRight: margin }}>
        <h1 className="g-mark">Mimic</h1>
        <p className="g-tagline">{t('Chat and comment screenshots for your videos')}</p>
        <span className="grow" />
        <GlyphButton icon="upload" title={t('Import')} size={30} glyph={16} tint="var(--gray)" onClick={async () => importFiles(await pickFile('.mimic,application/json', true))} />
        <GlyphButton icon="languages" title={locale === 'zh' ? 'English' : '中文'} size={30} glyph={16} tint="var(--gray)"
          onClick={() => { setLocale(locale === 'zh' ? 'en' : 'zh'); force(n => n + 1) }} />
      </div>
      <Deck width={width} card={card} height={cardH} family={family} onFamily={setFamily} onStart={f => void start(f)} />
      {!works.length && (
        <button className="g-example" onClick={() => void start(family, true)}><Lu name="sparkles" size={15} />{t('Try an example')}</button>
      )}
      <Recent works={works} width={width} margin={margin} onOpen={onOpen}
        onDeleted={(title, undo) => setDeleted({ title, undo })} />
      {collapsed && (
        <div className="g-compact" style={{ paddingLeft: margin, paddingRight: margin }}>
          <span className="g-compact-title">{t('Projects')}</span>
          <span className="g-compact-count">{works.length}</span>
          <span className="grow" />
          <GlyphButton icon="plus" title={t('New project')} size={34} glyph={15} filled onClick={() => void start(family)} />
        </div>
      )}
      {dropping && <div className="g-drop" />}
      {deleted && (
        <div className="toast frost g-toast">
          <Lu name="trash" size={14} style={{ color: 'var(--gray)' }} />
          <span className="toast-text">{deleted.title}</span>
          <button className="toast-action" onClick={() => { void deleted.undo(); setDeleted(undefined) }}>{t('Undo')}</button>
        </div>
      )}
      {notice && !deleted && <div className="toast frost g-toast"><span className="toast-text">{notice}</span></div>}
    </div>
  )
}

// MARK: the deck

function Deck({ width, card, height, family, onFamily, onStart }: {
  width: number; card: number; height: number; family: Family; onFamily: (f: Family) => void; onStart: (f: Family) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const samples = useMemo(() => FAMILIES.map(f => exampleProject(familyBase(f))), [])
  const spacing = 12
  const side = Math.max(0, (width - card) / 2)
  const index = FAMILIES.indexOf(family)
  const screen = Math.floor(Math.min(card * 0.62, (height - 60 - 8) * PHONE_W / PHONE_H))
  const phoneH = screen * PHONE_H / PHONE_W
  const radius = screen * 34 / PHONE_W
  const quiet = useRef(false)

  const layout = () => {
    const el = ref.current
    if (!el) return
    const middle = el.scrollLeft + el.clientWidth / 2
    const pitch = card + spacing
    let nearest = 0, best = Infinity
    Array.from(el.children).forEach((child, i) => {
      const c = child as HTMLElement
      const d = Math.min(1, Math.abs(c.offsetLeft + c.offsetWidth / 2 - middle) / pitch)
      if (d < best) { best = d; nearest = i }
      c.style.transform = `scale(${1 - d * 0.07})`
      c.style.opacity = String(1 - d * 0.45)
    })
    const next = FAMILIES[nearest]
    if (next !== family && !quiet.current) { play('tick'); onFamily(next) }
  }

  const go = (i: number, smooth = true) => {
    const el = ref.current
    const c = el?.children[i] as HTMLElement | undefined
    if (!el || !c) return
    el.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2, behavior: smooth ? 'smooth' : 'instant' })
  }

  useLayoutEffect(() => { quiet.current = true; go(index, false); layout(); quiet.current = false }, [card, width])

  return (
    <div className="deck-block">
      <div className="deck" ref={ref} tabIndex={0} onScroll={layout} style={{ paddingLeft: side, paddingRight: side, gap: spacing, height }}
        onKeyDown={ev => {
          if (ev.key === 'ArrowRight') { ev.preventDefault(); go(Math.min(index + 1, FAMILIES.length - 1)) }
          if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(Math.max(index - 1, 0)) }
          if (ev.key === 'Enter') onStart(family)
        }}>
        {FAMILIES.map((f, i) => (
          <button key={f} className="deck-card silver" title={t(FAMILY_NAME[f])} aria-label={t(FAMILY_NAME[f])}
            style={{ width: card, height }} onClick={() => (i === index ? onStart(f) : go(i))}>
            <span className="deck-phone" style={{ padding: 4, borderRadius: radius + 4 }}>
              <span className="deck-screen" style={{ width: screen, height: phoneH, borderRadius: radius }}>
                <span style={{ display: 'block', width: PHONE_W, transform: `scale(${screen / PHONE_W})`, transformOrigin: 'top left' }}>
                  <Phone p={samples[i]} mode="screen" playback={stillPlayback(samples[i])} />
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="deck-dots">
        {FAMILIES.map((f, i) => (
          <button key={f} className={cx('deck-dot', i === index && 'on')} title={t(FAMILY_NAME[f])} aria-label={t(FAMILY_NAME[f])} onClick={() => go(i)}><i /></button>
        ))}
      </div>
    </div>
  )
}

// MARK: recent projects

function relative(ms: number) {
  const fmt = new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { numeric: 'always', style: 'short' })
  const s = (ms - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of units) if (Math.abs(s) >= size) return fmt.format(Math.round(s / size), unit)
  return fmt.format(Math.min(-1, Math.round(s)), 'second')
}

function Recent({ works, width, margin, onOpen, onDeleted }: {
  works: ProjectMeta[]; width: number; margin: number; onOpen: (id: string) => void; onDeleted: (title: string, undo: () => Promise<void>) => void
}) {
  const [held, setHeld] = useState<string>()
  const [renaming, setRenaming] = useState<string>()
  const press = useRef(0)
  const spacing = 12
  const columns = Math.max(3, Math.floor((width - margin * 2 + spacing) / (width < 500 ? 104 : 168)))
  const cardW = Math.max(60, Math.floor((width - margin * 2 - spacing * (columns - 1)) / columns))
  const frame = held ? document.querySelector(`[data-work="${held}"]`)?.getBoundingClientRect() : undefined
  const onRight = frame ? frame.right + 76 < window.innerWidth : true

  return (
    <section className="recent" style={{ paddingLeft: margin, paddingRight: margin }}>
      {works.length > 0 && <h2 className="recent-title">{t('Recent')}</h2>}
      <div className="recent-grid" style={{ gridTemplateColumns: `repeat(${columns}, ${cardW}px)`, columnGap: spacing }}>
        {works.map(w => (
          <div key={w.id} data-work={w.id} className={cx('work', held === w.id && 'held', held && held !== w.id && 'dimmed')}
            onClick={() => { if (held) setHeld(undefined); else if (renaming !== w.id) onOpen(w.id) }}
            onContextMenu={ev => { ev.preventDefault(); setHeld(w.id); play('lift') }}
            onPointerDown={ev => {
              if (ev.pointerType === 'mouse') return
              press.current = window.setTimeout(() => { setHeld(w.id); play('lift') }, 350)
            }}
            onPointerUp={() => window.clearTimeout(press.current)}
            onPointerLeave={() => window.clearTimeout(press.current)}>
            <Thumb id={w.id} width={cardW} />
            {renaming === w.id
              ? <input className="work-name" autoFocus defaultValue={w.title} onClick={ev => ev.stopPropagation()}
                onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') setRenaming(undefined) }}
                onBlur={ev => { const v = ev.currentTarget.value.trim(); if (v) void renameProject(w.id, v); setRenaming(undefined) }} />
              : <div className="work-name">{w.title}</div>}
            <div className="work-meta" title={t(DISPLAY_NAME[w.template])}>
              <Lu name={TEMPLATE_GLYPH[w.template]} size={10} strokeWidth={2.2} />
              <span>{relative(w.updated)}</span>
            </div>
          </div>
        ))}
      </div>
      {held && frame && (
        <>
          <div className="held-catcher" onClick={() => setHeld(undefined)} onContextMenu={ev => { ev.preventDefault(); setHeld(undefined) }} />
          <div className="held-actions" style={{ left: onRight ? frame.right + 16 : frame.left - 64, top: frame.top + 12 }}>
            <HeldButton icon="copyPlus" title={t('Duplicate')} onClick={async () => { setHeld(undefined); await duplicateProject(held, t('copy')) }} />
            <HeldButton icon="pencil" title={t('Rename')} onClick={() => { setRenaming(held); setHeld(undefined) }} />
            <HeldButton icon="share" title={t('Share')} onClick={async () => {
              const id = held
              setHeld(undefined)
              const p = await getProject(id)
              if (!p) return
              const blob = await exportFile(p)
              const name = fileName(works.find(w => w.id === id)?.title ?? 'Mimic', 'mimic')
              const file = new File([blob], name, { type: 'application/json' })
              if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
                try { await navigator.share({ files: [file] }); return } catch { /* fall back to download */ }
              }
              download(blob, name)
            }} />
            <HeldButton icon="trash" title={t('Delete')} tint="var(--red)" onClick={async () => {
              const id = held
              const title = works.find(w => w.id === id)?.title ?? ''
              setHeld(undefined)
              const undo = await deleteProject(id)
              play('delete')
              onDeleted(title, undo)
            }} />
          </div>
        </>
      )}
    </section>
  )
}

function HeldButton({ icon, title, tint, onClick }: { icon: Parameters<typeof Lu>[0]['name']; title: string; tint?: string; onClick: () => void }) {
  return <GlyphButton icon={icon} title={title} size={48} glyph={19} tint={tint} className="frost held-button" onClick={onClick} />
}

function Thumb({ id, width }: { id: string; width: number }) {
  const url = useAsset(`thumb-${id}`)
  return (
    <div className="work-thumb" style={{ width, height: width * PHONE_H / PHONE_W }}>
      {url ? <img src={url} alt="" draggable={false} /> : null}
    </div>
  )
}

