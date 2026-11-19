// WeChat Moments: the cover under a transparent bar, posts with photos, the likes / comments box.
// Profile page ("相册"): the same cover, then posts as an album with big dates on the left.

import type * as R from 'react'
import { useRef, type ReactNode } from 'react'
import { useScene, type RowProps } from '../context'
import { Avatar, Ed, Img, RowShell, cx, dropHandlers, editOn, imageFile, readPayload, usePerson, useReplyTarget } from '../parts'
import { CommentText, ComposerField, Cover } from '../shared'
import type { ComposerProps, Skin } from '../skin'
import { showsMomentsProfile } from '../../model/rules'
import type { Entry, Project } from '../../model/types'
import { Io } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './moments.css'

export const PICTURE_H = 280

const photosOf = (e: Entry): string[] => (e.gallery?.length ? e.gallery : e.kind === 'image' && e.image ? [e.image] : [])

function Nav({ overCover }: { typing?: boolean; overCover?: boolean }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const profile = showsMomentsProfile(scene.p)
  return (
    <div className={cx('nav mo-nav', overCover && 'over')}>
      {!overCover && <span className="mo-title">{scene.tx('朋友圈', 'Moments')}</span>}
      <Io name="back" size={22} />
      <span style={{ flex: 1 }} />
      {profile
        ? <><span className="mo-icon"><Io name="copy" size={19} /></span><span className="mo-icon"><Io name="more" size={20} /></span></>
        : <span className="mo-icon" title={studio ? 'Post' : undefined} onClick={studio ? ev => { ev.stopPropagation(); studio.newMomentsPost() } : undefined}><Io name="camera" size={22} /></span>}
    </div>
  )
}

/** Who the "new messages" capsule shows: the last person who commented on or liked something (not me). */
function alertPerson(p: Project) {
  const others = (id: string) => id !== p.selfID
  const id = [...p.entries].reverse().find(e => e.isReply && others(e.personID))?.personID
    ?? p.entries.map(e => [...(e.likers ?? [])].reverse().find(others)).filter(Boolean).pop()
    ?? p.people.find(x => others(x.id))?.id
  return id ? p.people.find(x => x.id === id) : undefined
}

function Lead({ underNav }: { underNav: number }) {
  const scene = useScene()
  const p = scene.p
  const me = p.selfID ? p.people.find(x => x.id === p.selfID) : undefined
  const alert = p.momentsAlert && !showsMomentsProfile(p) ? p.momentsAlert : undefined
  const person = alert ? alertPerson(p) : undefined
  return (
    <div className="mo-lead" data-picture={PICTURE_H}>
      <div className="mo-cover-box">
        <Cover className="mo-cover" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: PICTURE_H + underNav }} />
        {me && (
          <div className="mo-me">
            <Ed k={`castName:${me.id}`} value={me.name} className="mo-me-name" multiline={false} />
            <span className="mo-me-face"><Avatar person={me} size={68} square /></span>
          </div>
        )}
      </div>
      {alert && (
        <div className="mo-alert-row">
          <span className="mo-alert">
            {person && <Avatar person={person} size={30} square plain />}
            <span><Ed k="momentsAlert" value={alert} multiline={false} />{p.language === 'chinese' ? '条新消息' : alert === '1' ? ' new message' : ' new messages'}</span>
          </span>
        </div>
      )}
    </div>
  )
}

function Composer({ typed, live }: ComposerProps) {
  const scene = useScene()
  return (
    <div className="mo-composer">
      <span className="mo-field"><ComposerField placeholder={scene.tx('评论', 'Comment')} typed={typed} live={live} /></span>
      <Io name="smile" size={28} />
    </div>
  )
}

// MARK: rows

function Row(props: RowProps) {
  const scene = useScene()
  if (props.e.isReply) return <Comment {...props} />
  return showsMomentsProfile(scene.p) ? <AlbumRow {...props} /> : <Post {...props} />
}

function Photos({ e }: { e: Entry }) {
  const photos = photosOf(e)
  if (photos.length === 1) return <div className="mo-photos one"><Photo e={e} id={photos[0]} index={0} single /></div>
  const columns = photos.length === 4 ? 2 : 3
  return (
    <div className="mo-photos" style={{ gridTemplateColumns: `repeat(${columns}, 88px)` }}>
      {photos.map((id, i) => <Photo key={i} e={e} id={id} index={i} />)}
    </div>
  )
}

