// Everything that floats. No system menus: each panel grows out of what opened it, closes when you click outside,
// and only one is open at a time. Panels only hold what has no spot on the phone itself.
// With a mouse (as on the Mac): right-click an entry for its full panel; right-click the paper for the page's.
// With touch (as on the iPad): a toolbar over the selected entry and over the tapped page; "…" opens the rest.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useStudio, useStudioRef, type Anchor, type Studio, type StudioState } from '../store/studio'
import { Lu, type LuName } from './icons'
import { t, locale } from '../i18n'
import {
  allows, arrangements, canSwitch, castOf, has, hasSelf, hiddenCount, insertable, isAssistant, isChat, isNoticeKind, layoutOf,
  projectRules, visibleEntries,
} from '../model/rules'
import { DISPLAY_NAME, familyOf, platformOf, reactionChoices } from '../model/templates'
import { notePictures, switchTemplate } from '../model/project'
import { TEMPLATES, type Arrangement, type Entry, type Kind, type Person, type Project } from '../model/types'
import { useLibrary } from '../store/library'
import { Phone } from '../scene/Phone'
import { ROLES } from '../scene/skins/discord'
import { stillPlayback } from '../video/timeline'
import { soundEnabled, setSoundEnabled } from '../sound/board'
import { usesTwelveHour } from '../model/time'
import { addPersonas } from './personas'
import { AssistantMark, Cell, Face, GlyphButton, HairLine, PanelRow, PillPicker, Separator, TEMPLATE_GLYPH, cx, desktop, usePlacement } from './kit'

const sel = <T,>(f: (s: StudioState) => T) => f

// MARK: kinds

export const KIND_NAME: Record<Kind, string> = {
  text: 'Text', image: 'Photo', sticker: 'Sticker', voice: 'Voice', call: 'Call', link: 'Link', file: 'File',
  location: 'Location', card: 'Contact', pat: 'Nudge', recall: 'Unsend', time: 'Time', system: 'Notice', snap: 'Snap',
  screenshot: 'Screenshot', notification: 'Notification',
}

export const KIND_ICON: Record<Kind, LuName> = {
  text: 'type', image: 'image', sticker: 'smile', voice: 'audioLines', call: 'phone', link: 'link', file: 'file',
  location: 'mapPin', card: 'contact', pat: 'hand', recall: 'undo2', time: 'clock', system: 'info', snap: 'squareFill',
  screenshot: 'scan', notification: 'bell',
}

const ARRANGEMENT: Record<Arrangement, { title: string; icon: LuName }> = {
  page: { title: 'Page', icon: 'page' }, cards: { title: 'Cards', icon: 'cards' }, stickers: { title: 'Stickers', icon: 'sticker' },
}

const square = (p: Project) => platformOf(p.template) === 'wechat'
const isReplyByAI = (p: Project, e: Entry) => isAssistant(projectRules(p)) && e.personID !== p.selfID

// MARK: host

export function FloatingHost() {
  const studio = useStudioRef()!
  const floating = useStudio(sel(s => s.floating), undefined)
  const anchor = useStudio(sel(s => s.anchor), undefined)
  if (!floating || floating.kind === 'paste') return null
  const key = JSON.stringify(floating)
  return (
    <>
      <div className="float-catcher" onClick={ev => { ev.stopPropagation(); studio.closeFloating() }}
        onContextMenu={ev => { ev.preventDefault(); studio.closeFloating() }} />
      {floating.kind === 'more' && <EntryMorePanel key={key} studio={studio} id={floating.id} anchor={anchor} adding={floating.insert} />}
      {floating.kind === 'insert' && <InsertPanel key={key} studio={studio} after={floating.after} anchor={anchor} />}
      {floating.kind === 'sender' && <SenderPanel key={key} studio={studio} id={floating.id} anchor={anchor} />}
      {floating.kind === 'avatar' && <AvatarCard key={key} studio={studio} personID={floating.person} anchor={anchor} />}
      {floating.kind === 'page' && <CanvasPanel key={key} studio={studio} anchor={anchor} />}
      {floating.kind === 'scene' && <ScenePanel key={key} studio={studio} anchor={anchor} />}
      {floating.kind === 'export' && <ExportPanel key={key} studio={studio} anchor={anchor} />}
      {floating.kind === 'moments' && <MomentsPanel key={key} studio={studio} id={floating.id} anchor={anchor} />}
    </>
  )
}

/** A frosted panel placed next to its anchor. */
function Float({ anchor, className, style, children, left, above }: { anchor?: Anchor; className?: string; style?: CSSProperties; children: ReactNode; left?: boolean; above?: boolean }) {
  const place = usePlacement(anchor, { left, above })
  return (
    <div ref={place.ref} className={cx('float', className)} style={{ ...place.style, ...style }} onClick={ev => ev.stopPropagation()}
      onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation() }}>
      {children}
    </div>
  )
}

// MARK: the one or two things an entry is most often used for

interface Action { id: string; title: string; icon: LuName; tint?: string; run: () => void }

/** The toolbar (touch) and the top of the right-click panel (mouse) share these. Delete is always there; before it,
 *  the one thing this entry is most used for that has no spot on screen: replace a picture, quote, make a reply… */
