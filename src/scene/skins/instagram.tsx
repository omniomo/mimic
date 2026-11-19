// Instagram: direct messages (private and group) and the comments sheet.

import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, Img, RowShell, cx, editOn, useMoreReplies, usePerson, useReplyTarget } from '../parts'
import { ComposerField, PlusButton, TypingDots, ViewerAvatar, useComposerHasText } from '../shared'
import { Waveform } from '../cards'
import type { ComposerProps, Skin } from '../skin'
import { contactOf, has, isNoticeKind } from '../../model/rules'
import { voiceDuration } from '../../model/project'
import type { Entry } from '../../model/types'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './instagram.css'

export function Verified({ size, color = '#0095F6' }: { size: number; color?: string }) {
  return (
    <span className="verified" style={{ color }} title="Verified">
      <svg width={size} height={size} viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3 3.2.1z" /><path d="M7.5 12.2l3 3 6-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  )
}

function DirectNav() {
  const scene = useScene()
  const p = scene.p
  const group = has(scene.rules, 'groupNames')
  const others = p.people.filter(x => x.id !== p.selfID)
  const contact = contactOf(p)
  return (
    <div className="nav ig-nav">
      <Io name="back" size={26} />
      {group
        ? <span className="ig-groupfaces">
            {others[0] && <Avatar person={others[0]} size={24} />}
            {others[1] && <span className="ig-second"><Avatar person={others[1]} size={24} /></span>}
          </span>
        : contact && <Avatar person={contact} size={32} />}
      <span className="ig-title-wrap">
        <Ed k="title" value={p.title} className="ig-title" multiline={false} />
        {!group && contact?.verified && <Verified size={13} />}
      </span>
      <span className="ig-nav-icons"><Io name="call" size={22} /><Io name="video" size={26} /></span>
    </div>
  )
}

function DirectComposer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  return (
    <div className="ig-composer">
      <div className="ig-field">
        <span className="ig-cam"><Io name="cameraFill" size={17} /></span>
        <ComposerField placeholder={scene.tx('发消息…', 'Message...')} typed={typed} live={live} />
        {hasText
          ? <span className="ig-send" onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}>{scene.tx('发送', 'Send')}</span>
          : <span className="ig-icons">
              <span onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'voice') } : undefined}><Io name="mic" size={23} /></span>
              <span onClick={studio ? ev => { ev.stopPropagation(); void studio.insert(studio.s.selection, 'image') } : undefined}><Io name="image" size={23} /></span>
              <PlusButton><Io name="smile" size={23} /></PlusButton>
            </span>}
      </div>
    </div>
  )
}

function DirectRow({ e, prev, next, isolated }: RowProps) {
  const scene = useScene()
  const person = usePerson(e)
  const out = e.personID === scene.viewer
  const connected = !isolated && !!next && next.personID === e.personID && !isNoticeKind(next.kind)
  const continues = !isolated && !!prev && prev.personID === e.personID && !isNoticeKind(prev.kind)
  const reacted = e.isLiked && has(scene.rules, 'reaction')
  const studio = scene.live ? scene.studio : null
  const r = (cond: boolean) => (cond ? '6px' : '20px')
  const radius = out
    ? `20px ${r(continues)} ${r(connected)} 20px`
    : `${r(continues)} 20px 20px ${r(connected)}`
  return (
    <RowShell e={e} className={cx('ig-row', out ? 'out' : 'in', continues && 'continues', connected && 'connected')}>
      {!out && <span style={{ opacity: connected ? 0 : 1 }}><Avatar person={person} size={28} entry={e.id} /></span>}
      <div className={cx('ig-col', reacted && 'reacted')}>
        {!out && !continues && has(scene.rules, 'groupNames') && <Ed k={`name:${e.id}`} value={person.name} className="ig-name" multiline={false} />}
        {e.quote && <Ed k={`quote:${e.id}`} value={e.quote} className="ig-quote" />}
        <DirectBody e={e} out={out} radius={radius} />
        {reacted && <span className="ig-reaction" onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.setReaction(e.id, undefined) } : undefined}>{e.reaction ?? '❤️'}</span>}
      </div>
    </RowShell>
  )
}