function Photo({ e, id, index, single }: { e: Entry; id: string; index: number; single?: boolean }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  return (
    <span className={cx('mo-photo', single && 'single')}
      {...(studio ? {
        onDoubleClick: (ev: R.MouseEvent) => { ev.stopPropagation(); void studio.requestImage({ kind: 'photo', id: e.id, index }) },
        ...dropHandlers(studio, dt => {
          const f = imageFile(dt)
          if (f) { void studio.deliver(f, { kind: 'photo', id: e.id, index }); return }
          return false
        }),
      } : {})}>
      <Img id={id} />
    </span>
  )
}

function Post({ e, next, isolated, inCard }: RowProps) {
  const scene = useScene()
  const p = scene.p
  const person = usePerson(e)
  const studio = scene.live ? scene.studio : null
  const editingText = useStudio(s => s.editing === `text:${e.id}`, false)
  const editingDetail = useStudio(s => s.editing === `detail:${e.id}`, false)
  const previewing = useStudio(s => s.likePreview?.id === e.id, false)
  const photos = photosOf(e)
  const repliesFollow = !isolated && !!next?.isReply
  const hasBox = !!e.likers?.length || repliesFollow || previewing
  const separated = !isolated && !(inCard && !next)
  const mine = e.personID === p.selfID
  const dotsRef = useRef<HTMLSpanElement>(null)
  return (
    <RowShell e={e} className={cx('mo-post', repliesFollow && 'continues', !repliesFollow && separated && 'separated')}>
      <Avatar person={person} size={42} square entry={e.id} />
      <div className="mo-main hit">
        <Ed k={`name:${e.id}`} value={person.name} className="mo-name" multiline={false} />
        {(e.text || editingText || !photos.length) && <CommentText e={e} className="mo-text" />}
        {photos.length > 0 && <Photos e={e} />}
        {(e.detail !== undefined || editingDetail) && <Ed k={`detail:${e.id}`} value={e.detail ?? ''} className="mo-place" multiline={false} />}
        <div className="mo-meta">
          <Ed k={`metadata:${e.id}`} value={e.metadata || scene.tx('刚刚', 'Just now')} start={e.metadata} className="mo-time" multiline={false} />
          {mine && e.audience && (
            <span className="mo-time mo-audience" onClick={studio ? ev => { ev.stopPropagation(); studio.cycleAudience(e.id) } : undefined}>
              <Io name={e.audience === 'onlyMe' ? 'lock' : 'people'} size={12} />
            </span>
          )}
          {mine && <span className="mo-delete">{scene.tx('删除', 'Delete')}</span>}
          <span style={{ flex: 1 }} />
          <span ref={dotsRef} className="mo-dots" title={studio ? 'Like or comment' : undefined}
            onClick={studio ? ev => {
              ev.stopPropagation()
              studio.openFloating({ kind: 'moments', id: e.id }, dotsRef.current!.getBoundingClientRect())
            } : undefined}><i /><i /></span>
        </div>
        {hasBox && <LikesBox e={e} continues={repliesFollow} />}
      </div>
    </RowShell>
  )
}

function LikesBox({ e, continues }: { e: Entry; continues: boolean }) {
  const scene = useScene()
  const p = scene.p
  const studio = scene.live ? scene.studio : null
  const preview = useStudio(s => (s.likePreview?.id === e.id ? s.likePreview.count : undefined), undefined)
  const names: { name: string; person?: string }[] = preview !== undefined && studio
    ? studio.likeCandidates(e.id).slice(0, preview)
    : (e.likers ?? []).map(id => p.people.find(x => x.id === id)).filter(Boolean).map(x => ({ name: x!.name, person: x!.id }))
  const separator = scene.tx('，', ', ')
  const drag = useRef<{ x: number; start: number } | undefined>(undefined)
  return (
    <div className={cx('mo-box', continues && 'continues')}
      {...(studio ? dropHandlers(studio, dt => {
        const payload = readPayload(dt)
        if (payload?.type === 'person') { studio.addLiker(e.id, payload.id); return }
        if (payload?.type === 'persona') { studio.addLikerFromPersona(e.id, payload.id); return }
        return false
      }) : {})}>
      <i className="mo-nib" />
      {names.length > 0 || preview !== undefined ? (
        <div className="mo-likes">
          <span className="mo-heart" title={studio ? 'Drag sideways to add or remove likes' : undefined}
            onPointerDown={studio ? ev => {
              ev.stopPropagation()
              ev.currentTarget.setPointerCapture(ev.pointerId)
              drag.current = { x: ev.clientX, start: e.likers?.length ?? 0 }
            } : undefined}
            onPointerMove={studio ? ev => {
              const d = drag.current
              if (!d || Math.abs(ev.clientX - d.x) < 2) return
              studio.previewLikes(e.id, d.start + Math.round((ev.clientX - d.x) / 16))
            } : undefined}
            onPointerUp={studio ? () => { if (drag.current) { drag.current = undefined; studio.commitLikes() } } : undefined}>
            <Io name="heart" size={14} />
          </span>
          <span className="mo-liker-list">
            {names.map((x, i) => (
              <span key={i} onDoubleClick={studio && x.person ? ev => { ev.stopPropagation(); studio.removeLiker(e.id, x.person!) } : undefined}>
                {x.name}{i < names.length - 1 ? separator : ''}
              </span>
            ))}
          </span>
        </div>
      ) : <div style={{ height: 4 }} />}
    </div>
  )
}