function quickActions(studio: Studio, p: Project, e: Entry): Action[] {
  const r = projectRules(p)
  const id = e.id
  const list: Action[] = []
  if (has(r, 'likers') && !isNoticeKind(e.kind)) {
    if (e.isReply) list.push({ id: 'reply', title: t('Reply'), icon: 'reply', run: () => { studio.closeFloating(); studio.startComment(postOf(p, id) ?? id, e.personID) } })
    else list.push({ id: 'photos', title: t('Add photos'), icon: 'imagePlus', run: () => { studio.closeFloating(); void studio.requestImage({ kind: 'photo', id }) } })
  } else if (isNoticeKind(e.kind) || e.kind === 'notification') {
    // time, notices, nudges, notifications: double-click to edit; only delete and "…"
  } else if (isAssistant(r) && isReplyByAI(p, e) && e.kind === 'text') {
    list.push({ id: 'thinking', title: e.thinking ? t('Remove thinking') : t('Add thinking'), icon: e.thinking ? 'lightbulbOff' : 'lightbulb', run: () => { studio.closeFloating(); studio.toggleThinking(id) } })
  } else if (e.kind === 'snap') {
    list.push({ id: 'snapSound', title: e.video ? t('Photo Snap') : t('Snap with sound'), icon: e.video ? 'image' : 'volume2', run: () => studio.toggleSnapSound(id) })
  } else if (e.kind === 'image' || e.kind === 'sticker') {
    list.push({ id: 'image', title: t('Replace'), icon: e.kind === 'sticker' ? 'smile' : 'image', run: () => { studio.closeFloating(); void studio.requestImage({ kind: 'entry', id }) } })
  } else if (isChat(r)) {
    if (has(r, 'quote')) {
      list.push(e.quote
        ? { id: 'quote', title: t('Remove quote'), icon: 'textQuote', run: () => studio.removeQuote(id) }
        : { id: 'quote', title: t('Quote'), icon: 'quote', run: () => studio.addQuote(id) })
    }
  } else if (has(r, 'thread')) {
    list.push({ id: 'reply', title: e.isReply ? t('Make top-level') : t('Make reply'), icon: e.isReply ? 'cornerUpLeft' : 'cornerDownRight', run: () => studio.toggleReply(id) })
  }
  list.push({ id: 'delete', title: t('Delete'), icon: 'trash', tint: 'var(--red)', run: () => { studio.closeFloating(); studio.delete(id) } })
  return list
}

/** The Moments post a comment belongs to. */
function postOf(p: Project, id: string) {
  let post: string | undefined
  for (const e of p.entries) { if (!e.isReply) post = e.id; if (e.id === id) return post }
  return undefined
}

// MARK: toolbars (touch)

/** Over the selected entry: who sent it | the usual one or two | more. Above it, or below when there's no room. */
export function EntryActionBar({ entry, anchor, top, bottom }: { entry: Entry; anchor: DOMRect; top: number; bottom: number }) {
  const studio = useStudioRef()!
  const p = useStudio(sel(s => s.project), studio.project)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    let x = anchor.x + anchor.width / 2 - w / 2
    x = Math.min(Math.max(x, 8), Math.max(8, window.innerWidth - 8 - w))
    let y = anchor.y - 10 - h
    if (y < top + 4) y = anchor.bottom + 10
    y = Math.min(Math.max(y, top + 4), bottom - h - 4)
    if (Math.abs(x - pos.left) > 0.5 || Math.abs(y - pos.top) > 0.5) setPos({ left: x, top: y })
  })
  const actions = quickActions(studio, p, entry)
  const person = p.people.find(x => x.id === entry.personID)
  const who = (!isNoticeKind(entry.kind) || entry.kind === 'screenshot') && person
  return (
    <div ref={ref} className="float bar frost" style={pos} onClick={ev => ev.stopPropagation()}>
      {who && (
        <>
          <button className="bar-who" title={t('Sender')} aria-label={t('Sender')}
            onClick={ev => { ev.stopPropagation(); studio.openFloating({ kind: 'sender', id: entry.id }, ev.currentTarget.getBoundingClientRect()) }}>
            {isReplyByAI(p, entry) ? <AssistantMark size={24} /> : <Face person={person} size={24} square={square(p)} />}
            <Lu name="chevronDown" size={9} strokeWidth={3} />
          </button>
          <Separator />
        </>
      )}
      {actions.map(a => <GlyphButton key={a.id} icon={a.icon} title={a.title} size={42} glyph={17} tint={a.tint} onClick={a.run} />)}
      <Separator />
      <GlyphButton icon="more" title={t('More')} size={42} glyph={17}
        onClick={ev => studio.openFloating({ kind: 'more', id: entry.id }, ev.currentTarget.getBoundingClientRect())} />
    </div>
  )
}

/** The tapped page: dark, wallpaper, keyboard; "…" for the rest. */
export function PageActionBar({ anchor, top, bottom }: { anchor: Anchor; top: number; bottom: number }) {
  const studio = useStudioRef()!
  const p = useStudio(sel(s => s.project), studio.project)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    let x = anchor.x + anchor.w / 2 - w / 2
    x = Math.min(Math.max(x, 8), Math.max(8, window.innerWidth - 8 - w))
    let y = anchor.y - 10 - h
    if (y < top + 4) y = anchor.y + anchor.h + 10
    y = Math.min(Math.max(y, top + 4), bottom - h - 4)
    if (Math.abs(x - pos.left) > 0.5 || Math.abs(y - pos.top) > 0.5) setPos({ left: x, top: y })
  })
  const r = projectRules(p)
  const page = layoutOf(p) === 'page'
  return (
    <div ref={ref} className="float bar frost" style={pos} onClick={ev => ev.stopPropagation()}>
      <Cell icon="moon" title={t('Dark')} on={p.dark} size={38} glyph={17} onClick={() => studio.togglePage('dark')} />
      {page && has(r, 'wallpaper') && <Cell icon="wallpaper" title={t('Wallpaper')} on={!!p.wallpaper} size={38} glyph={17} onClick={() => void studio.requestImage({ kind: 'wallpaper' })} />}
      {page && <Cell icon="keyboard" title={t('Keyboard')} on={!!p.keyboard} size={38} glyph={17} onClick={() => studio.toggleKeyboard()} />}
      <Separator />
      <GlyphButton icon="more" title={t('More')} size={42} glyph={17} onClick={ev => studio.openFloating({ kind: 'page' }, ev.currentTarget.getBoundingClientRect())} />
    </div>
  )
}

// MARK: more (right-click an entry; "…" on the toolbar)

interface Mark { id: string; title: string; icon?: LuName; on: boolean; tint?: string; run: () => void }