function DirectBody({ e, out, radius }: { e: Entry; out: boolean; radius: string }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  switch (e.kind) {
    case 'image': return <ImageContent e={e} maxW={210} maxH={260} radius={18} />
    case 'sticker': return <ImageContent e={e} maxW={140} maxH={140} radius={6} />
    case 'voice':
      return (
        <div className={cx('ig-bubble hit ig-voice', out && 'out')} style={{ borderRadius: radius }} {...editOn(studio, `seconds:${e.id}`)}>
          <Io name="play" size={15} />
          <Waveform seconds={voiceDuration(e)} width={Math.min(8 + voiceDuration(e), 26) * 4} color="currentColor" seed={e.id.charCodeAt(2)} />
          <Ed k={`seconds:${e.id}`} value={`0:${String(voiceDuration(e)).padStart(2, '0')}`} className="ig-dur" multiline={false} />
        </div>
      )
    case 'link':
      return (
        <div className="ig-link hit">
          <div className="ig-link-pic" onDoubleClick={studio ? ev => { ev.stopPropagation(); void studio.requestImage({ kind: 'entry', id: e.id }) } : undefined}>
            {e.image ? <Img id={e.image} /> : <Io name="image" size={24} />}
          </div>
          <div className="ig-link-text">
            <Ed k={`text:${e.id}`} value={e.text} className="ig-strong" />
            <Ed k={`source:${e.id}`} value={e.source ?? ''} className="ig-sub" multiline={false} />
          </div>
        </div>
      )
    case 'call':
      return (
        <div className="ig-call hit">
          <span className="ig-call-ico"><Io name={e.video ? 'videoFill' : 'callFill'} size={15} /></span>
          <div>
            <Ed k={`text:${e.id}`} value={e.text} className="ig-strong" multiline={false} />
            <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="ig-sub" multiline={false} />
          </div>
        </div>
      )
    default:
      return (
        <div className={cx('ig-bubble hit', out && 'out')} style={{ borderRadius: radius }} {...editOn(studio, `text:${e.id}`)}>
          <Ed k={`text:${e.id}`} value={e.text} />
        </div>
      )
  }
}

function DirectTyping() {
  const scene = useScene()
  const contact = scene.p.people.find(x => x.id !== scene.p.selfID)
  return (
    <div className="ig-typing">
      {contact && <Avatar person={contact} size={28} plain />}
      <span className="ig-typing-bubble"><TypingDots /></span>
    </div>
  )
}

export const instagram: Skin = {
  className: 'sk-instagram',
  navHeight: 50,
  composerHeight: 58,
  wall: dark => (dark ? '#141414' : '#FFFFFF'),
  divider: true,
  Nav: DirectNav,
  Composer: DirectComposer,
  Row: DirectRow,
  Typing: DirectTyping,
}

// MARK: comments

function CommentsNav() {
  const scene = useScene()
  return (
    <div className="nav ig-cnav">
      <span className="ig-grabber" />
      <span>{scene.tx('评论', 'Comments')}</span>
    </div>
  )
}

function CommentsComposer({ typed, live }: ComposerProps) {
  const scene = useScene()
  return (
    <div className="ig-ccomposer">
      <ViewerAvatar size={30} />
      <span className="ig-cfield">
        <ComposerField placeholder={scene.tx('添加评论…', 'Add a comment...')} typed={typed} live={live} />
        <span className="ig-gif">GIF</span>
      </span>
    </div>
  )
}

function CommentRow({ e, isolated }: RowProps) {
  const scene = useScene()
  const person = usePerson(e)
  const studio = scene.live ? scene.studio : null
  const target = useReplyTarget(e)
  const more = useMoreReplies(e, isolated)
  const editingLikes = useStudio(s => s.editing === `likes:${e.id}`, false)
  const editingText = useStudio(s => s.editing === `text:${e.id}`, false)
  return (
    <RowShell e={e} className={cx('ig-comment', e.isReply && !isolated && 'reply')}>
      <Avatar person={person} size={e.isReply ? 25 : 32} entry={e.id} />
      <div className="ig-cbody hit">
        <div className="ig-chead">
          <Ed k={`name:${e.id}`} value={person.name} className="ig-cname" multiline={false} />
          {person.verified && <Verified size={11} />}
          <Ed k={`metadata:${e.id}`} value={e.metadata} className="ig-ctime" multiline={false} />
          {e.pinned && !e.isReply && <span className="ig-ctime ig-pinned"><Io name="bookmarkFill" size={9} />{scene.tx('已置顶', 'Pinned')}</span>}
        </div>
        <div className="ig-ctext" {...(target && !editingText ? editOn(studio, `text:${e.id}`) : {})}>
          {target && <span className="ig-mention">@{target} </span>}
          <Ed k={`text:${e.id}`} value={e.text} />
        </div>
        {e.kind === 'image' && <ImageContent e={e} maxW={150} maxH={165} radius={7} />}
        <span className="ig-reply">{scene.tx('回复', 'Reply')}</span>
        {more && (
          <div className="ig-more"><i /><span>{scene.tx('查看另外 ', 'View ')}<Ed k={`replies:${more.root}`} value={more.count} multiline={false} />{scene.tx(' 条回复', ' more replies')}</span></div>
        )}
      </div>
      <div className="ig-like">
        <span className={cx('ig-heart', e.isLiked && 'on')} onClick={studio ? ev => { ev.stopPropagation(); studio.toggleLiked(e.id) } : undefined}>
          <Io name={e.isLiked ? 'heartFill' : 'heart'} size={15} />
        </span>
        {(e.likes || editingLikes) && <Ed k={`likes:${e.id}`} value={e.likes} className="ig-likes" multiline={false} />}
      </div>
    </RowShell>
  )
}

export const instagramComments: Skin = {
  className: 'sk-instagram sk-igc',
  navHeight: 53,
  composerHeight: 50,
  wall: dark => (dark ? '#141414' : '#FFFFFF'),
  divider: true,
  Nav: CommentsNav,
  Composer: CommentsComposer,
  Row: CommentRow,
}
