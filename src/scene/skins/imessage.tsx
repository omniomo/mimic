// iMessage (iOS 26 "liquid glass"). Sizes and colors are from memory; compare with real screenshots.

import type * as R from 'react'
import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, Img, NoticeText, RowShell, cx, editOn, usePerson } from '../parts'
import { ComposerField, PlusButton, TypingDots, useComposerHasText } from '../shared'
import { FileIcon, MapThumb, Waveform } from '../cards'
import type { ComposerProps, Skin } from '../skin'
import { contactOf, has } from '../../model/rules'
import { effectiveReceipt, isJumboEmoji, quoteParts, voiceDuration } from '../../model/project'
import { isBubble, messageClock, timeText } from '../../model/time'
import type { Entry } from '../../model/types'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './imessage.css'

/** The bubble's tail: fills the bottom corner square and carves the hook. Mirrored for incoming. */
export function Tail({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`im-tail ${side}`} viewBox="-18 -18 22.5 18.5" aria-hidden="true">
      <path d="M0 -18 L0 -11 C0 -1 4 0 4 0 C0 0.5 -4 -1 -7 -4 C-11 0 -16 0 -16 0 L-18 0 L-18 -18 Z" fill="currentColor" />
    </svg>
  )
}

function Nav() {
  const scene = useScene()
  const p = scene.p
  const group = !has(scene.rules, 'contactTitle')
  const others = p.people.filter(x => x.id !== p.selfID)
  const contact = contactOf(p)
  const editingTitle = useStudio(s => s.editing === 'title', false)
  const editingBadge = useStudio(s => s.editing === 'badge', false)
  const badge = p.backBadge ?? ''
  const count = others.length + 1
  const shown = group && !p.title ? scene.tx(`${count} 人`, `${count} People`) : p.title
  return (
    <div className="nav im-nav">
      <span className={cx('im-glass im-back', (badge || editingBadge) && 'wide')} {...editOn(scene.live ? scene.studio : null, 'badge')}>
        <Io name="back" size={20} />
        {(badge || editingBadge) && <Ed k="badge" value={badge} className="im-badge" multiline={false} />}
      </span>
      <div className="im-center">
        {group
          ? <span className="im-faces">{others.slice(0, 3).map((x, i) => <Avatar key={x.id} person={x} size={others.length > 1 && i === 1 ? 44 : 36} className="im-face" />)}</span>
          : contact ? <Avatar person={contact} size={50} /> : <span style={{ width: 50, height: 50 }} />}
        <span className="im-glass im-pill" {...editOn(scene.live ? scene.studio : null, 'title')}>
          <Ed k="title" value={editingTitle ? p.title : shown} multiline={false} />
          <Io name="forward" size={10} className="im-chev" />
        </span>
      </div>
      <span className="im-glass im-round"><Io name="video" size={20} /></span>
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const sms = scene.p.sms === true
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  return (
    <div className="im-composer">
      <PlusButton className="im-glass im-plus"><Io name="add" size={24} /></PlusButton>
      <span className="im-glass im-field">
        <ComposerField placeholder={sms ? scene.tx('短信 • RCS', 'Text Message • RCS') : 'iMessage'} typed={typed} live={live} />
        {hasText
          ? <span className={cx('im-send', sms && 'sms')} onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}><Io name="arrowUp" size={18} /></span>
          : <span className="im-mic" onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'voice') } : undefined}><Io name="mic" size={20} /></span>}
      </span>
    </div>
  )
}

function Row({ e, prev, next, isolated }: RowProps) {
  const scene = useScene()
  const p = scene.p
  const person = usePerson(e)
  const out = e.personID === scene.viewer
  const group = has(scene.rules, 'groupNames')
  const joinsNext = !isolated && !!next && isBubble(p, next) && next.personID === e.personID
  const joinsPrev = !isolated && !!prev && isBubble(p, prev) && prev.personID === e.personID
  const reacted = e.isLiked && has(scene.rules, 'reaction')
  const failed = out && !!e.failed && has(scene.rules, 'failed')
  const sms = p.sms === true
  const studio = scene.live ? scene.studio : null
  const editingQuote = useStudio(s => s.editing === `quote:${e.id}`, false)
  const edited = !!e.edited && has(scene.rules, 'edited')
  const receipt = effectiveReceipt(p, e, scene.holder)
  return (
    <RowShell e={e} className={cx('im-row', out ? 'out' : 'in', sms && 'sms', joinsPrev && 'joins-prev', joinsNext && 'joins-next', group && !out && 'grouped')}>
      {group && !out && !joinsPrev && <Ed k={`name:${e.id}`} value={person.name} className="im-name" multiline={false} />}
      {e.quote && (
        <div className="im-quote-wrap">
          <Ed k={`quote:${e.id}`} value={editingQuote ? e.quote : quoteParts(p, e.quote).text} className="im-quote" />
        </div>
      )}
      <div className="im-line">
        {group && !out && <span style={{ opacity: joinsNext ? 0 : 1 }}><Avatar person={person} size={28} entry={e.id} /></span>}
        <div className={cx('im-content', reacted && 'reacted')}>
          <Content e={e} out={out} tail={!joinsNext} />
          {reacted && (
            <span className={cx('im-tapback', out ? 'on-out' : 'on-in')} onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.setReaction(e.id, undefined) } : undefined}>
              <i className="tb-dot1" /><i className="tb-dot2" /><span className="tb-face">{e.reaction ?? '❤️'}</span>
            </span>
          )}
        </div>
        {failed && <span className="im-failed" onDoubleClick={studio ? () => studio.toggleFailed(e.id) : undefined}><Io name="alert" size={24} /></span>}
      </div>
      {(edited || failed || receipt) && (
        <div className="im-foot">
          {edited && <span className="im-edited" onDoubleClick={studio ? () => studio.toggleEdited(e.id) : undefined}>{scene.tx('已编辑', 'Edited')}</span>}
          {failed
            ? <span className="im-notdelivered">{scene.tx('未送达', 'Not Delivered')}</span>
            : receipt === 'read'
              ? <span className="im-receipt" onClick={studio ? ev => { ev.stopPropagation(); studio.cycleReceipt(e.id) } : undefined}><b>{scene.tx('已读', 'Read')}</b> <Ed k={`metadata:${e.id}`} value={messageClock(p, e, scene.dates)} multiline={false} /></span>
              : receipt === 'delivered'
                ? <span className="im-receipt" onClick={studio ? ev => { ev.stopPropagation(); studio.cycleReceipt(e.id) } : undefined}>{scene.tx('已送达', 'Delivered')}</span>
                : null}
        </div>
      )}
    </RowShell>
  )
}

