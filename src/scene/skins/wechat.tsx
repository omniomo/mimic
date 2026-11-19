// WeChat chat (group and private). Rules live in rules.ts; this only draws.

import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, RowShell, cx, editOn, usePerson } from '../parts'
import { ComposerField, PlusButton, useComposerHasText } from '../shared'
import { FileIcon, MapThumb, Waves } from '../cards'
import type { ComposerProps, Skin } from '../skin'
import { groupTitle, voiceDuration } from '../../model/project'
import { has } from '../../model/rules'
import type { Entry } from '../../model/types'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import { Img } from '../parts'
import './wechat.css'

function Nav({ typing }: { typing?: boolean }) {
  const scene = useScene()
  const editingBadge = useStudio(s => s.editing === 'badge', false)
  const badge = scene.p.backBadge ?? ''
  return (
    <div className="nav wx-nav">
      <span className="wx-back" {...editOn(scene.studio && scene.live ? scene.studio : null, 'badge')}>
        <Io name="back" size={24} />
        {(badge || editingBadge) && <Ed k="badge" value={badge} multiline={false} />}
      </span>
      <span className="wx-title">
        {typing ? scene.tx('对方正在输入...', 'Typing...') : <Ed k="title" value={groupTitle(scene.p)} multiline={false} />}
      </span>
      <Io name="more" size={22} />
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  return (
    <div className="wx-composer">
      <span className="wx-circle" onClick={scene.live && scene.studio ? ev => { ev.stopPropagation(); void scene.studio!.insert(scene.studio!.s.selection, 'voice') } : undefined}>
        <Waves size={17} />
      </span>
      <span className="wx-field"><ComposerField placeholder="" typed={typed} live={live} /></span>
      <span className="wx-circle"><Io name="smile" size={20} /></span>
      {hasText
        ? <span className="wx-send" onClick={scene.live && scene.studio ? ev => { ev.stopPropagation(); const s = scene.studio!; if (s.send(s.s.draft)) s.setDraft('') } : undefined}>{scene.tx('发送', 'Send')}</span>
        : <PlusButton className="wx-circle"><Io name="add" size={22} /></PlusButton>}
    </div>
  )
}

function Row({ e }: RowProps) {
  const scene = useScene()
  const person = usePerson(e)
  const out = e.personID === scene.viewer
  const studio = scene.live ? scene.studio : null
  return (
    <RowShell e={e} className={cx('wx-row', out && 'out')}>
      {!out && <Avatar person={person} size={40} square radius={4} entry={e.id} />}
      {out && e.failed && has(scene.rules, 'failed') && <span className="wx-failed" onDoubleClick={studio ? () => studio.toggleFailed(e.id) : undefined}><Io name="alert" size={22} /></span>}
      <div className="wx-col">
        {!out && has(scene.rules, 'groupNames') && <Ed k={`name:${e.id}`} value={person.name} className="wx-name" multiline={false} />}
        <Body e={e} out={out} />
        {e.quote && <Ed k={`quote:${e.id}`} value={e.quote} className="wx-quote" />}
      </div>
      {out && <Avatar person={person} size={40} square radius={4} entry={e.id} />}
    </RowShell>
  )
}

function Body({ e, out }: { e: Entry; out: boolean }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  switch (e.kind) {
    case 'image': return <ImageContent e={e} maxW={160} maxH={190} radius={4} />
    case 'sticker': return <ImageContent e={e} maxW={120} maxH={120} radius={4} />
    case 'voice': {
      const width = Math.min(76 + (voiceDuration(e) - 1) * 2.8, 230)
      return (
        <div className={cx('wx-bubble hit wx-voice', out && 'out')} style={{ width }} {...editOn(studio, `seconds:${e.id}`)}>
          {!out && <Waves size={18} />}
          <span><Ed k={`seconds:${e.id}`} value={String(voiceDuration(e))} multiline={false} />"</span>
          {out && <Waves size={18} dir="left" />}
          {!out && e.unread && <span className="wx-dot" onClick={studio ? ev => { ev.stopPropagation(); studio.toggleUnread(e.id) } : undefined} />}
        </div>
      )
    }
    case 'call':
      return (
        <div className={cx('wx-bubble hit wx-call', out && 'out')} {...editOn(studio, `text:${e.id}`)}>
          {!out && <Io name={e.video ? 'video' : 'call'} size={17} />}
          <Ed k={`text:${e.id}`} value={e.text} multiline={false} />
          {out && <Io name={e.video ? 'video' : 'call'} size={17} />}
        </div>
      )
    case 'link':
      return (
        <div className="wx-card hit">
          <Ed k={`text:${e.id}`} value={e.text} className="wx-card-title" />
          <div className="wx-link-mid">
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="wx-card-sub" />
            <span className="wx-thumb" onDoubleClick={studio ? ev => { ev.stopPropagation(); void studio.requestImage({ kind: 'entry', id: e.id }) } : undefined}>
              {e.image ? <Img id={e.image} /> : <Io name="image" size={18} />}
            </span>
          </div>
          <div className="wx-card-foot">
            <span className="wx-link-dot"><Io name="link" size={9} /></span>
            <Ed k={`source:${e.id}`} value={e.source ?? ''} multiline={false} />
          </div>
        </div>
      )
    case 'file':
      return (
        <div className="wx-card hit wx-file">
          <div className="wx-file-text">
            <Ed k={`text:${e.id}`} value={e.text} className="wx-card-title" />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="wx-card-meta" multiline={false} />
          </div>
          <FileIcon name={e.text} />
        </div>
      )
    case 'location':
      return (
        <div className="wx-card hit wx-location">
          <div className="wx-loc-text">
            <Ed k={`text:${e.id}`} value={e.text} className="wx-card-title" />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="wx-card-meta" />
          </div>
          <span onDoubleClick={studio ? ev => { ev.stopPropagation(); void studio.requestImage({ kind: 'entry', id: e.id }) } : undefined}>
            <MapThumb image={e.image} dark={scene.dark} />
          </span>
        </div>
      )
    case 'card': {
      const owner = scene.p.people.find(x => x.id === e.target) ?? { id: '', name: scene.tx('朋友', 'Friend'), color: 3 }
      return (
        <div className="wx-card hit wx-contact">
          <div className="wx-contact-top">
            <Avatar person={owner} size={44} square radius={4} plain={!e.target} />
            <Ed k={`text:${e.id}`} value={e.text || owner.name} multiline={false} className="wx-card-title" />
          </div>
          <div className="wx-contact-foot">{scene.tx('个人名片', 'Contact Card')}</div>
        </div>
      )
    }
    default:
      return (
        <div className={cx('wx-bubble hit', out && 'out')} {...editOn(studio, `text:${e.id}`)}>
          <Ed k={`text:${e.id}`} value={e.text} />
        </div>
      )
  }
}

export const wechat: Skin = {
  className: 'sk-wechat',
  navHeight: 44,
  composerHeight: 56,
  wall: dark => (dark ? '#111111' : '#EDEDED'),
  bar: dark => (dark ? '#1E1E1E' : '#F7F7F7'),
  divider: true,
  Nav,
  Composer,
  Row,
}
