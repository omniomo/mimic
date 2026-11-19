// Snapchat: no bubbles, everything on the left. Runs by the same person are one block with a colored line.

import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, NoticeText, RowShell, cx, editOn, usePerson } from '../parts'
import { ComposerField, PlusButton, useComposerHasText } from '../shared'
import { Waveform } from '../cards'
import type { ComposerProps, Skin } from '../skin'
import { contactOf, has } from '../../model/rules'
import { effectiveReceipt, voiceDuration } from '../../model/project'
import { isBubble, timeText } from '../../model/time'
import type { Entry } from '../../model/types'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './snapchat.css'

const GROUP = ['#0EADFF', '#9B55E0', '#1FB57A', '#FF8A00', '#E8457D', '#2F6FED']

function Nav() {
  const scene = useScene()
  const p = scene.p
  const group = !has(scene.rules, 'contactTitle')
  const others = p.people.filter(x => x.id !== p.selfID)
  const contact = contactOf(p)
  return (
    <div className="nav sc-nav">
      <span className="sc-icon"><Io name="back" size={24} /></span>
      {!group && contact ? <Avatar person={contact} size={36} />
        : others.length >= 2 ? <span className="sc-faces"><Avatar person={others[0]} size={26} /><span className="sc-second"><Avatar person={others[1]} size={26} /></span></span>
          : others[0] ? <Avatar person={others[0]} size={36} /> : null}
      <Ed k="title" value={p.title} className="sc-title" multiline={false} />
      <span style={{ flex: 1 }} />
      <span className="sc-icon"><Io name="call" size={22} /></span>
      <span className="sc-icon"><Io name="video" size={24} /></span>
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  return (
    <div className="sc-composer">
      <PlusButton className="sc-cam"><Io name="camera" size={22} /></PlusButton>
      <span className="sc-field">
        <ComposerField placeholder={scene.tx('发消息', 'Send a chat')} typed={typed} live={live} />
        <span onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'voice') } : undefined}><Io name="mic" size={21} /></span>
      </span>
      {hasText
        ? <span className="sc-send" onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}><Io name="arrowUp" size={18} /></span>
        : <span className="sc-icon" onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'sticker') } : undefined}><Io name="smile" size={24} /></span>}
    </div>
  )
}

function colorOf(scene: ReturnType<typeof useScene>, e: Entry) {
  if (e.personID === scene.viewer) return '#F23C57'
  if (!has(scene.rules, 'groupNames')) return '#0EADFF'
  const others = scene.p.people.filter(x => x.id !== scene.p.selfID)
  return GROUP[Math.max(0, others.findIndex(x => x.id === e.personID)) % GROUP.length]
}

function Row({ e, prev, isolated }: RowProps) {
  const scene = useScene()
  const person = usePerson(e)
  const starts = isolated || !(prev && isBubble(scene.p, prev) && prev.personID === e.personID)
  const color = colorOf(scene, e)
  const receipt = effectiveReceipt(scene.p, e, scene.holder)
  const studio = scene.live ? scene.studio : null
  const mine = e.personID === scene.viewer
  const editingName = useStudio(s => s.editing === `name:${e.id}`, false)
  const others = scene.p.people.filter(x => x.id !== scene.p.selfID)
  const index = others.findIndex(x => x.id === e.personID)
  const nameTint = mine ? 'var(--sc-red-text)' : has(scene.rules, 'groupNames') && index > 0 ? color : 'var(--sc-blue-text)'
  return (
    <RowShell e={e} className={cx('sc-row', starts && 'starts')}>
      {starts && (mine
        ? <span className="sc-name" style={{ color: nameTint }}>{scene.tx('我', 'ME')}</span>
        : <Ed k={`name:${e.id}`} value={editingName ? person.name : person.name.toUpperCase()} className="sc-name" style={{ color: nameTint }} multiline={false} />)}
      <div className="sc-line" style={{ ['--c' as string]: color }}>
        <div className={cx('sc-content hit', e.saved && 'saved')}><Content e={e} color={color} /></div>
      </div>
      {receipt && (
        <span className="sc-receipt" onClick={studio ? ev => { ev.stopPropagation(); studio.cycleReceipt(e.id) } : undefined}>
          {receipt === 'read' ? scene.tx('已打开', 'Opened') : scene.tx('已送达', 'Delivered')}
        </span>
      )}
    </RowShell>
  )
}

