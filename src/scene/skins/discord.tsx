// Discord (mobile, channel view). Flat rows, no bubbles: avatar + name in role color + stamp,
// follow-ups by the same person indented under the name.

import type { ReactNode } from 'react'
import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, RowShell, cx, editOn, usePerson } from '../parts'
import { ComposerField, PlusButton, useComposerHasText } from '../shared'
import { Waveform } from '../cards'
import type { ComposerProps, Skin } from '../skin'
import { has } from '../../model/rules'
import { quoteParts, voiceDuration } from '../../model/project'
import { clockText, isBubble, screenshotDay, startOfDay, timeText, usesTwelveHour } from '../../model/time'
import type { Entry, Person, Project } from '../../model/types'
import { Io, Lu } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './discord.css'

/** Role colors (names). Person.roleColor is an index into this list; none = default name color. */
export const ROLES = ['#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6', '#E91E63', '#F1C40F', '#E67E22', '#E74C3C']
export const roleColor = (index?: number) => index === undefined ? 'var(--dc-strong)' : ROLES[Math.abs(index) % ROLES.length]

function Nav() {
  const scene = useScene()
  return (
    <div className="nav dc-nav">
      <span className="dc-icon dc-back"><Io name="back" size={22} /></span>
      <Lu name="hash" size={20} strokeWidth={2.4} className="dc-hash" />
      <Ed k="title" value={scene.p.title} className="dc-title" multiline={false} />
      <Io name="forward" size={12} className="dc-chev" />
      <span style={{ flex: 1 }} />
      <span className="dc-icon"><Io name="search" size={20} /></span>
      <span className="dc-icon"><Io name="people" size={21} /></span>
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  return (
    <div className="dc-composer">
      <PlusButton icon="add" size={22} className="dc-plus" />
      <span className="dc-field">
        <ComposerField placeholder={scene.tx(`给 #${scene.p.title} 发消息`, `Message #${scene.p.title}`)} typed={typed} live={live} />
        {hasText
          ? <span className="dc-send" onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}><Io name="send" size={14} /></span>
          : <span className="dc-smile" onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'sticker') } : undefined}><Io name="smile" size={21} /></span>}
      </span>
    </div>
  )
}

/** "Today at 9:41 PM", "Yesterday at…", or a full date. The entry's own metadata wins. */
function stamp(p: Project, e: Entry, dates: Map<string, number>) {
  if (e.metadata) return e.metadata
  const date = dates.get(e.id)
  if (date === undefined) return ''
  const zh = p.language === 'chinese'
  const clock = clockText(date, zh, usesTwelveHour(p))
  const days = Math.round((startOfDay(screenshotDay(p)) - startOfDay(date)) / 86_400_000)
  if (days === 0) return zh ? `今天 ${clock}` : `Today at ${clock}`
  if (days === 1) return zh ? `昨天 ${clock}` : `Yesterday at ${clock}`
  const d = new Date(date)
  const two = (n: number) => String(n).padStart(2, '0')
  return zh ? `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())} ${clock}`
    : `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()} ${clock}`
}

function mentionsMe(p: Project, viewer: string | undefined, e: Entry) {
  const name = viewer ? p.people.find(x => x.id === viewer)?.name : undefined
  return !!name && e.text.toLowerCase().includes('@' + name.toLowerCase())
}

