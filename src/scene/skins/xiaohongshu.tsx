// Xiaohongshu (RED) note page: the note (pictures, title, body with #tags) scrolls above the comments.

import type * as R from 'react'
import { useRef, type ReactNode } from 'react'
import { useScene, type RowProps } from '../context'
import { Avatar, Ed, ImageContent, Img, RowShell, cx, dropHandlers, editOn, imageFile, usePerson, useMoreReplies, useReplyTarget } from '../parts'
import { CommentText, ComposerField } from '../shared'
import { Waveform } from '../cards'
import type { ComposerProps, Skin } from '../skin'
import { has, isNoticeKind, visibleEntries } from '../../model/rules'
import { notePictureIndex, notePictures, voiceDuration } from '../../model/project'
import { Io, Lu, type IoName } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './xiaohongshu.css'

function Nav() {
  const scene = useScene()
  const p = scene.p
  const studio = scene.live ? scene.studio : null
  const author = p.authorID ? p.people.find(x => x.id === p.authorID) : undefined
  return (
    <div className="nav xh-nav">
      <Io name="back" size={22} />
      {author && <>
        <Avatar person={author} size={32} />
        <Ed k={`castName:${author.id}`} value={author.name} className="xh-author" multiline={false} />
      </>}
      <span style={{ flex: 1 }} />
      <span className={cx('xh-follow', p.following && 'on')} onClick={studio ? ev => { ev.stopPropagation(); studio.toggleFollowing() } : undefined}>
        {p.following ? scene.tx('已关注', 'Following') : scene.tx('关注', 'Follow')}
      </span>
      <Io name="share" size={21} />
    </div>
  )
}

/** "#tag" and "@name" in the note body are blue. */
function tagged(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(/[#＃@][^\s#＃@]+/g)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    out.push(<span key={m.index} className="xh-tag">{m[0]}</span>)
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function NotePicture() {
  const scene = useScene()
  const p = scene.p
  const studio = scene.live ? scene.studio : null
  const pictures = notePictures(p)
  const index = notePictureIndex(p)
  const drag = useRef<{ x: number; y: number } | undefined>(undefined)
  return (
    <div className="xh-pictures">
      <div className="xh-picture cover"
        {...(studio ? {
          onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'notePicture', index: pictures.length ? index : undefined }) },
          onPointerDown: (ev: R.PointerEvent) => { drag.current = { x: ev.clientX, y: ev.clientY } },
          onPointerUp: (ev: R.PointerEvent) => {
            const d = drag.current
            drag.current = undefined
            if (!d) return
            const dx = ev.clientX - d.x, dy = ev.clientY - d.y
            if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) studio.showNotePicture(index + (dx < 0 ? 1 : -1))
          },
          ...dropHandlers(studio, dt => {
            const files = Array.from(dt.files).filter(f => f.type.startsWith('image/'))
            if (!files.length) return imageFile(dt) ? undefined : false
            void (async () => {
              for (const [k, f] of files.entries()) {
                await studio.deliver(f, { kind: 'notePicture', index: k === 0 && pictures.length ? index : undefined })
              }
            })()
          }),
        } : {})}
        title={studio ? 'Double-click or drop a picture here. Drag sideways to flip' : undefined}>
        {pictures[index]
          ? <Img id={pictures[index]} className="xh-img" />
          : <span className="xh-empty"><Io name="image" size={30} /></span>}
        {pictures.length > 1 && <span className="xh-page">{index + 1}/{pictures.length}</span>}
      </div>
      {pictures.length > 1 && (
        <div className="xh-dots">
          {pictures.map((_, k) => <i key={k} className={cx(k === index && 'on')} onClick={studio ? ev => { ev.stopPropagation(); studio.showNotePicture(k) } : undefined} />)}
        </div>
      )}
    </div>
  )
}

function Lead() {
  const scene = useScene()
  const p = scene.p
  const studio = scene.live ? scene.studio : null
  const editingBody = useStudio(s => s.editing === 'noteText', false) && !!studio
  const counted = String(visibleEntries(p).filter(e => !isNoticeKind(e.kind)).length)
  return (
    <div className="xh-note">
      <NotePicture />
      <Ed k="noteTitle" value={p.noteTitle ?? ''} className="xh-title" placeholder={scene.tx('标题', 'Title')} />
      {editingBody || !p.noteText
        ? <Ed k="noteText" value={p.noteText ?? ''} className="xh-body" placeholder={scene.tx('正文 #话题', 'Body #topic')} />
        : <div className="xh-body" {...editOn(studio, 'noteText')}>{tagged(p.noteText)}</div>}
      <Ed k="noteMeta" value={p.noteMeta ?? ''} className="xh-meta xh-notemeta" multiline={false} placeholder={scene.tx('编辑于 11-05 河北', 'Edited 11-05')} />
      <i className="xh-rule" />
      <div className="xh-total xh-meta">
        {scene.tx('共 ', '')}<Ed k="commentCount" value={p.commentCount ?? counted} multiline={false} />{scene.tx(' 条评论', ' comments')}
      </div>
    </div>
  )
}

