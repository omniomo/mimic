// WhatsApp (iOS "liquid glass", 2026). Sizes and colors from memory; compare with real screenshots.
// The chat background doodle is our own drawing, not WhatsApp's.

import type * as R from 'react'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, Img, NoticeText, RowShell, cx, editOn, usePerson } from '../parts'
import { ComposerField, PlusButton, useComposerHasText } from '../shared'
import { FileIcon, MapThumb, Waveform, fileExt } from '../cards'
import { Tail } from './imessage'
import type { ComposerProps, Skin } from '../skin'
import { contactOf, has } from '../../model/rules'
import { effectiveReceipt, quoteParts, statusLine, voiceDuration } from '../../model/project'
import { isBubble, messageClock } from '../../model/time'
import type { Entry, Receipt } from '../../model/types'
import { IO, Io, type IoName } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './whatsapp.css'

const NAME_LIGHT = ['#1F7AEC', '#D3396D', '#00A884', '#C75B00', '#7F66FF', '#0F8FA6', '#A14ECF', '#6F8F00']
const NAME_DARK = ['#53BDEB', '#FF72A1', '#06CF9C', '#FFA97A', '#A791FF', '#5BC9E3', '#D88BFF', '#B7D334']
export const waNameColor = (dark: boolean, i: number) => (dark ? NAME_DARK : NAME_LIGHT)[Math.abs(i) % 8]

/** Faint scattered glyphs as a tiled background (our own drawing). */
export function doodleURL(color: string, symbols: IoName[] = ['heart', 'star', 'music', 'camera', 'ribbon', 'gift', 'paperPlane', 'chat', 'call', 'sparklesO', 'globe', 'bookmark', 'image', 'happy', 'flash', 'radio']) {
  const step = 52
  let body = ''
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const seed = row * 31 + col * 17
      const name = symbols[seed % symbols.length]
      const g = IO[name]
      const x = col * step + (row % 2 === 0 ? 0 : step / 2) + (seed % 7) - 3 + 8
      const y = row * step + ((seed / 3) % 9 | 0) - 4 + 8
      const rot = (seed % 5) * 9 - 18
      body += `<g transform="translate(${x} ${y}) rotate(${rot} 8.5 8.5)"><svg width="17" height="17" viewBox="${g[0]}" fill="${color}" stroke="${color}">${g[2]}</svg></g>`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${step * 4}" height="${step * 4}">${body}</svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/** Telegram reuses these rows with a few differences. */
export interface BubbleOptions {
  names: (dark: boolean, index: number) => string
  /** Reactions as a pill inside the bubble (Telegram) instead of hanging below (WhatsApp). */
  reactionInside: boolean
  voice: 'avatar' | 'circle'
  /** Contact card's action ("Message" / "View Contact"). */
  cardAction: (tx: (zh: string, en: string) => string) => string
  /** Call title when empty (Telegram writes the direction). */
  callTitle?: (out: boolean, tx: (zh: string, en: string) => string) => string
  deleted: boolean
}

const WA_OPTIONS: BubbleOptions = {
  names: waNameColor, reactionInside: false, voice: 'avatar', deleted: true,
  cardAction: tx => tx('发消息', 'Message'),
}
const Opts = createContext<BubbleOptions>(WA_OPTIONS)

function Backdrop() {
  const { dark } = useScene()
  const url = useMemo(() => doodleURL(dark ? 'rgba(255,255,255,0.045)' : 'rgba(90,74,58,0.075)'), [dark])
  return <div className="doodle" style={{ backgroundImage: url }} />
}

function Nav({ typing }: { typing?: boolean }) {
  const scene = useScene()
  const p = scene.p
  const group = !has(scene.rules, 'contactTitle')
  const editingStatus = useStudio(s => s.editing === 'status', false)
  const editingBadge = useStudio(s => s.editing === 'badge', false)
  const subtitle = typing ? scene.tx('正在输入…', 'typing…') : statusLine(p)
  const contact = contactOf(p)
  const badge = p.backBadge ?? ''
  return (
    <div className="nav wa-nav">
      <span className={cx('wa-glass wa-back', (badge || editingBadge) && 'wide')} {...editOn(scene.live ? scene.studio : null, 'badge')}>
        <Io name="back" size={20} />
        {(badge || editingBadge) && <Ed k="badge" value={badge} multiline={false} />}
      </span>
      {!group && contact ? <Avatar person={contact} size={36} /> : <span className="wa-groupface"><Io name="people" size={17} /></span>}
      <div className="wa-titles">
        <Ed k="title" value={p.title} className="wa-title" multiline={false} />
        {(subtitle || editingStatus) && <Ed k="status" value={subtitle} className="wa-status" multiline={false} />}
      </div>
      <span className="wa-glass wa-calls"><Io name="video" size={21} /><Io name="call" size={18} /></span>
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  return (
    <div className="wa-composer">
      <PlusButton><Io name="add" size={28} /></PlusButton>
      <span className="wa-glass wa-field">
        <ComposerField placeholder="" typed={typed} live={live} />
        <Io name="smile" size={21} className="wa-meta-c" />
      </span>
      {hasText
        ? <span className="wa-send" onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}><Io name="send" size={17} /></span>
        : <span className="wa-actions">
            <span onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'image') } : undefined}><Io name="camera" size={23} /></span>
            <span onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'voice') } : undefined}><Io name="mic" size={23} /></span>
          </span>}
    </div>
  )
}