/** Text with @mentions as tinted chips. */
function rich(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /@[\p{L}\p{N}._-]+/gu
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    out.push(<span key={m.index} className="dc-mention">{m[0]}</span>)
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Row({ e, prev, isolated }: RowProps) {
  const scene = useScene()
  const p = scene.p
  const person = usePerson(e)
  const replying = !!e.quote && has(scene.rules, 'quote')
  const starts = isolated || replying || !(prev && isBubble(p, prev) && prev.personID === e.personID)
  const reactions = has(scene.rules, 'reactions') ? (e.reactions ?? []) : []
  const studio = scene.live ? scene.studio : null
  return (
    <RowShell e={e} className={cx('dc-row', starts && 'starts', !isolated && mentionsMe(p, scene.viewer, e) && 'at-me')}>
      {replying && <ReplyLine e={e} />}
      <div className="dc-main">
        {starts ? <Avatar person={person} size={40} entry={e.id} /> : <span className="dc-gutter" />}
        <div className="dc-body">
          {starts && <Header e={e} person={person} />}
          <div className="dc-content hit"><Content e={e} /></div>
          {reactions.length > 0 && (
            <div className="dc-reactions">
              {reactions.map(r => (
                <span key={r.emoji} className={cx('dc-reaction', r.mine && 'mine')}
                  onClick={studio ? ev => { ev.stopPropagation(); studio.toggleMyReaction(e.id, r.emoji) } : undefined}>
                  <span className="dc-remoji">{r.emoji}</span>
                  <Ed k={`reaction:${e.id}:${r.emoji}`} value={String(r.count)} className="dc-rcount" multiline={false} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </RowShell>
  )
}

function Header({ e, person }: { e: Entry; person: Person }) {
  const scene = useScene()
  return (
    <div className="dc-header">
      <Ed k={`name:${e.id}`} value={person.name} className="dc-name" style={{ color: roleColor(person.roleColor) }} multiline={false} />
      {person.isBot && has(scene.rules, 'roles') && <span className="dc-app">APP</span>}
      <Ed k={`metadata:${e.id}`} value={stamp(scene.p, e, scene.dates)} className="dc-stamp" multiline={false} />
    </div>
  )
}

function ReplyLine({ e }: { e: Entry }) {
  const scene = useScene()
  const p = scene.p
  const editing = useStudio(s => s.editing === `quote:${e.id}`, false)
  const parts = quoteParts(p, e.quote)
  const replied = parts.person ? p.people.find(x => x.id === parts.person) : undefined
  return (
    <div className="dc-reply" {...editOn(scene.live ? scene.studio : null, `quote:${e.id}`)}>
      <i className="dc-curve" />
      {editing ? <Ed k={`quote:${e.id}`} value={e.quote} multiline={false} /> : <>
        {replied ? <>
          <Avatar person={replied} size={16} plain />
          <b style={{ color: roleColor(replied.roleColor) }}>@{replied.name}</b>
        </> : parts.name ? <b style={{ color: 'var(--dc-strong)' }}>@{parts.name}</b> : null}
        <span className="dc-reply-text">{parts.text}</span>
      </>}
    </div>
  )
}

function Content({ e }: { e: Entry }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  switch (e.kind) {
    case 'image': return <ImageContent e={e} maxW={280} maxH={300} radius={8} />
    case 'sticker': return <ImageContent e={e} maxW={140} maxH={140} radius={4} />
    case 'voice':
      return (
        <span className="dc-voice" {...editOn(studio, `seconds:${e.id}`)}>
          <span className="dc-play"><Io name="play" size={14} /></span>
          <Waveform seconds={voiceDuration(e)} width={88} color="var(--dc-muted)" seed={e.id.charCodeAt(2)} />
          <Ed k={`seconds:${e.id}`} value={`0:${String(voiceDuration(e)).padStart(2, '0')}`} className="dc-dur" multiline={false} />
        </span>
      )
    case 'link': {
      const site = e.source ?? ''
      return (
        <div className="dc-link">
          <span className="dc-url">{site.includes('://') ? site : 'https://' + site}</span>
          <div className="dc-embed">
            <Ed k={`source:${e.id}`} value={site} className="dc-site" multiline={false} />
            <Ed k={`text:${e.id}`} value={e.text} className="dc-etitle" />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="dc-edetail" placeholder={scene.tx('简介', 'Description')} />
          </div>
        </div>
      )
    }
    case 'file':
      return (
        <div className="dc-file">
          <Io name="docFill" size={28} className="dc-file-icon" />
          <div className="dc-file-text">
            <Ed k={`text:${e.id}`} value={e.text} className="dc-file-name" multiline={false} />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="dc-file-size" multiline={false} />
          </div>
        </div>
      )
    default:
      return <Text e={e} />
  }
}

function Text({ e }: { e: Entry }) {
  const scene = useScene()
  const key = `text:${e.id}`
  const editing = useStudio(s => s.editing === key, false)
  if (editing) return <Ed k={key} value={e.text} className="dc-text" />
  return (
    <span className="dc-text" {...editOn(scene.live ? scene.studio : null, key)}>
      {rich(e.text)}
      {e.edited && has(scene.rules, 'edited') && <span className="dc-edited"> {scene.tx('（已编辑）', '(edited)')}</span>}
    </span>
  )
}

function Notice({ e }: RowProps) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const editing = useStudio(s => s.editing === `text:${e.id}`, false)
  if (e.kind === 'time') {
    return (
      <RowShell e={e} className="dc-day">
        <i />
        <span className="hit" {...editOn(studio, `text:${e.id}`)}>
          <Ed k={`text:${e.id}`} value={editing ? e.text : timeText(scene.p, e)} multiline={false} />
        </span>
        <i />
      </RowShell>
    )
  }
  if (e.kind === 'system') {
    return (
      <RowShell e={e} className="dc-system">
        <Io name="arrowForward" size={16} className="dc-join" />
        <span className="hit"><Ed k={`text:${e.id}`} value={e.text} /></span>
      </RowShell>
    )
  }
  return null
}

function Typing() {
  const scene = useScene()
  const name = scene.p.people.find(x => x.id !== scene.p.selfID)?.name ?? ''
  return (
    <div className="dc-typing">
      <span className="dc-dots"><i /><i /><i /></span>
      <span><b>{name}</b> {scene.tx('正在输入…', 'is typing…')}</span>
    </div>
  )
}

export const discord: Skin = {
  className: 'sk-discord',
  navHeight: 52,
  composerHeight: 56,
  wall: dark => (dark ? '#1C1D22' : '#FFFFFF'),
  Nav,
  Composer,
  Row,
  Notice,
  Typing,
}