function Content({ e, color }: { e: Entry; color: string }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  switch (e.kind) {
    case 'image': return <ImageContent e={e} maxW={240} maxH={320} radius={10} />
    case 'sticker': return <ImageContent e={e} maxW={120} maxH={120} radius={4} />
    case 'snap': {
      const opened = e.receipt === 'read'
      const tint = e.video ? '#9B55E0' : '#F23C57'
      const mine = e.personID === scene.viewer
      const label = opened ? scene.tx('已打开', 'Opened') : mine ? scene.tx('已送达', 'Delivered') : scene.tx('新的 Snap', 'New Snap')
      return (
        <span className="sc-snap">
          <i className={cx('sc-square', opened && 'opened')} style={{ ['--t' as string]: tint }}
            onClick={studio ? ev => { ev.stopPropagation(); studio.toggleSnapOpened(e.id) } : undefined} />
          <span style={{ color: opened ? 'var(--sc-meta)' : tint, fontWeight: opened ? 400 : 700 }}>{label}</span>
        </span>
      )
    }
    case 'voice':
      return (
        <span className="sc-voice" {...editOn(studio, `seconds:${e.id}`)}>
          <span className="sc-play" style={{ background: color }}><Io name="play" size={14} /></span>
          <Waveform seconds={voiceDuration(e)} width={80} color="var(--sc-meta)" seed={e.id.charCodeAt(3)} />
          <Ed k={`seconds:${e.id}`} value={`0:${String(voiceDuration(e)).padStart(2, '0')}`} className="sc-dur" multiline={false} />
        </span>
      )
    case 'call': {
      const words = `${e.text} ${e.detail ?? ''}`.toLowerCase()
      const missed = /missed|未接|cancel|已取消/.test(words)
      return (
        <span className="sc-call">
          <Io name={e.video ? 'videoFill' : 'callFill'} size={15} style={{ color: missed ? '#F23C57' : 'var(--sc-meta)' }} />
          <Ed k={`text:${e.id}`} value={e.text} className="sc-strong" multiline={false} />
          {e.detail && <Ed k={`detail:${e.id}`} value={e.detail} className="sc-meta" multiline={false} />}
        </span>
      )
    }
    case 'link':
      return (
        <div className="sc-link">
          <Ed k={`text:${e.id}`} value={e.text} className="sc-strong" />
          <Ed k={`source:${e.id}`} value={e.source ?? ''} className="sc-url" multiline={false} />
        </div>
      )
    default:
      return <span className="sc-text" {...editOn(studio, `text:${e.id}`)}><Ed k={`text:${e.id}`} value={e.text} /></span>
  }
}

function Notice({ e }: RowProps) {
  const scene = useScene()
  const editing = useStudio(s => s.editing === `text:${e.id}`, false)
  return (
    <RowShell e={e} className="notice sc-notice">
      {e.kind === 'time' && !editing
        ? <span className="hit sc-day" {...editOn(scene.live ? scene.studio : null, `text:${e.id}`)}>{timeText(scene.p, e).toUpperCase()}</span>
        : e.kind === 'screenshot'
          ? <span className="hit sc-shot"><Io name="camera" size={13} /><NoticeText e={e} /></span>
          : <NoticeText e={e} />}
    </RowShell>
  )
}

function Typing() {
  const scene = useScene()
  const contact = contactOf(scene.p)
  return (
    <div className="sc-typing">
      {contact && <Avatar person={contact} size={26} plain />}
      <span>{scene.tx('正在输入…', 'typing…')}</span>
    </div>
  )
}

export const snapchat: Skin = {
  className: 'sk-snapchat',
  navHeight: 56,
  composerHeight: 56,
  wall: dark => (dark ? '#121212' : '#FFFFFF'),
  Nav,
  Composer,
  Row,
  Notice,
  Typing,
}