export function Ticks({ receipt, className }: { receipt: Receipt; className?: string }) {
  if (receipt === 'pending') return <Io name="clock" size={11} className={className} />
  if (receipt === 'sent') return <svg className={className} width="12" height="10" viewBox="0 0 12 10"><path d="M1.5 5.2 4.3 8 10.5 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  return (
    <svg className={cx(className, receipt === 'read' && 'read')} width="17" height="10" viewBox="0 0 17 10">
      <path d="M1.5 5.2 4.3 8 10.5 1.8M7.4 7.2l.8.8 6.2-6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Meta({ e, onMedia, ghost }: { e: Entry; onMedia?: boolean; ghost?: boolean }) {
  const scene = useScene()
  const studio = scene.live && !ghost ? scene.studio : null
  const receipt = effectiveReceipt(scene.p, e, scene.holder)
  const clock = messageClock(scene.p, e, scene.dates)
  return (
    <span className={cx('wa-meta', onMedia && 'on-media')}>
      {e.edited && has(scene.rules, 'edited') && <span>{scene.tx('已编辑', 'Edited')}</span>}
      {ghost ? <span>{clock}</span> : <Ed k={`metadata:${e.id}`} value={clock} multiline={false} />}
      {receipt && <span className="wa-ticks" onClick={studio ? ev => { ev.stopPropagation(); studio.cycleReceipt(e.id) } : undefined}><Ticks receipt={receipt} /></span>}
    </span>
  )
}

/** Text with the time and ticks tucked into the last line (an invisible copy reserves their room). */
function TextWithMeta({ e, children }: { e: Entry; children: ReactNode }) {
  return (
    <div className="wa-textwrap">
      {children}
      <span className="wa-reserve" aria-hidden="true"><Meta e={e} ghost /></span>
      <span className="wa-meta-pos"><Meta e={e} /></span>
    </div>
  )
}

export function bubbleRow(opts: BubbleOptions) {
  return function BubbleRow(props: RowProps) {
    return <Opts.Provider value={opts}><Row {...props} /></Opts.Provider>
  }
}

function Row({ e, prev, next, isolated }: RowProps) {
  const opts = useContext(Opts)
  const scene = useScene()
  const p = scene.p
  const person = usePerson(e)
  const out = e.personID === scene.viewer
  const group = has(scene.rules, 'groupNames')
  const joinsNext = !isolated && !!next && isBubble(p, next) && next.personID === e.personID
  const joinsPrev = !isolated && !!prev && isBubble(p, prev) && prev.personID === e.personID
  const reacted = e.isLiked && has(scene.rules, 'reaction') && e.kind !== 'recall'
  const failed = out && !!e.failed && has(scene.rules, 'failed')
  const studio = scene.live ? scene.studio : null
  const showsName = group && !out && !joinsPrev
  return (
    <RowShell e={e} className={cx('wa-row', out ? 'out' : 'in', joinsPrev && 'joins-prev', joinsNext && 'joins-next')}>
      {failed && <span className="wa-failed" onDoubleClick={studio ? () => studio.toggleFailed(e.id) : undefined}><Io name="alert" size={22} /></span>}
      {group && !out && <span style={{ opacity: joinsNext ? 0 : 1 }}><Avatar person={person} size={28} entry={e.id} /></span>}
      <div className={cx('wa-content', reacted && 'reacted')}>
        <Content e={e} out={out} tail={!joinsNext} showsName={showsName} reacted={reacted && opts.reactionInside} />
        {reacted && !opts.reactionInside && <span className="wa-reaction" onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.setReaction(e.id, undefined) } : undefined}>{e.reaction ?? '❤️'}</span>}
      </div>
    </RowShell>
  )
}

