// YouTube comments sheet: "Comments 1.2K", Top / Newest chips, threads with elbow lines.

import { useScene, type RowProps } from '../context'
import { Avatar, Ed, RowShell, cx, usePerson, useMoreReplies, useReplyTarget } from '../parts'
import { CommentText, ComposerField, ViewerAvatar, useComposerHasText } from '../shared'
import type { ComposerProps, Skin } from '../skin'
import { has, isNoticeKind, visibleEntries } from '../../model/rules'
import { Io, Lu } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './youtube.css'

export const handle = (name: string) => (name.startsWith('@') ? name : '@' + name)

function Nav() {
  const scene = useScene()
  const p = scene.p
  const counted = String(visibleEntries(p).filter(e => !isNoticeKind(e.kind)).length)
  return (
    <div className="nav yt-nav">
      <div className="yt-head">
        <b>{scene.tx('评论', 'Comments')}</b>
        <Ed k="commentCount" value={p.commentCount ?? counted} className="yt-meta yt-count" multiline={false} />
        <span style={{ flex: 1 }} />
        <Io name="close" size={22} />
      </div>
      <div className="yt-chips">
        <span className="yt-chip on">{scene.tx('热门', 'Top')}</span>
        <span className="yt-chip">{scene.tx('最新', 'Newest')}</span>
      </div>
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  return (
    <div className="yt-composer">
      <ViewerAvatar size={28} />
      <span className="yt-field">
        <ComposerField placeholder={scene.tx('添加评论…', 'Add a comment...')} typed={typed} live={live} />
        {hasText
          ? <span className="yt-send" onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}><Io name="send" size={16} /></span>
          : <Io name="smile" size={18} className="yt-meta" />}
      </span>
    </div>
  )
}

function Row({ e, next, isolated }: RowProps) {
  const scene = useScene()
  const p = scene.p
  const person = usePerson(e)
  const studio = scene.live ? scene.studio : null
  const threaded = has(scene.rules, 'thread') && !isolated
  const reply = e.isReply && threaded
  const repliesBelow = threaded && !e.isReply && !!next?.isReply
  const continues = reply && !!next?.isReply
  const target = useReplyTarget(e)
  const more = useMoreReplies(e, isolated)
  const editingName = useStudio(s => s.editing === `name:${e.id}`, false)
  const editingMeta = useStudio(s => s.editing === `metadata:${e.id}`, false)
  const editingLikes = useStudio(s => s.editing === `likes:${e.id}`, false)
  const creator = has(scene.rules, 'author') && p.authorID === person.id
  const author = p.authorID ? p.people.find(x => x.id === p.authorID) : undefined
  const pinned = e.pinned && !e.isReply && has(scene.rules, 'pinned')
  return (
    <RowShell e={e} className={cx('yt-row', reply && 'reply')}>
      {repliesBelow && <i className="yt-line root" />}
      {reply && <i className="yt-elbow" />}
      {continues && <i className="yt-line cont" />}
      <Avatar person={person} size={reply ? 24 : 32} entry={e.id} />
      <div className="yt-body hit">
        {pinned && (
          <span className="yt-pinned yt-meta" onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.togglePinned(e.id) } : undefined}>
            <Lu name="pin" size={11} />{author ? scene.tx(`由 ${handle(author.name)} 置顶`, `Pinned by ${handle(author.name)}`) : scene.tx('已置顶', 'Pinned')}
          </span>
        )}
        <div className="yt-byline">
          <Ed k={`name:${e.id}`} value={editingName ? person.name : handle(person.name)} className={cx('yt-handle', creator && 'creator')} multiline={false} />
          {person.verified && has(scene.rules, 'verified') && <Io name="checkCircle" size={11} className="yt-meta" />}
          {(e.metadata || editingMeta) && <><span className="yt-meta">·</span><Ed k={`metadata:${e.id}`} value={e.metadata} className="yt-meta" multiline={false} /></>}
        </div>
        <CommentText e={e} className="yt-text" prefix={target ? <span className="yt-link">{handle(target)} </span> : undefined} />
        <div className="yt-actions">
          <span className="yt-like">
            <span onClick={studio ? ev => { ev.stopPropagation(); studio.toggleLiked(e.id) } : undefined}><Io name={e.isLiked ? 'thumbUpFill' : 'thumbUp'} size={15} /></span>
            {(e.likes || editingLikes) && <Ed k={`likes:${e.id}`} value={e.likes} className="yt-meta" multiline={false} />}
          </span>
          <span className="yt-dislike"><Io name="thumbDown" size={15} /></span>
          <span className="yt-reply"><Io name="chat" size={15} /></span>
          {e.authorLiked && has(scene.rules, 'authorLiked') && (
            <span className="yt-hearted" onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.toggleAuthorLiked(e.id) } : undefined}>
              {author ? <Avatar person={author} size={18} plain /> : <span className="yt-ghost" />}
              <Io name="heartFill" size={10} className="yt-heart" />
            </span>
          )}
        </div>
        {more && (
          <div className="yt-more">
            {more.root !== e.id && scene.tx('还有 ', '')}
            <Ed k={`replies:${more.root}`} value={more.count} multiline={false} />
            {more.root === e.id ? scene.tx(' 条回复', ' replies') : scene.tx(' 条回复', ' more replies')}
            <Io name="down" size={12} />
          </div>
        )}
      </div>
      <Io name="moreV" size={14} className="yt-meta yt-dots" />
    </RowShell>
  )
}

export const youtube: Skin = {
  className: 'sk-youtube',
  navHeight: 96,
  composerHeight: 52,
  wall: dark => (dark ? '#0F0F0F' : '#FFFFFF'),
  divider: true,
  Nav,
  Composer,
  Row,
}
