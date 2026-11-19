// Bilibili video page, "Comments" tab: LV badges, UP badge, "Reply @name :", "共 N 条回复".

import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, RowShell, cx, usePerson, useMoreReplies, useReplyTarget } from '../parts'
import { CommentText, ComposerField } from '../shared'
import type { ComposerProps, Skin } from '../skin'
import { has, isNoticeKind, visibleEntries } from '../../model/rules'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './bilibili.css'

function Nav() {
  const scene = useScene()
  const p = scene.p
  const counted = String(visibleEntries(p).filter(e => !isNoticeKind(e.kind)).length)
  return (
    <div className="nav bl-nav">
      <span className="bl-about">{scene.tx('简介', 'About')}</span>
      <span className="bl-tab">
        <b>{scene.tx('评论', 'Comments')}</b>
        <Ed k="commentCount" value={p.commentCount ?? counted} className="bl-count" multiline={false} />
      </span>
      <span style={{ flex: 1 }} />
      <span className="bl-danmaku">{scene.tx('点我发弹幕', 'Send danmaku')}<Io name="tv" size={13} /></span>
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  return (
    <div className="bl-composer">
      <span className="bl-field">
        <ComposerField placeholder={scene.tx('发一条友善的评论', 'Add a comment')} typed={typed} live={live} />
        <Io name="smile" size={19} />
      </span>
    </div>
  )
}

function Row({ e, next, isolated, inCard }: RowProps) {
  const scene = useScene()
  const p = scene.p
  const person = usePerson(e)
  const studio = scene.live ? scene.studio : null
  const target = useReplyTarget(e)
  const more = useMoreReplies(e, isolated)
  const editingLevel = useStudio(s => s.editing === `level:${e.id}`, false)
  const editingMeta = useStudio(s => s.editing === `metadata:${e.id}`, false)
  const editingLikes = useStudio(s => s.editing === `likes:${e.id}`, false)
  const pinned = has(scene.rules, 'pinned') && e.pinned && !e.isReply
  const separated = !isolated && !(inCard && !next)
  const prefix = pinned || target ? <>
    {pinned && <span className="bl-pink">{scene.tx('置顶 ', 'Pinned ')}</span>}
    {target && <>{scene.tx('回复 ', 'Reply ')}<span className="bl-blue">@{target}</span> :</>}
  </> : undefined
  return (
    <RowShell e={e} className={cx('bl-row', e.isReply && !isolated && 'reply', isolated && 'isolated')}>
      <Avatar person={person} size={e.isReply ? 27 : 36} entry={e.id} />
      <div className={cx('bl-body hit', separated && 'separated')}>
        <div className="bl-head">
          <Ed k={`name:${e.id}`} value={person.name} className="bl-name" multiline={false} />
          {(person.level || editingLevel) && <span className="bl-badge bl-lv">LV<Ed k={`level:${e.id}`} value={person.level ?? ''} multiline={false} /></span>}
          {has(scene.rules, 'author') && p.authorID === person.id && <span className="bl-badge bl-up">UP</span>}
        </div>
        {(e.metadata || editingMeta) && <Ed k={`metadata:${e.id}`} value={e.metadata} className="bl-meta" multiline={false} />}
        <CommentText e={e} className="bl-text" prefix={prefix} />
        {e.kind === 'image' && <ImageContent e={e} maxW={150} maxH={165} radius={5} />}
        {e.authorLiked && has(scene.rules, 'authorLiked') && (
          <span className="bl-meta" onDoubleClick={studio ? ev => { ev.stopPropagation(); studio.toggleAuthorLiked(e.id) } : undefined}>{scene.tx('UP主觉得很赞', 'Liked by the creator')}</span>
        )}
        <div className="bl-actions">
          <span className={cx('bl-like', e.isLiked && 'on')}>
            <span onClick={studio ? ev => { ev.stopPropagation(); studio.toggleLiked(e.id) } : undefined}><Io name={e.isLiked ? 'thumbUpFill' : 'thumbUp'} size={13} /></span>
            {(e.likes || editingLikes) && <Ed k={`likes:${e.id}`} value={e.likes} multiline={false} />}
          </span>
          <Io name="thumbDown" size={13} />
          <Io name="arrowRedoO" size={13} />
          <Io name="chat" size={13} />
          <span style={{ flex: 1 }} />
          <Io name="moreV" size={14} />
        </div>
        {more && (
          <div className="bl-more">
            {scene.tx('共', 'View ')}<Ed k={`replies:${more.root}`} value={more.count} multiline={false} />{scene.tx('条回复', ' replies')}<Io name="forward" size={9} />
          </div>
        )}
      </div>
    </RowShell>
  )
}

export const bilibili: Skin = {
  className: 'sk-bilibili',
  navHeight: 40,
  composerHeight: 51,
  wall: dark => (dark ? '#141414' : '#FFFFFF'),
  divider: true,
  Nav,
  Composer,
  Row,
}