function Name({ e }: { e: Entry }) {
  const opts = useContext(Opts)
  const scene = useScene()
  const person = usePerson(e)
  const index = Math.max(0, scene.p.people.findIndex(x => x.id === person.id))
  return <Ed k={`name:${e.id}`} value={person.name} className="wa-name" style={{ color: opts.names(scene.dark, index) }} multiline={false} />
}

function Quote({ e, out }: { e: Entry; out: boolean }) {
  const opts = useContext(Opts)
  const scene = useScene()
  const p = scene.p
  const editing = useStudio(s => s.editing === `quote:${e.id}`, false)
  const parts = quoteParts(p, e.quote)
  const mine = parts.person !== undefined && parts.person === p.selfID
  const index = parts.person ? Math.max(0, p.people.findIndex(x => x.id === parts.person)) : 0
  const color = mine ? 'var(--wa-green)' : opts.names(scene.dark, index)
  return (
    <div className={cx('wa-quote', out && 'out')} {...editOn(scene.live ? scene.studio : null, `quote:${e.id}`)}>
      <i style={{ background: color }} />
      <div className="wa-quote-text">
        {editing ? <Ed k={`quote:${e.id}`} value={e.quote} /> : <>
          {parts.name && <b style={{ color }}>{parts.name}</b>}
          <span>{parts.text}</span>
        </>}
      </div>
    </div>
  )
}