function EntryMorePanel({ studio, id, anchor, adding: startAdding }: { studio: Studio; id: string; anchor?: Anchor; adding?: boolean }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const [adding, setAdding] = useState(!!startAdding)
  const e = p.entries.find(x => x.id === id)
  if (!e) return null
  const r = projectRules(p)
  const full = desktop
  const sq = square(p)
  const isRoot = !isChat(r) && !e.isReply
  const notice = isNoticeKind(e.kind)

  // who
  const showWho = full && (!notice || e.kind === 'pat' || e.kind === 'screenshot')
  const replyTargets = !isChat(r) && !notice && e.isReply && has(r, 'replyTarget')
  const hasTargets = e.kind === 'pat' || e.kind === 'card' || replyTargets

  // reactions and states
  const emojis = isChat(r) && !notice && (has(r, 'reaction') || has(r, 'reactions')) ? reactionChoices(platformOf(p.template)) : []
  const reacted = (emoji: string) => has(r, 'reactions')
    ? !!e.reactions?.some(x => x.emoji === emoji && x.mine)
    : e.isLiked && (e.reaction ?? '❤️') === emoji
  const react = (emoji: string) => {
    if (has(r, 'reactions')) studio.toggleMyReaction(id, emoji)
    else studio.setReaction(id, reacted(emoji) ? undefined : emoji)
  }
  const marks: Mark[] = []
  if (!notice) {
    if (isChat(r)) {
      if (has(r, 'reaction') && !emojis.length) marks.push({ id: 'heart', title: t('Heart reaction'), icon: 'heart', on: e.isLiked, run: () => studio.toggleLiked(id) })
      if (has(r, 'saved')) marks.push({ id: 'saved', title: t('Saved'), icon: 'bookmark', on: !!e.saved, run: () => studio.toggleSaved(id) })
      if (has(r, 'edited') && e.kind === 'text') marks.push({ id: 'edited', title: t('Edited'), on: !!e.edited, run: () => studio.toggleEdited(id) })
      if (has(r, 'failed') && e.personID === p.selfID) marks.push({ id: 'failed', title: t('Not delivered'), icon: 'circleAlert', on: !!e.failed, tint: 'var(--red)', run: () => studio.toggleFailed(id) })
    } else {
      if (isRoot && has(r, 'pinned')) marks.push({ id: 'pinned', title: t('Pinned'), icon: 'pin', on: !!e.pinned, run: () => studio.togglePinned(id) })
      if (has(r, 'authorLiked')) marks.push({ id: 'authorLiked', title: t('Liked by creator'), icon: 'thumbUp', on: !!e.authorLiked, run: () => studio.toggleAuthorLiked(id) })
      if (isRoot && has(r, 'moreReplies')) marks.push({ id: 'replies', title: t('Reply count'), icon: 'messageMore', on: !!e.replies, run: () => (e.replies ? studio.removeReplies(id) : studio.addReplies(id)) })
    }
    if (has(r, 'likers') && !e.isReply && e.personID === p.selfID) {
      const audience = e.audience === 'partial' ? t('Some friends') : e.audience === 'onlyMe' ? t('Only me') : t('Public')
      marks.push({ id: 'audience', title: `${t('Who can see')} · ${audience}`, icon: e.audience === 'onlyMe' ? 'lock' : e.audience === 'partial' ? 'users' : 'globe', on: !!e.audience, run: () => studio.cycleAudience(id) })
    }
  }
  const hasMarks = emojis.length > 0 || marks.length > 0

  // actions
  const quick = quickActions(studio, p, e)
  const actions: Action[] = []
  if (full) actions.push(...quick.filter(a => a.id !== 'delete'))
  actions.push({ id: 'duplicate', title: full ? `${t('Duplicate')}   ⌘D` : t('Duplicate'), icon: 'copyPlus', run: () => { studio.closeFloating(); studio.duplicate(id) } })
  actions.push({ id: 'save', title: full ? `${t('Save image')}   ⌥⌘E` : t('Save image'), icon: 'download', run: () => { studio.closeFloating(); studio.select(id); void import('../export/actions').then(m => m.exportEntryNow(studio, id)) } })
  if (e.kind === 'call') actions.push({ id: 'call', title: e.video ? t('Voice call') : t('Video call'), icon: e.video ? 'phone' : 'video', run: () => studio.toggleVideoCall(id) })
  if (e.kind === 'text' && isChat(r) && allows(r, 'image')) actions.push({ id: 'makeImage', title: t('Make image'), icon: 'image', run: () => { studio.closeFloating(); studio.convertToImage(id) } })
  if (has(r, 'likers') && !notice) {
    if (!e.isReply) {
      if (e.detail === undefined) actions.push({ id: 'location', title: t('Location'), icon: 'mapPin', run: () => { studio.closeFloating(); studio.addLocation(id) } })
      else actions.push({ id: 'location', title: t('Remove location'), icon: 'mapPinOff', run: () => studio.removeLocation(id) })
      if (e.gallery?.length || e.image) actions.push({ id: 'removePhotos', title: t('Remove photos'), icon: 'images', tint: 'destructive', run: () => studio.removePhotos(id) })
    } else if (e.kind === 'image' || e.kind === 'sticker') {
      actions.push({ id: 'replaceImage', title: t('Replace image'), icon: 'image', run: () => { studio.closeFloating(); void studio.requestImage({ kind: 'entry', id }) } })
      actions.push({ id: 'removeImage', title: t('Remove image'), icon: 'images', tint: 'destructive', run: () => studio.removeCommentImage(id) })
    } else {
      actions.push({ id: 'addImage', title: t('Add image'), icon: 'imagePlus', run: () => { studio.closeFloating(); void studio.requestImage({ kind: 'entry', id }) } })
    }
  }
  if (isAssistant(r)) {
    if (isReplyByAI(p, e) && e.kind === 'text') {
      if (!e.sources?.length) actions.push({ id: 'sources', title: t('Sources'), icon: 'link', run: () => { studio.closeFloating(); studio.addSources(id) } })
      else actions.push({ id: 'sources', title: t('Remove sources'), icon: 'link', tint: 'destructive', run: () => studio.removeSources(id) })
    }
    actions.push({ id: 'version', title: t('Versions'), icon: 'arrowLeftRight', run: () => { if (!e.version) studio.closeFloating(); studio.toggleVersion(id) } })
  }
  if (full) actions.push({ id: 'insert', title: t('Insert Below'), icon: 'plus', tint: 'var(--blue)', run: () => setAdding(true) })
  const del = full ? quick.find(a => a.id === 'delete') : undefined

  if (adding) {
    return (
      <Float anchor={anchor} className="more frost" style={{ width: 288, borderRadius: 14 }}>
        <div className="more-back">
          <MoreButton title={t('Back')} icon="chevronLeft" onClick={() => setAdding(false)} />
          <span className="grow" />
          <Lu name="plus" size={13} strokeWidth={2.6} style={{ color: 'var(--blue)', marginRight: 10 }} />
        </div>
        <div className="add-grid">
          {insertTiles(studio, p, id).map(tile => <Cell key={tile.id} icon={tile.icon} title={tile.title} size={46} glyph={18} onClick={tile.run} />)}
        </div>
      </Float>
    )
  }

  return (
    <Float anchor={anchor} className="more frost" style={{ width: 288, borderRadius: 14 }}>
      {showWho && (
        <AvatarRow people={castOf(p)} selected={e.personID} square={sq} pick={x => studio.setAuthor(id, x)}
          add={() => { studio.closeFloating(); studio.addPersonFor(id) }} ai={isAssistant(r) ? p.selfID : undefined} />
      )}
      {e.kind === 'pat' && <AvatarRow people={p.people} selected={e.target} square={sq} glyph="hand" title={t(KIND_NAME.pat)} pick={x => studio.setTarget(id, x)} />}
      {e.kind === 'card' && <AvatarRow people={p.people} selected={e.target} square={sq} glyph="contact" title={t(KIND_NAME.card)} pick={x => studio.setTarget(id, x)} />}
      {replyTargets && (
        <AvatarRow people={castOf(p).filter(x => x.id !== e.personID)} selected={e.target} square={sq} glyph="reply" title={t('Reply')}
          lead={{ icon: 'messageText', on: e.target === undefined, run: () => studio.setTarget(id, undefined) }} pick={x => studio.setTarget(id, x)} />
      )}
      {hasMarks && (
        <div className={cx('marks', emojis.length > 0 && marks.length > 0 && 'both')}>
          {emojis.length > 0 && (
            <div className="emojis">
              {emojis.map(em => (
                <button key={em} className={cx('emoji', reacted(em) && 'on')} onClick={ev => { ev.stopPropagation(); react(em) }} aria-pressed={reacted(em)}>{em}</button>
              ))}
            </div>
          )}
          <div className="mark-list">
            {marks.map(m => (
              <button key={m.id} className={cx('mark', m.on && 'on', !m.icon && 'text')} title={m.title} aria-label={m.title} aria-pressed={m.on}
                style={{ color: m.on ? m.tint : undefined, '--tint': m.tint ?? 'var(--ink)' } as CSSProperties}
                onClick={ev => { ev.stopPropagation(); m.run() }}>
                {m.icon ? <Lu name={m.icon} size={15} style={m.on ? { fill: 'currentColor', fillOpacity: 0.18 } : undefined} /> : m.title}
              </button>
            ))}
          </div>
        </div>
      )}
      {(showWho || hasTargets || hasMarks) && <HairLine inset={2} gap={4} />}
      <div className="more-actions">
        {actions.map(a => <MoreButton key={a.id} title={a.title} icon={a.icon} tint={a.tint === 'destructive' ? undefined : a.tint} destructive={a.tint === 'destructive'} onClick={a.run} />)}
        <span className="grow" />
        {del && <MoreButton title={del.title} icon={del.icon} destructive onClick={del.run} />}
      </div>
    </Float>
  )
}

