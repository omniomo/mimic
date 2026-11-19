// Telegram (iOS "liquid glass"). Bubbles are drawn by the WhatsApp rows with Telegram's options;
// the default background (gradient + faint doodle) is our own drawing.

import { useMemo } from 'react'
import { useScene, type RowProps } from '../context'
import { Avatar, Ed, NoticeText, RowShell, cx, editOn } from '../parts'
import { ComposerField, PlusButton, useComposerHasText } from '../shared'
import { bubbleRow, doodleURL } from './whatsapp'
import type { ComposerProps, Skin } from '../skin'
import { contactOf, has } from '../../model/rules'
import { statusLine } from '../../model/project'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './whatsapp.css'
import './telegram.css'

const LIGHT = ['#D45246', '#F68136', '#8E66D8', '#50A834', '#26A69A', '#3A8FE0', '#DB5B97']
const NIGHT = ['#FF8E86', '#FFA357', '#B18FFF', '#7BC862', '#5FD6C9', '#6CB6FF', '#FF8AC4']
const INITIALS: [string, string][] = [['#FF885E', '#FF516A'], ['#FFCD6A', '#FFA85C'], ['#82B1FF', '#665FFF'], ['#A0DE7E', '#54CB68'], ['#53EDD6', '#28C9B7'], ['#72D5FD', '#2A9EF1'], ['#E0A2F3', '#D669ED']]

export function Initials({ title, size }: { title: string; size: number }) {
  const ch = [...title.trim()][0]?.toUpperCase() ?? '#'
  const sum = [...title].reduce((a, c) => a + c.codePointAt(0)!, 0)
  const [a, b] = INITIALS[sum % INITIALS.length]
  return <span className="tg-initials" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(${a}, ${b})` }}>{ch}</span>
}

function Nav({ typing }: { typing?: boolean }) {
  const scene = useScene()
  const p = scene.p
  const group = !has(scene.rules, 'contactTitle')
  const editingStatus = useStudio(s => s.editing === 'status', false)
  const editingBadge = useStudio(s => s.editing === 'badge', false)
  const subtitle = typing ? scene.tx('正在输入…', 'typing…') : statusLine(p)
  const online = typing || ['online', '在线'].includes(subtitle.toLowerCase())
  const contact = contactOf(p)
  const badge = p.backBadge ?? ''
  return (
    <div className="nav tg-nav">
      <span className={cx('wa-glass tg-back', (badge || editingBadge) && 'wide')} {...editOn(scene.live ? scene.studio : null, 'badge')}>
        <Io name="back" size={20} />
        {(badge || editingBadge) && <Ed k="badge" value={badge} multiline={false} />}
      </span>
      <span className="wa-glass tg-pill">
        <Ed k="title" value={p.title} className="tg-title" multiline={false} />
        {(subtitle || editingStatus) && <Ed k="status" value={subtitle} className={cx('tg-status', online && 'online')} multiline={false} />}
      </span>
      {!group && contact ? <Avatar person={contact} size={44} /> : <Initials title={p.title} size={44} />}
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  return (
    <div className="tg-composer">
      <PlusButton className="wa-glass tg-circle"><Io name="attach" size={22} /></PlusButton>
      <span className="wa-glass tg-field">
        <ComposerField placeholder={scene.tx('消息', 'Message')} typed={typed} live={live} />
        <Io name="smile" size={21} className="wa-meta-c" />
      </span>
      {hasText
        ? <span className="tg-send" onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}><Io name="arrowUp" size={20} /></span>
        : <span className="wa-glass tg-circle" onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'voice') } : undefined}><Io name="mic" size={21} /></span>}
    </div>
  )
}

function Backdrop() {
  const { dark } = useScene()
  const url = useMemo(() => doodleURL(dark ? 'rgba(255,255,255,0.05)' : 'rgba(58,90,46,0.10)', ['heart', 'star', 'music', 'camera', 'ribbon', 'gift', 'paperPlane', 'chat', 'sparklesO', 'globe', 'flash', 'happy']), [dark])
  return <div className="tg-backdrop"><div className="doodle" style={{ backgroundImage: url }} /></div>
}

function Notice({ e }: RowProps) {
  return (
    <RowShell e={e} className="notice tg-notice">
      <span className="tg-chip"><NoticeText e={e} /></span>
    </RowShell>
  )
}

export const telegram: Skin = {
  className: 'sk-whatsapp sk-telegram',
  navHeight: 52,
  composerHeight: 52,
  wall: dark => (dark ? '#17212B' : '#D6DEB3'),
  bar: dark => (dark ? '#0E1621' : '#A2C79C'),
  Nav,
  Composer,
  Row: bubbleRow({
    names: (dark, i) => (dark ? NIGHT : LIGHT)[Math.abs(i) % 7],
    reactionInside: true,
    voice: 'circle',
    deleted: false,
    cardAction: tx => tx('查看联系人', 'View Contact'),
    callTitle: (out, tx) => (out ? tx('呼出通话', 'Outgoing Call') : tx('呼入通话', 'Incoming Call')),
  }),
  Notice,
  Backdrop,
}