function Stat({ icon, k, value, empty }: { icon: IoName; k: string; value?: string; empty: string }) {
  const editing = useStudio(s => s.editing === k, false)
  return (
    <span className="xh-stat">
      <Io name={icon} size={20} />
      <Ed k={k} value={editing ? value ?? '' : value || empty} start={value ?? ''} multiline={false} />
    </span>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  const p = scene.p
  const counted = String(visibleEntries(p).filter(e => !isNoticeKind(e.kind)).length)
  return (
    <div className="xh-composer">
      <span className="xh-field">
        <Lu name="pencilLine" size={13} />
        <ComposerField placeholder={scene.tx('说点什么...', 'Say something...')} typed={typed} live={live} />
      </span>
      <Stat icon="heart" k="noteLikes" value={p.noteLikes} empty={scene.tx('赞', 'Like')} />
      <Stat icon="starO" k="noteSaves" value={p.noteSaves} empty={scene.tx('收藏', 'Save')} />
      <Stat icon="chatO" k="commentCount" value={p.commentCount ?? counted} empty={scene.tx('评论', 'Comment')} />
    </div>
  )
}

function Row({ e, isolated }: RowProps) {
  const scene = useScene()
  const p = scene.p
  const person = usePerson(e)
  const studio = scene.live ? scene.studio : null
  const reply = e.isReply && has(scene.rules, 'thread') && !isolated
  const creator = has(scene.rules, 'author') && p.authorID === person.id
  const target = useReplyTarget(e)
  const more = useMoreReplies(e, isolated)
  const editingMeta = useStudio(s => s.editing === `metadata:${e.id}`, false)
  const editingLikes = useStudio(s => s.editing === `likes:${e.id}`, false)
  const editingSeconds = useStudio(s => s.editing === `seconds:${e.id}`, false)
  const pinned = has(scene.rules, 'pinned') && e.pinned && !e.isReply
  const prefix = pinned || target ? <>
    {pinned && <span className="xh-red">{scene.tx('置顶评论 ', 'Pinned ')}</span>}
    {target && <>{scene.tx('回复 ', 'Reply ')}<span className="xh-meta">{target}</span>{scene.tx('：', ': ')}</>}
  </> : undefined
  let content: ReactNode
  if (e.kind === 'voice') {
    const d = voiceDuration(e)
    content = (
      <span className="xh-voice hit" {...editOn(studio, `seconds:${e.id}`)}>
        <Io name="play" size={10} />
        <Waveform seconds={d} width={Math.min(6 + Math.floor(d / 3), 20) * 4} color="currentColor" seed={e.id.charCodeAt(4)} />
        {editingSeconds ? <Ed k={`seconds:${e.id}`} value={String(d)} multiline={false} /> : <span>{d}″</span>}
      </span>
    )
  } else if (e.kind === 'image') content = <div className="xh-pic"><ImageContent e={e} maxW={140} maxH={170} radius={6} /></div>
  else content = <CommentText e={e} className="xh-text hit" prefix={prefix} />
  return (
    <RowShell e={e} className={cx('xh-row', reply && 'reply')}>
      <Avatar person={person} size={reply ? 24 : 32} entry={e.id} />
      <div className="xh-cbody">
        <div className="xh-byline">
          <Ed k={`name:${e.id}`} value={person.name} className="xh-name" multiline={false} />
          {creator && <span className="xh-badge">{scene.tx('作者', 'Author')}</span>}
        </div>
        {content}
        <div className="xh-foot xh-meta">
          {(e.metadata || editingMeta) && <Ed k={`metadata:${e.id}`} value={e.metadata} multiline={false} />}
          <span>{scene.tx('回复', 'Reply')}</span>
          <span style={{ flex: 1 }} />
          <span className="xh-like">
            <span className={cx('xh-heart', e.isLiked && 'on')} onClick={studio ? ev => { ev.stopPropagation(); studio.toggleLiked(e.id) } : undefined}><Io name={e.isLiked ? 'heartFill' : 'heart'} size={14} /></span>
            {(e.likes || editingLikes) && <Ed k={`likes:${e.id}`} value={e.likes} multiline={false} />}
          </span>
        </div>
        {more && (
          <div className="xh-more">{scene.tx('展开 ', 'Show ')}<Ed k={`replies:${more.root}`} value={more.count} multiline={false} />{scene.tx(' 条回复', ' replies')}</div>
        )}
      </div>
    </RowShell>
  )
}

export const xiaohongshu: Skin = {
  className: 'sk-xhs',
  navHeight: 48,
  composerHeight: 52,
  wall: dark => (dark ? '#111111' : '#FFFFFF'),
  divider: true,
  Nav,
  Composer,
  Row,
  Lead,
}