function Comment({ e, prev, next, isolated, inCard }: RowProps) {
  const scene = useScene()
  const person = usePerson(e)
  const target = useReplyTarget(e)
  const first = isolated || !prev?.isReply
  const last = isolated || !next?.isReply
  const separated = !isolated && !(inCard && !next)
  const prefix: ReactNode = <>
    <span className="mo-cname">{person.name}</span>
    {target && <>{scene.tx(' 回复 ', ' replied to ')}<span className="mo-cname">{target}</span></>}
    {scene.tx('：', ': ')}
  </>
  return (
    <RowShell e={e} className={cx('mo-comment', first && 'first', last && 'last', isolated && 'isolated', last && separated && 'separated')}>
      <div className="mo-cbox hit">
        <CommentText e={e} className="mo-ctext" prefix={prefix} />
        {(e.kind === 'image' || e.kind === 'sticker') && e.image && <span className="mo-cimg"><Img id={e.image} /></span>}
      </div>
    </RowShell>
  )
}

// MARK: profile (album)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "3天前" / "11月5日" / "2026-11-05" / "Nov 5" → a big day and a small month, the way the album shows dates. */
export function albumDate(raw: string, zh: boolean): { big: string; small?: string } {
  const text = raw.trim()
  const lower = text.toLowerCase()
  const two = (d: string) => (d.length === 1 ? '0' + d : d)
  if (!text || ['刚刚', '分钟前', '小时前'].some(x => text.includes(x)) || ['just now', 'min', 'hour', 'hr'].some(x => lower.includes(x))) return { big: zh ? '今天' : 'Today' }
  let m = /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(text)
  if (m) return { big: two(m[2]), small: `${Number(m[1])}月` }
  m = /^(?:\d{4}[-/.])?(\d{1,2})[-/.](\d{1,2})$/.exec(text)
  if (m) { const month = Number(m[1]); return { big: two(m[2]), small: zh ? `${month}月` : MONTHS[Math.max(0, Math.min(11, month - 1))] } }
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/.exec(text)
  if (m) return { big: two(m[2]), small: m[1] }
  return { big: text }
}

function AlbumRow({ e, prev, isolated }: RowProps) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const editingMeta = useStudio(s => s.editing === `metadata:${e.id}`, false)
  const editingText = useStudio(s => s.editing === `text:${e.id}`, false)
  const sameDay = !isolated && !!prev && !prev.isReply && prev.metadata === e.metadata
  const photos = photosOf(e)
  const date = albumDate(e.metadata, scene.zh)
  return (
    <RowShell e={e} className={cx('mo-album', sameDay && 'same-day')}>
      <div className="mo-date" style={{ opacity: sameDay && !editingMeta ? 0 : 1 }}>
        {editingMeta
          ? <Ed k={`metadata:${e.id}`} value={e.metadata} multiline={false} />
          : <span {...editOn(studio, `metadata:${e.id}`)}><b style={{ fontSize: [...date.big].length <= 2 ? 26 : 19 }}>{date.big}</b>{date.small && <small>{date.small}</small>}</span>}
      </div>
      <div className="mo-album-main hit">
        {photos.length === 0
          ? <CommentText e={e} className={cx('mo-album-text boxed', !editingText && 'clamp4')} />
          : <>
            {(e.text || editingText) && <CommentText e={e} className={cx('mo-album-text', !editingText && 'clamp3')} />}
            <div className="mo-thumbs">
              {photos.slice(0, 3).map((id, i, shown) => (
                <span key={i} className="mo-thumb"><Photo e={e} id={id} index={i} />
                  {i === shown.length - 1 && photos.length > shown.length && <span className="mo-more">+{photos.length - shown.length}</span>}
                </span>
              ))}
            </div>
          </>}
      </div>
    </RowShell>
  )
}

export const moments: Skin = {
  className: 'sk-moments',
  navHeight: 44,
  composerHeight: 56,
  wall: dark => (dark ? '#111111' : '#FFFFFF'),
  bar: dark => (dark ? '#1E1E1E' : '#F7F7F7'),
  divider: true,
  Nav,
  Composer,
  Row,
  Lead,
  navOverLead: true,
}
