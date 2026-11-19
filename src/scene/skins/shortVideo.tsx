// Douyin and TikTok: the video on top (the cover picture), a rounded comment sheet under it.
// Stickers: a top-level comment as a "Reply to …'s comment" card, exported on a transparent background.

import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, RowShell, cx, usePerson, useMoreReplies, useReplyTarget } from '../parts'
import { CommentText, ComposerField, Cover } from '../shared'
import type { ComposerProps, Skin } from '../skin'
import { has, isNoticeKind, visibleEntries } from '../../model/rules'
import type { Entry, Project } from '../../model/types'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './shortVideo.css'

export const VIDEO_H = 190
const tiktokOf = (p: Project) => p.template === 'tiktok'

function Nav() {
  const scene = useScene()
  const p = scene.p
  const tiktok = tiktokOf(p)
  const counted = String(visibleEntries(p).filter(e => !isNoticeKind(e.kind)).length)
  return (
    <div className="nav sv-nav">
      <Cover className={cx('sv-video', !!p.cover && 'dim')} />
      <div className="sv-sheet-head">
        <span className="sv-count">
          <Ed k="commentCount" value={p.commentCount ?? counted} multiline={false} />
          {tiktok ? scene.tx('条评论', ' comments') : scene.tx('条评论', ' comments')}
        </span>
        <Io name="close" size={17} className="sv-close" />
      </div>
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const tiktok = tiktokOf(scene.p)
  return (
    <div className="sv-composer">
      <span className="sv-field">
        <ComposerField placeholder={tiktok ? scene.tx('添加评论…', 'Add comment...') : scene.tx('善语结善缘，恶言伤人心', 'Add comment...')} typed={typed} live={live} />
      </span>
      <Io name="at" size={22} />
      <Io name="smile" size={22} />
    </div>
  )
}

function Row({ e, isolated }: RowProps) {
  const scene = useScene()
  const p = scene.p
  const tiktok = tiktokOf(p)
  const person = usePerson(e)
  const studio = scene.live ? scene.studio : null
  const reply = e.isReply && has(scene.rules, 'thread') && !isolated
  const target = useReplyTarget(e)
  const more = useMoreReplies(e, isolated)
  const editingMeta = useStudio(s => s.editing === `metadata:${e.id}`, false)
  const editingLikes = useStudio(s => s.editing === `likes:${e.id}`, false)
  const creator = has(scene.rules, 'author') && p.authorID === person.id
  const pinned = tiktok && has(scene.rules, 'pinned') && e.pinned && !e.isReply
  return (
    <RowShell e={e} className={cx('sv-row', reply && 'reply')}>
      <Avatar person={person} size={reply ? 24 : 34} entry={e.id} />
      <div className="sv-body hit">
        <div className="sv-byline">
          <Ed k={`name:${e.id}`} value={person.name} className="sv-name" multiline={false} />
          {person.verified && has(scene.rules, 'verified') && <Io name="checkCircle" size={11} className="sv-verified" />}
          {creator && <span className="sv-author">{tiktok ? scene.tx('作者', 'Creator') : scene.tx('作者', 'Author')}</span>}
          {target && <><i className="sv-to" /><span className="sv-name">{target}</span></>}
        </div>
        <CommentText e={e} className="sv-text" prefix={pinned ? <span className="sv-meta">{scene.tx('置顶 · ', 'Pinned · ')}</span> : undefined} />
        {e.kind === 'image' && <div className="sv-pic"><ImageContent e={e} maxW={120} maxH={150} radius={6} /></div>}
        <div className="sv-foot">
          {(e.metadata || editingMeta) && <Ed k={`metadata:${e.id}`} value={e.metadata} className="sv-meta" multiline={false} />}
          <span className="sv-reply">{scene.tx('回复', 'Reply')}</span>
        </div>
        {e.authorLiked && has(scene.rules, 'authorLiked') && (
          <span className="sv-liked" onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.toggleAuthorLiked(e.id) } : undefined}>{scene.tx('作者赞过', 'Liked by creator')}</span>
        )}
        {more && (
          <div className="sv-more">
            <i />{scene.tx('展开 ', 'View ')}<Ed k={`replies:${more.root}`} value={more.count} multiline={false} />{scene.tx(' 条回复', ' replies')}<Io name="down" size={10} />
          </div>
        )}
      </div>
      <div className="sv-like">
        <span className={cx('sv-heart', e.isLiked && 'on')} onClick={studio ? ev => { ev.stopPropagation(); studio.toggleLiked(e.id) } : undefined}>
          <Io name={e.isLiked ? 'heartFill' : 'heart'} size={18} />
        </span>
        {(e.likes || editingLikes) && <Ed k={`likes:${e.id}`} value={e.likes} className="sv-meta sv-likes" multiline={false} />}
        {tiktok && <Io name="thumbDown" size={15} className="sv-meta sv-down" />}
      </div>
    </RowShell>
  )
}

function Sticker({ e }: { e: Entry }) {
  const scene = useScene()
  const person = usePerson(e)
  const editing = useStudio(s => s.editing === `text:${e.id}`, false)
  return (
    <div className="sv-sticker hit">
      <div className="sv-sticker-head">
        <Avatar person={person} size={18} plain />
        <span>{scene.tx(`回复 ${person.name} 的评论`, `Reply to ${person.name}’s comment`)}</span>
      </div>
      {e.kind === 'image' && <ImageContent e={e} maxW={120} maxH={120} radius={6} />}
      {(e.text || editing) && <Ed k={`text:${e.id}`} value={e.text} className="sv-sticker-text" />}
    </div>
  )
}

const skinFor = (tiktok: boolean): Skin => ({
  className: cx('sk-short', tiktok ? 'sk-tiktok' : 'sk-douyin')!,
  navHeight: VIDEO_H + 46,
  composerHeight: 52,
  wall: dark => (dark ? '#161823' : '#FFFFFF'),
  divider: true,
  darkStatus: true,
  Nav,
  Composer,
  Row,
  Sticker,
})

export const tiktok = skinFor(true)
export const douyin = skinFor(false)