function Content({ e, out, tail, showsName, reacted }: { e: Entry; out: boolean; tail: boolean; showsName: boolean; reacted?: boolean }) {
  const opts = useContext(Opts)
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  if (e.kind === 'image') {
    return (
      <div className="wa-media">
        {showsName && <Name e={e} />}
        <div className="wa-media-box">
          <ImageContent e={e} maxW={262} maxH={330} radius={14} />
          <span className="wa-media-meta"><Meta e={e} onMedia /></span>
        </div>
      </div>
    )
  }
  if (e.kind === 'sticker') {
    return (
      <div className={cx('wa-sticker', out && 'out')}>
        <ImageContent e={e} maxW={140} maxH={140} radius={4} />
        <span className="wa-chip"><Meta e={e} /></span>
      </div>
    )
  }
  const pick = studio ? { onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'entry', id: e.id }) } } : {}
  let body: ReactNode
  switch (e.kind) {
    case 'recall':
      body = <div className="wa-deleted"><Io name="closeCircle" size={15} /><i>{out ? scene.tx('你删除了此消息', 'You deleted this message') : scene.tx('此消息已删除', 'This message was deleted')}</i><Meta e={e} /></div>
      break
    case 'voice': {
      const played = out || !e.unread
      body = (
        <div className="wa-voice">
          {!out && opts.voice === 'avatar' && <VoiceFace e={e} played={played} />}
          {opts.voice === 'circle'
            ? <span className="tg-play"><Io name="play" size={18} /></span>
            : <Io name="play" size={24} className="wa-meta-c" />}
          <div className="wa-voice-mid">
            <div className="wa-wave">
              <Waveform seconds={voiceDuration(e)} width={150} color="var(--wa-meta)" seed={e.id.charCodeAt(1)} />
              <i className={cx('wa-knob', !played && 'unplayed')} onClick={studio && !out ? ev => { ev.stopPropagation(); studio.toggleUnread(e.id) } : undefined} />
            </div>
            <div className="wa-voice-foot">
              <Ed k={`seconds:${e.id}`} value={`0:${String(voiceDuration(e)).padStart(2, '0')}`} multiline={false} />
              <Meta e={e} />
            </div>
          </div>
          {out && opts.voice === 'avatar' && <VoiceFace e={e} played={played} />}
        </div>
      )
      break
    }
    case 'link': {
      const site = e.source ?? ''
      body = (
        <div className="wa-link">
          <div className={cx('wa-inset', out && 'out')}>
            <div className="wa-link-pic" {...pick}>{e.image ? <Img id={e.image} /> : <Io name="image" size={24} />}</div>
            <div className="wa-link-text">
              <Ed k={`text:${e.id}`} value={e.text} className="wa-strong" />
              <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="wa-sub" />
              <Ed k={`source:${e.id}`} value={site} className="wa-sub small" multiline={false} />
            </div>
          </div>
          <div className="wa-url-line"><span className="wa-url">{site.includes('://') ? site : `https://${site}`}</span><Meta e={e} /></div>
        </div>
      )
      break
    }
    case 'file': {
      const ext = fileExt(e.text)
      body = (
        <div className="wa-file">
          <div className={cx('wa-inset wa-file-box', out && 'out')}>
            <span style={{ transform: 'scale(0.7)', display: 'inline-flex', margin: '-7px -6px' }}><FileIcon name={e.text} /></span>
            <div className="wa-file-text">
              <Ed k={`text:${e.id}`} value={e.text} />
              <span className="wa-sub"><Ed k={`detail:${e.id}`} value={e.detail ?? ''} multiline={false} />{ext && ` · ${ext}`}</span>
            </div>
          </div>
          <div className="wa-meta-right"><Meta e={e} /></div>
        </div>
      )
      break
    }
    case 'location':
      body = (
        <div className="wa-location">
          <div className="wa-map" {...pick}><MapThumb image={e.image} dark={scene.dark} height={150} /></div>
          <Ed k={`text:${e.id}`} value={e.text} className="wa-strong" />
          <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="wa-sub" />
          <div className="wa-meta-right"><Meta e={e} /></div>
        </div>
      )
      break
    case 'card': {
      const owner = scene.p.people.find(x => x.id === e.target) ?? { id: '', name: scene.tx('朋友', 'Friend'), color: 7 }
      body = (
        <div className="wa-card">
          <div className="wa-card-top"><Avatar person={owner} size={42} plain={!e.target} /><Ed k={`text:${e.id}`} value={e.text || owner.name} className="wa-strong" multiline={false} /></div>
          <div className="wa-meta-right"><Meta e={e} /></div>
          <div className="wa-card-action">{opts.cardAction(scene.tx)}</div>
        </div>
      )
      break
    }
    case 'call': {
      const words = `${e.text} ${e.detail ?? ''}`.toLowerCase()
      const missed = /missed|未接|no answer/.test(words)
      body = (
        <div className="wa-call">
          <span className={cx('wa-call-ico', out && 'out', missed && 'missed')}><Io name={e.video ? 'videoFill' : 'callFill'} size={16} /></span>
          <div className="wa-call-text">
            <Ed k={`text:${e.id}`} value={e.text || (opts.callTitle?.(out, scene.tx) ?? '')} className="wa-strong" multiline={false} />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="wa-sub" multiline={false} />
          </div>
          <Meta e={e} />
        </div>
      )
      break
    }
    default:
      body = <TextWithMeta e={e}><Ed k={`text:${e.id}`} value={e.text} /></TextWithMeta>
  }
  return (
    <div className={cx('wa-bubble hit', out ? 'out' : 'in')} {...(e.kind === 'text' ? editOn(studio, `text:${e.id}`) : {})}>
      {showsName && <Name e={e} />}
      {e.quote && e.kind !== 'recall' && <Quote e={e} out={out} />}
      {body}
      {reacted && <span className="tg-reaction" onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.setReaction(e.id, undefined) } : undefined}>{e.reaction ?? '❤️'}</span>}
      {tail && <Tail side={out ? 'right' : 'left'} />}
    </div>
  )
}

function VoiceFace({ e, played }: { e: Entry; played: boolean }) {
  const person = usePerson(e)
  return (
    <span className="wa-voice-face">
      <Avatar person={person} size={42} entry={e.id} />
      <span className={cx('wa-voice-mic', !played && 'unplayed')}><Io name="micFill" size={13} /></span>
    </span>
  )
}

function Notice({ e }: RowProps) {
  const editing = useStudio(s => s.editing === `text:${e.id}`, false)
  const locked = e.kind === 'system' && e.text.startsWith('🔒')
  return (
    <RowShell e={e} className={cx('notice wa-notice', locked && 'locked')}>
      {locked && !editing
        ? <span className="hit wa-chipbox"><Io name="lock" size={11} /> {e.text.slice(2).trim()}</span>
        : <span className="wa-chipbox"><NoticeText e={e} /></span>}
    </RowShell>
  )
}

export const whatsapp: Skin = {
  className: 'sk-whatsapp',
  navHeight: 52,
  composerHeight: 52,
  wall: dark => (dark ? '#0B141A' : '#EFEAE2'),
  Nav,
  Composer,
  Row: bubbleRow(WA_OPTIONS),
  Notice,
  Backdrop,
}