/** One icon in the "more" panel: no background; a faint one on hover; delete-like ones turn red on hover. */
function MoreButton({ title, icon, tint, destructive, onClick }: { title: string; icon: LuName; tint?: string; destructive?: boolean; onClick: () => void }) {
  return (
    <button className={cx('more-button', destructive && 'destructive')} title={title} aria-label={title} style={{ color: tint }}
      onClick={ev => { ev.stopPropagation(); onClick() }}>
      <Lu name={icon} size={16} />
    </button>
  )
}

/** A row of faces: who sent it, who was nudged, whose contact card, who it replies to. */
function AvatarRow({ people, selected, square: sq, glyph, title, lead, add, ai, pick }: {
  people: Person[]; selected?: string; square: boolean; glyph?: LuName; title?: string
  lead?: { icon: LuName; on: boolean; run: () => void }; add?: () => void; ai?: string; pick: (id: string) => void
}) {
  return (
    <div className="avatar-row">
      {glyph && <span className="avatar-row-glyph" title={title} aria-label={title}><Lu name={glyph} size={13} /></span>}
      <div className="avatar-row-scroll">
        {lead && (
          <button className="avatar-cell" onClick={ev => { ev.stopPropagation(); lead.run() }}>
            <span className="lead-glyph"><Lu name={lead.icon} size={12} strokeWidth={2} />{lead.on && <i className="ink-ring" style={{ borderRadius: 16.5 }} />}</span>
          </button>
        )}
        {people.map(x => (
          <button key={x.id} className="avatar-cell" title={x.name} aria-label={x.name} aria-pressed={x.id === selected} onClick={ev => { ev.stopPropagation(); pick(x.id) }}>
            {ai !== undefined && x.id !== ai ? <AssistantMark size={26} ring={x.id === selected} /> : <Face person={x} size={26} square={sq} ring={x.id === selected} />}
          </button>
        ))}
        {add && (
          <button className="avatar-cell gray" title={t('New person')} aria-label={t('New person')} onClick={ev => { ev.stopPropagation(); add() }}>
            <Lu name="plus" size={13} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}

// MARK: who sent it (touch)

function SenderPanel({ studio, id, anchor }: { studio: Studio; id: string; anchor?: Anchor }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const current = p.entries.find(x => x.id === id)?.personID
  const cast = castOf(p)
  return (
    <Float anchor={anchor} className="frost" style={{ width: 224, padding: '6px 0' }}>
      <div style={cast.length > 7 ? { maxHeight: 320, overflowY: 'auto' } : undefined}>
        {cast.map(x => (
          <button key={x.id} className="prow" style={{ minHeight: 40 }} onClick={ev => { ev.stopPropagation(); studio.setAuthor(id, x.id); studio.closeFloating() }}>
            {isAssistant(projectRules(p)) && x.id !== p.selfID ? <AssistantMark size={26} /> : <Face person={x} size={26} square={square(p)} />}
            <span className="prow-title">{x.name}</span>
            {x.id === p.selfID && hasSelf(projectRules(p)) && <Lu name="user" size={12} style={{ color: 'var(--fog)' }} />}
            <span className="prow-space" />
            {x.id === current && <Lu name="check" size={12} strokeWidth={2.6} />}
          </button>
        ))}
      </div>
      <HairLine gap={3} />
      <PanelRow title={t('New person')} icon="userPlus" onClick={() => { studio.closeFloating(); studio.addPersonFor(id) }} />
    </Float>
  )
}

// MARK: add one here

interface Tile { id: string; title: string; icon: LuName; run: () => void }

/** The "+" between two entries and "Insert Below" in the right-click panel share these. */
function insertTiles(studio: Studio, p: Project, after?: string): Tile[] {
  const r = projectRules(p)
  const list: Tile[] = []
  if (isChat(r)) {
    for (const kind of insertable(r)) list.push({ id: kind, title: t(KIND_NAME[kind]), icon: KIND_ICON[kind], run: () => void studio.insert(after, kind) })
  } else if (has(r, 'likers')) {
    list.push({ id: 'post', title: t('Post'), icon: 'squarePen', run: () => { studio.closeFloating(); studio.newMomentsPost() } })
    if (after) list.push({ id: 'comment', title: t('Comment'), icon: 'messageText', run: () => { studio.closeFloating(); studio.startComment(postOf(p, after) ?? after) } })
    list.push({ id: 'photo', title: t('Photo post'), icon: 'image', run: () => { studio.closeFloating(); void studio.requestImage({ kind: 'newEntry' }) } })
  } else {
    list.push({ id: 'comment', title: t('Comment'), icon: 'messageText', run: () => void studio.insert(after, 'text') })
    if (has(r, 'thread') && after) list.push({ id: 'reply', title: t('Reply'), icon: 'cornerDownRight', run: () => void studio.insert(after, 'text', true) })
    if (allows(r, 'image')) list.push({ id: 'image', title: t('Photo comment'), icon: 'image', run: () => void studio.insert(after, 'image') })
    if (allows(r, 'voice')) list.push({ id: 'voice', title: t('Voice comment'), icon: 'audioLines', run: () => void studio.insert(after, 'voice') })
  }
  list.push({ id: 'paste', title: t('Paste chat'), icon: 'clipboardPaste', run: () => { studio.closeFloating(); studio.openFloating({ kind: 'paste' }, { x: 0, y: 0, w: 0, h: 0 }) } })
  return list
}

function InsertPanel({ studio, after, anchor }: { studio: Studio; after?: string; anchor?: Anchor }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const tiles = insertTiles(studio, p, after)
  const count = Math.min(4, Math.max(1, tiles.length))
  return (
    <Float anchor={anchor} className="frost" style={{ padding: 8, width: count * 44 - 4 + 16 }}>
      <div className="insert-grid" style={{ gridTemplateColumns: `repeat(${count}, 40px)` }}>
        {tiles.map(tile => <Cell key={tile.id} icon={tile.icon} title={tile.title} onClick={tile.run} />)}
      </div>
    </Float>
  )
}

// MARK: the avatar card

function AvatarCard({ studio, personID, anchor }: { studio: Studio; personID: string; anchor?: Anchor }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const personas = useLibrary()
  const person = p.people.find(x => x.id === personID)
  const [name, setName] = useState(person?.name ?? '')
  const naming = useRef(false)
  useEffect(() => { if (!naming.current && person) setName(person.name) }, [person?.name])
  if (!person) return null
  const r = projectRules(p)
  const sq = square(p)
  const isMe = hasSelf(r) && p.selfID === person.id
  const commit = () => {
    naming.current = false
    const v = name.trim()
    if (!v) { setName(person.name); return }
    if (v !== person.name) studio.renamePerson(person.id, v)
  }
  const critter = !person.avatar
  return (
    <Float anchor={anchor} className="frost card" style={{ width: 262 }}>
      <div className="card-head">
        <Face person={person} size={36} square={sq} />
        <input className="card-name" value={name} placeholder={t('Name')} spellCheck={false}
          onFocus={() => { naming.current = true }}
          onChange={ev => setName(ev.currentTarget.value)}
          onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') { setName(person.name); ev.currentTarget.blur() } }}
          onBlur={commit} />
        {hasSelf(r) && (
          <GlyphButton icon={isMe ? 'userCheck' : 'circleUser'} title={t('Set as me')} size={34} glyph={18} tint={isMe ? 'var(--ink)' : 'var(--charcoal)'}
            onClick={() => { if (!isMe) studio.makeSelf(person.id) }} />
        )}
        <GlyphButton icon="inbox" title={t('Save to library')} size={34} glyph={18} tint="var(--charcoal)" onClick={() => studio.savePerson(person.id)} />
      </div>
      <div className="card-library">
        <span className="card-glyph"><Lu name="library" size={15} /></span>
        <div className="card-library-scroll">
          {personas.map(x => (
            <button key={x.id} className="card-persona" title={x.name} onClick={ev => { ev.stopPropagation(); studio.fillPerson(person.id, x.id) }}>
              <Face person={x} size={36} square={sq} />
              <span>{x.name}</span>
            </button>
          ))}
          <button className="card-persona" title={t('Import photos')} onClick={async ev => { ev.stopPropagation(); studio.closeFloating(); await addPersonas(studio) }}>
            <span className={cx('dashed-add', sq && 'square')}><Lu name="plus" size={14} /></span>
          </button>
        </div>
      </div>
      <PanelRow title={t('Choose photo')} icon="image" trailing="…" onClick={() => void studio.requestImage({ kind: 'avatar', person: person.id })} />
      {has(r, 'roles') && (
        <div className="role-dots" aria-label={t('Role color')}>
          <span className="card-glyph"><Lu name="palette" size={15} /></span>
          {[undefined, ...ROLES.map((_, i) => i)].map(option => (
            <button key={String(option)} className={cx('role-dot', person.roleColor === option && 'on')}
              style={{ background: option === undefined ? (p.dark ? '#F2F3F5' : '#060607') : ROLES[option] }}
              onClick={ev => { ev.stopPropagation(); studio.setRoleColor(person.id, option) }} />
          ))}
        </div>
      )}
      <HairLine gap={2} />
      <div className="card-foot">
        <GlyphButton icon="paw" title={critter ? t('Another animal') : t('Default avatar')} size={38} glyph={18} tint="var(--charcoal)"
          onClick={() => (critter ? studio.nextCritter(person.id) : studio.setAvatar(person.id, undefined))} />
        {has(r, 'verified') && <GlyphButton icon="badgeCheck" title={t('Verified')} size={38} glyph={18} tint={person.verified ? 'var(--ink)' : 'var(--charcoal)'}
          style={person.verified ? { background: 'rgba(11,11,12,0.08)', borderRadius: 10 } : undefined} onClick={() => studio.toggleVerified(person.id)} />}
        {has(r, 'author') && <GlyphButton icon="crown" title={t('Creator')} size={38} glyph={18} tint={p.authorID === person.id ? 'var(--ink)' : 'var(--charcoal)'}
          style={p.authorID === person.id ? { background: 'rgba(11,11,12,0.08)', borderRadius: 10 } : undefined} onClick={() => studio.toggleCreator(person.id)} />}
        {has(r, 'roles') && <GlyphButton icon="cpu" title={t('Bot')} size={38} glyph={18} tint={person.isBot ? 'var(--ink)' : 'var(--charcoal)'}
          style={person.isBot ? { background: 'rgba(11,11,12,0.08)', borderRadius: 10 } : undefined} onClick={() => studio.toggleBot(person.id)} />}
        <span className="grow" />
        {p.people.length > 1 && <GlyphButton icon="userX" title={t('Remove person')} size={38} glyph={18} tint="var(--red)" onClick={() => { studio.closeFloating(); studio.deletePerson(person.id) }} />}
      </div>
    </Float>
  )
}

// MARK: the page (right-click the paper; "…" on the page toolbar)

function CanvasPanel({ studio, anchor }: { studio: Studio; anchor?: Anchor }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const [sound, setSound] = useState(soundEnabled())
  const r = projectRules(p)
  const layout = layoutOf(p)
  const page = layout === 'page'
  const full = desktop
  const moments = p.template === 'wechatMoments'
  const note = p.template === 'xiaohongshu'
  const toggle = (icon: LuName, title: string, on: boolean, run: () => void) => <Cell key={title} icon={icon} title={title} on={on} onClick={run} />
  const sceneRow = useRef<HTMLButtonElement>(null)
  return (
    <Float anchor={anchor} className="frost" style={{ width: 256, padding: '4px 0' }}>
      <button ref={sceneRow} className="prow scene-row" style={{ minHeight: 40 }} title={t('Scene')}
        onClick={ev => { ev.stopPropagation(); studio.openFloating({ kind: 'scene' }, sceneRow.current!.getBoundingClientRect()) }}>
        <span className="prow-icon"><Lu name={TEMPLATE_GLYPH[p.template]} size={15} /></span>
        <span className="prow-title serif-17">{t(DISPLAY_NAME[p.template])}</span>
        <span className="prow-space" />
        <Lu name="chevronRight" size={11} strokeWidth={2.6} style={{ color: 'var(--gray)' }} />
      </button>
      <HairLine gap={4} />
      <div className="toggles">
        {full && toggle('moon', t('Dark'), p.dark, () => studio.togglePage('dark'))}
        {full && page && has(r, 'wallpaper') && toggle('wallpaper', t('Wallpaper'), !!p.wallpaper, () => { studio.closeFloating(); void studio.requestImage({ kind: 'wallpaper' }) })}
        {full && page && toggle('keyboard', t('Keyboard'), !!p.keyboard, () => studio.toggleKeyboard())}
        {page && toggle('statusBar', t('Status bar'), p.showStatusBar, () => studio.togglePage('showStatusBar'))}
        {page && toggle('textCursor', t('Composer'), p.showComposer, () => studio.togglePage('showComposer'))}
        {allows(r, 'time') && toggle('clock', t('12-hour clock'), usesTwelveHour(p), () => studio.toggleTwelveHour())}
        {toggle(sound ? 'volume2' : 'volumeX', t('Sound'), sound, () => { setSoundEnabled(!sound); setSound(!sound); if (!sound) studio.sound('toggle') })}
      </div>
      <PillPicker icon="globe" value={p.language} onPick={v => studio.setLanguage(v)}
        options={[{ value: 'chinese', title: '中文' }, { value: 'english', title: 'EN' }]} />
      {arrangements(r).length > 1 && (
        <PillPicker icon={ARRANGEMENT[layout].icon} value={layout} onPick={v => studio.setArrangement(v)}
          options={arrangements(r).map(a => ({ value: a, title: t(ARRANGEMENT[a].title) }))} />
      )}
      {moments && page && (
        <PillPicker icon="squareUser" value={!!p.momentsProfile} onPick={v => studio.setMomentsProfile(v)}
          options={[{ value: false, title: t('Moments') }, { value: true, title: t('Profile') }]} />
      )}
      {has(r, 'lead') && (page || (note && layout === 'cards')) && (
        <PanelRow title={moments ? t('Cover') : t('Note')} icon={moments ? 'frame' : 'fileText'} on={p.hideLead !== true} onClick={() => studio.toggleHideLead()} />
      )}
      {moments && page && !p.momentsProfile && p.hideLead !== true && (
        <PanelRow title={t('New messages')} icon="bellDot" on={!!p.momentsAlert} onClick={() => studio.toggleMomentsAlert()} />
      )}
      {note
        ? <>
          <PanelRow title={t('Add picture')} icon="imagePlus" onClick={() => { studio.closeFloating(); void studio.requestImage({ kind: 'notePicture' }) }} />
          {notePictures(p).length > 0 && <PanelRow title={notePictures(p).length > 1 ? t('Remove this picture') : t('Remove picture')} icon="imageOff" onClick={() => studio.removeNotePicture()} />}
        </>
        : p.cover && <PanelRow title={t('Remove picture')} icon="imageOff" onClick={() => studio.setCover(undefined)} />}
      {has(r, 'sms') && <PanelRow title={t('Text message (green)')} icon="messageCircle" on={!!p.sms} onClick={() => studio.toggleSMS()} />}
      {page && p.showComposer && <PanelRow title={t('Keep typed text')} icon="textInput" onClick={() => studio.pinComposerText(studio.s.draft)} />}
      {page && p.showComposer && p.composerText !== undefined && <PanelRow title={t('Clear typed text')} icon="removeFormatting" onClick={() => studio.clearComposerText()} />}
      {page && p.wallpaper && <PanelRow title={t('Remove wallpaper')} icon="imageOff" onClick={() => studio.setWallpaper(undefined)} />}
      <HairLine gap={4} />
      <PanelRow title={t('Example')} icon="sparkles" onClick={() => { studio.closeFloating(); studio.loadSample() }} />
      {p.entries.length > 0 && <PanelRow title={t('Clear all')} icon="trash" tint="var(--red)" onClick={() => { studio.closeFloating(); studio.clearAll() }} />}
    </Float>
  )
}

// MARK: scenes

function ScenePanel({ studio, anchor }: { studio: Studio; anchor?: Anchor }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const r = projectRules(p)
  const layout = layoutOf(p)
  const family = familyOf(p.template)
  const order = useMemo(() => [...TEMPLATES.filter(x => familyOf(x) === family), ...TEMPLATES.filter(x => familyOf(x) !== family)], [family])
  const cards = useMemo(() => order.map(template => {
    const current = template === p.template
    const allowed = current || canSwitch(p, template)
    const preview = structuredClone(p)
    if (!current) switchTemplate(preview, template)
    const hidden = current ? 0 : hiddenCount(preview)
    preview.entries = visibleEntries(preview)
    return { template, current, allowed, preview, hidden }
  }), [p, order])
  return (
    <Float anchor={anchor} className="frost scene-panel" style={{ width: 96 * 3 + 20 + 28 }}>
      <div className="scene-grid">
        {cards.map(({ template, current, allowed, preview, hidden }) => (
          <button key={template} className={cx('scene-card', current && 'current')} disabled={!allowed}
            title={allowed ? t(DISPLAY_NAME[template]) : t('A direct chat can only have you and one other person')}
            onClick={ev => { ev.stopPropagation(); studio.switchScene(template); studio.closeFloating() }}>
            <span className="scene-thumb">
              <span className="scene-thumb-screen"><Phone p={preview} mode="screen" playback={stillPlayback(preview)} /></span>
              {!allowed
                ? <span className="scene-badge"><Lu name="userX" size={9} strokeWidth={3} /></span>
                : hidden > 0 ? <span className="scene-badge"><Lu name="eyeOff" size={9} strokeWidth={3} />{hidden}</span> : null}
            </span>
            <span className="scene-name"><Lu name={TEMPLATE_GLYPH[template]} size={12} strokeWidth={2} /><span>{t(DISPLAY_NAME[template])}</span></span>
          </button>
        ))}
      </div>
      {arrangements(r).length > 1 && (
        <>
          <HairLine />
          <div style={{ padding: '6px 0' }}>
            <PillPicker icon={ARRANGEMENT[layout].icon} value={layout} onPick={v => studio.setArrangement(v)}
              options={arrangements(r).map(a => ({ value: a, title: t(ARRANGEMENT[a].title) }))} />
          </div>
        </>
      )}
    </Float>
  )
}

// MARK: export

type ExportKind = 'phone' | 'scene' | 'video' | 'cards'

function ExportPanel({ studio, anchor }: { studio: Studio; anchor?: Anchor }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const layout = layoutOf(p)
  const empty = !visibleEntries(p).length
  const [screens, setScreens] = useState(1)
  useEffect(() => {
    if (layout !== 'page') return
    let alive = true
    void import('../export/images').then(m => m.screenCount(studio.project)).then(n => { if (alive) setScreens(n) })
    return () => { alive = false }
  }, [layout])
  const last = (() => { try { return localStorage.getItem('mimic.lastExport') ?? 'phone' } catch { return 'phone' } })()
  const run = (kind: ExportKind) => {
    try { localStorage.setItem('mimic.lastExport', kind) } catch { /* ignore */ }
    studio.closeFloating()
    if (kind === 'video') { studio.play(0); return }
    void import('../export/actions').then(m => {
      if (kind === 'phone') return m.exportScreenshotNow(studio)
      if (kind === 'scene') return m.exportLongNow(studio)
      return layout === 'stickers' ? m.exportStickersNow(studio) : m.exportCardsNow(studio)
    })
  }
  const tile = (kind: ExportKind, title: string, disabled: boolean, preview: ReactNode) => (
    <button key={kind} className={cx('export-tile', last === kind && 'last')} disabled={disabled} onClick={ev => { ev.stopPropagation(); run(kind) }}>
      <span className="export-preview">{preview}</span>
      <span className="export-title">{title}</span>
      <i className="export-mark" />
    </button>
  )
  const single = layout !== 'page'
  return (
    <Float anchor={anchor} className="frost" style={{ width: single ? 104 : 238, padding: '10px 8px 8px' }}>
      <div className="export-row">
        {layout === 'page' && <>
          {tile('phone', screens > 1 ? t('Screens') : t('Screen'), false, <ScreenGlyph stacked={screens > 1} />)}
          {tile('scene', t('Long'), false, <LongGlyph />)}
          {tile('video', t('Video'), empty, <span className="glyph-video silver"><Lu name="play" size={13} style={{ fill: 'currentColor' }} /></span>)}
        </>}
        {layout === 'cards' && tile('cards', t('Cards'), empty, <CardsGlyph />)}
        {layout === 'stickers' && tile('cards', t('Stickers'), empty, <CardsGlyph />)}
      </div>
    </Float>
  )
}

const ScreenGlyph = ({ stacked }: { stacked: boolean }) => (
  <span className="glyph-screen-wrap">
    {stacked && <span className="glyph-screen back" />}
    <span className="glyph-screen"><i className="b1" /><i className="b2" /><i className="b3" /></span>
  </span>
)

const LongGlyph = () => (
  <span className="glyph-long">
    {[[12, 0], [10, 1], [14, 0], [9, 0], [12, 1], [11, 0], [13, 0]].map(([w, me], i) => <i key={i} className={me ? 'me' : ''} style={{ width: w }} />)}
  </span>
)

const CardsGlyph = () => <span className="glyph-cards"><i /><i /></span>

// MARK: Moments "··"

/** WeChat's dark "Like | Comment", growing out to the left of the dots. */
function MomentsPanel({ studio, id, anchor }: { studio: Studio; id: string; anchor?: Anchor }) {
  const p = useStudio(sel(s => s.project), studio.project)
  const liked = studio.likesNow(id)
  const zh = p.language === 'chinese'
  return (
    <Float anchor={anchor} className="moments-pill" left>
      <button onClick={() => studio.toggleLike(id)}><Lu name={liked ? 'heart' : 'heart'} size={16} style={liked ? { opacity: 0.6 } : undefined} />{liked ? (zh ? '取消' : 'Unlike') : (zh ? '赞' : 'Like')}</button>
      <i />
      <button onClick={() => studio.startComment(id)}><Lu name="messageCircle" size={16} />{zh ? '评论' : 'Comment'}</button>
    </Float>
  )
}

// MARK: paste a whole conversation

const SAMPLES = {
  zhChat: '[21:42]\n小满：群里那份「真的最终版」能交了吗\n阿椰：能，我刚修了最后一个错别字\n我：文件名怎么变成「真的最中版」了\n小满：[语音 4 未读]\n我：[拍一拍 小满]',
  zhComments: '[2 小时前]\n半格电：这把折叠椅怎么收起来比展开还大\n> 像素没对齐：收纳之前先腾一个房间\n> 缓冲中：回复 @像素没对齐：我买它就是因为没有房间\n[刚刚]\n梨先不削：折的时候会夹手吗？看到一半我开始捏拳了',
  enChat: '[21:42]\nSol: anyone know whose water bottle this is\nKit: what\'s on it\nMe: a sticker that says “if found, no it wasn\'t”\nSol: [voice 4]\nMe: [nudge Sol]',
  enComments: '[2h ago]\nreceipt.jpg: does the tiny lamp actually light up the room\n> gloss.archive: it lights up a very confident corner\n> roomtemp.exe: @gloss.archive perfect my room is one corner\n[now]\ntabhoarder: did the bulb come with it?',
}

export function ImportSheet() {
  const studio = useStudioRef()!
  const p = useStudio(sel(s => s.project), studio.project)
  const chat = isChat(projectRules(p))
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(false)
  const [error, setError] = useState<string>()
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const id = window.setTimeout(() => area.current?.focus(), 220); return () => window.clearTimeout(id) }, [])
  const close = () => studio.closeFloating()
  const zh = locale === 'zh'
  const sample = zh ? (chat ? SAMPLES.zhChat : SAMPLES.zhComments) : (chat ? SAMPLES.enChat : SAMPLES.enComments)
  const paste = () => {
    if (!text.trim()) return
    try {
      studio.importScript(text, replace)
      close()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  return (
    <div className="sheet-back" onClick={close}>
      <div className="sheet" onClick={ev => ev.stopPropagation()} onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Escape') close() }}>
        <div className="sheet-head">
          <span className="sheet-title">{chat ? t('Paste chat') : t('Paste comments')}</span>
          <span className="grow" />
          <GlyphButton icon="x" title={t('Close')} size={32} glyph={14} tint="var(--gray)" onClick={close} />
        </div>
        <p className="sheet-help">
          {chat
            ? t('One message per line: Name: text. “Me” goes on the right. [21:42] on its own line is a time; a line starting with == is a gray notice. [voice 5], [photo], [unsend] and [nudge Sol] become those messages.')
            : t('One comment per line: Name: text. Start a line with > for a reply. [2h ago] on its own line is the time of the comments below it.')}
        </p>
        <textarea ref={area} value={text} placeholder={sample} aria-label={t('Chat to paste')} spellCheck={false}
          onChange={ev => { setText(ev.target.value); setError(undefined) }}
          onKeyDown={ev => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); paste() } }} />
        {error && <p className="sheet-error">{error}</p>}
        <div className="sheet-foot">
          <div style={{ maxWidth: 220, flex: 1 }}>
            <PillPicker bare value={replace} onPick={setReplace} options={[{ value: false, title: t('Append') }, { value: true, title: t('Replace all') }]} />
          </div>
          <span className="grow" />
          <button className="capsule primary" disabled={!text.trim()} onClick={paste}>{t('Paste')}</button>
        </div>
      </div>
    </div>
  )
}