function Content({ e, out, tail }: { e: Entry; out: boolean; tail: boolean }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const editingText = useStudio(s => s.editing === `text:${e.id}`, false)
  const pickImage = studio ? { onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'entry', id: e.id }) } } : {}
  switch (e.kind) {
    case 'image': return <ImageContent e={e} maxW={240} maxH={300} radius={18} />
    case 'sticker': return <ImageContent e={e} maxW={130} maxH={130} radius={4} />
    case 'voice':
      return (
        <div className={cx('im-bubble hit im-voice', out ? 'out' : 'in')} {...editOn(studio, `seconds:${e.id}`)}>
          <Io name="play" size={15} />
          <Waveform seconds={voiceDuration(e)} width={Math.min(12 + voiceDuration(e), 30) * 4} color="currentColor" seed={e.id.charCodeAt(0)} />
          <Ed k={`seconds:${e.id}`} value={`0:${String(voiceDuration(e)).padStart(2, '0')}`} className="im-dur" multiline={false} />
          {tail && <Tail side={out ? 'right' : 'left'} />}
        </div>
      )
    case 'link':
      return (
        <div className="im-card hit">
          <div className="im-card-pic" {...pickImage}>{e.image ? <Img id={e.image} /> : <Io name="compass" size={30} />}</div>
          <div className="im-caption">
            <Ed k={`text:${e.id}`} value={e.text} className="im-cap-title" />
            <Ed k={`source:${e.id}`} value={e.source ?? ''} className="im-cap-sub" />
          </div>
        </div>
      )
    case 'location':
      return (
        <div className="im-card hit">
          <div {...pickImage}><MapThumb image={e.image} dark={scene.dark} height={140} /></div>
          <div className="im-caption">
            <Ed k={`text:${e.id}`} value={e.text} className="im-cap-title" />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="im-cap-sub" />
          </div>
        </div>
      )
    case 'file':
      return (
        <div className="im-file hit">
          <span style={{ transform: 'scale(0.8)', display: 'inline-flex' }}><FileIcon name={e.text} /></span>
          <div className="im-file-text">
            <Ed k={`text:${e.id}`} value={e.text} className="im-cap-title" />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="im-cap-sub" multiline={false} />
          </div>
        </div>
      )
    case 'card': {
      const owner = scene.p.people.find(x => x.id === e.target) ?? { id: '', name: scene.tx('朋友', 'Friend'), color: 5 }
      return (
        <div className="im-file hit">
          <Avatar person={owner} size={40} plain={!e.target} />
          <Ed k={`text:${e.id}`} value={e.text || owner.name} className="im-cap-title" multiline={false} />
          <span style={{ flex: 1 }} />
          <Io name="forward" size={14} className="im-chev" />
        </div>
      )
    }
    default:
      if (isJumboEmoji(e.text) && !editingText) {
        return <span className="im-jumbo hit" {...editOn(studio, `text:${e.id}`)}>{e.text}</span>
      }
      return (
        <div className={cx('im-bubble hit', out ? 'out' : 'in')} {...editOn(studio, `text:${e.id}`)}>
          <Ed k={`text:${e.id}`} value={e.text} />
          {tail && <Tail side={out ? 'right' : 'left'} />}
        </div>
      )
  }
}

/** "Today 9:41 AM" with the day in bold. */
function boldDay(text: string) {
  const m = /(上午|下午)?\d{1,2}:\d{2}/.exec(text)
  if (!m || m.index === 0) return <>{text}</>
  let day = text.slice(0, m.index).trim()
  const rest = text.slice(m.index)
  if (day.endsWith(' at')) return <><b>{day.slice(0, -3)}</b> at {rest}</>
  return <><b>{day}</b> {rest}</>
}

function Notice({ e }: RowProps) {
  const scene = useScene()
  const editing = useStudio(s => s.editing === `text:${e.id}`, false)
  return (
    <RowShell e={e} className="notice im-notice">
      {e.kind === 'time' && !editing
        ? <span className="hit" {...editOn(scene.live ? scene.studio : null, `text:${e.id}`)}>{boldDay(timeText(scene.p, e))}</span>
        : <NoticeText e={e} />}
    </RowShell>
  )
}

function Typing() {
  return (
    <div className="im-typing">
      <i className="t1" /><i className="t2" />
      <span className="im-typing-bubble"><TypingDots /></span>
    </div>
  )
}

export const imessage: Skin = {
  className: 'sk-imessage',
  navHeight: 96,
  composerHeight: 52,
  wall: dark => (dark ? '#000000' : '#FFFFFF'),
  Nav,
  Composer,
  Row,
  Notice,
  Typing,
}
