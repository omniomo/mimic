// The editor: one project, the selection, inline editing, undo/redo and every action the UI can take.
// The project is immutable: `mutate` clones it, applies a change and keeps the previous version for undo.

import { createContext, useContext } from 'react'
import { Store, useStore } from './store'
import { library } from './library'
import { MAX_PIXELS, importImage } from './assets'
import { play as playSound, type Cue } from '../sound/board'
import { t } from '../i18n'
import {
  addPerson, applyTitle, assistantPartner, assistantSpeaker, assistantTurns, blankProject, callLabel, critterIndex,
  deletePerson as removePerson, effectiveReceipt, freshCritter, importScript, readReplyTarget, readTokens, receiptSteps,
  rename, starter, summary, switchTemplate, zhen, ScriptError,
  NOTE_PICTURE_LIMIT, notePictureIndex, notePictures, setNotePictures,
} from '../model/project'

const platformOf = (p: Project) => templatePlatform(p.template)
const switchTemplateGuard = switchTemplate
import { exampleProject } from '../model/examples'
import {
  allows, canSwitch, castOf, freshSender, has, hasSelf, isAssistant, isChat, isNoticeKind, oneOnOne, projectRules,
  reorderVisible, visibleEntries,
} from '../model/rules'
import { DISPLAY_NAME, counterpart, platformOf as templatePlatform, rememberAssistant } from '../model/templates'
import { readTime, timeEntryDate, formatTime, screenshotDay, usesTwelveHour } from '../model/time'
import type { Arrangement, Entry, Feedback, Kind, Lang, Project, Template } from '../model/types'
import { ITEM_LIMIT, REPLY_LIMIT, TEXT_LIMIT, makeEntry, makePerson, uid } from '../model/types'

/** Mouse (Mac-like) or touch (iPad-like): decides a few interactions. */
const finePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches

export type Floating =
  | { kind: 'more'; id: string; insert?: boolean }
  | { kind: 'insert'; after?: string }
  | { kind: 'avatar'; person: string }
  | { kind: 'page' }
  | { kind: 'scene' }
  | { kind: 'export' }
  | { kind: 'paste' }
  /** Moments: the dark "Like / Comment" pill next to a post's "··". */
  | { kind: 'moments'; id: string }
  /** Touch: the face on an entry's toolbar — who sent it. */
  | { kind: 'sender'; id: string }

export interface Anchor { x: number; y: number; w: number; h: number }

export interface Playing {
  /** performance.now() when the timeline's t=0 was. */
  origin: number
  /** Where playback started (seconds). */
  from: number
  /** Type my own messages into the composer. */
  typing: boolean
  paused?: number
}

export interface StudioState {
  projectId: string
  project: Project
  selection?: string
  editing?: string
  /** undefined = the scene's default sender (chat: me; comments: someone new). */
  sender?: string
  pageSelected: boolean
  floating?: Floating
  anchor?: Anchor
  showLibrary: boolean
  notice?: string
  shakes: Record<string, number>
  battery?: number
  playing?: Playing
  exporting?: { label: string; done: number; total: number }
  undoCount: number
  redoCount: number
  /** What's typed in the phone's composer. */
  draft: string
  /** Bumped to ask the composer to focus. */
  focusTick: number
  scrollTo?: { id: string; bottom: boolean; tick: number }
  /** Moments: dragging the likes heart sideways shows this many likers before it's committed. */
  likePreview?: { id: string; count: number }
  /** Touch: where the empty page was tapped (its toolbar grows from there). */
  pageTap?: { x: number; y: number }
}

/** Set by the export progress's cancel button; checked by the running export. */
export const cancelExport = { current: false }

export type ImageRequest =
  | { kind: 'entry'; id: string }
  | { kind: 'newEntry'; after?: string; sticker?: boolean }
  | { kind: 'avatar'; person: string }
  | { kind: 'persona'; id: string }
  | { kind: 'viewer' }
  | { kind: 'wallpaper' }
  | { kind: 'cover' }
  | { kind: 'photo'; id: string; index?: number }
  | { kind: 'notePicture'; index?: number }
  | { kind: 'commentPicture'; id: string }

function maxPixelsFor(r: ImageRequest) {
  switch (r.kind) {
    case 'newEntry': return r.sticker ? MAX_PIXELS.sticker : MAX_PIXELS.photo
    case 'entry': case 'photo': case 'commentPicture': return MAX_PIXELS.photo
    case 'wallpaper': case 'cover': case 'notePicture': return MAX_PIXELS.wallpaper
    default: return MAX_PIXELS.avatar
  }
}

const NUMERIC = new Set(['seconds', 'likes', 'level', 'badge', 'replies', 'commentCount', 'reaction', 'momentsAlert', 'thinkingSeconds'])
export const isNumericKey = (key: string) => NUMERIC.has(key.split(':')[0])
export const keyEntryID = (key?: string) => {
  if (!key) return undefined
  const [kind, id] = key.split(':')
  return ['castName', 'personaName'].includes(kind) ? undefined : id
}

export function pickFile(accept = 'image/*', multiple = false): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.display = 'none'
    input.onchange = () => { resolve(Array.from(input.files ?? [])); input.remove() }
    input.oncancel = () => { resolve([]); input.remove() }
    document.body.appendChild(input)
    input.click()
  })
}

export class Studio {
  readonly store: Store<StudioState>
  private undoStack: Project[] = []
  private redoStack: Project[] = []
  private noticeTimer?: number
  /** Moments: after a comment is committed with Return, open the next one below it. */
  private chainComment?: string

  constructor(projectId: string, project: Project, private onChange: (p: Project) => void) {
    this.store = new Store<StudioState>({
      projectId, project, pageSelected: false, showLibrary: false, shakes: {}, undoCount: 0, redoCount: 0, focusTick: 0, draft: '',
    })
  }

  get s() { return this.store.get() }
  get project() { return this.s.project }
  private set = (patch: Partial<StudioState>) => this.store.set(patch)
  sound = (cue: Cue) => playSound(cue)

  // MARK: changes

  mutate(change: (p: Project) => void) {
    const before = this.project
    const next = structuredClone(before)
    change(next)
    if (JSON.stringify(next) === JSON.stringify(before)) return
    this.undoStack.push(before)
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    this.set({ project: next, undoCount: this.undoStack.length, redoCount: 0 })
    this.onChange(next)
  }

  /** Replace without an undo step (loading). */
  replace(p: Project) {
    this.set({ project: p })
    this.onChange(p)
  }

  undo() {
    const previous = this.undoStack.pop()
    if (!previous) return
    this.redoStack.push(this.project)
    this.settle(previous)
    this.sound('undo')
  }

  redo() {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.project)
    this.settle(next)
    this.sound('redo')
  }

  private settle(p: Project) {
    const selection = this.s.selection && p.entries.some(e => e.id === this.s.selection) ? this.s.selection : undefined
    this.set({ project: p, editing: undefined, floating: undefined, selection, undoCount: this.undoStack.length, redoCount: this.redoStack.length })
    this.onChange(p)
  }

  say(text: string) {
    window.clearTimeout(this.noticeTimer)
    this.set({ notice: text })
    this.noticeTimer = window.setTimeout(() => this.set({ notice: undefined }), 3200)
  }

  private atLimit(extra = 1) {
    if (this.project.entries.length + extra <= ITEM_LIMIT) return false
    this.say(t('A project can have up to {0} items.', ITEM_LIMIT))
    return true
  }

  // MARK: floating panels

  openFloating(panel: Floating, anchor: Anchor | DOMRect) {
    const a = 'width' in anchor ? { x: anchor.x, y: anchor.y, w: anchor.width, h: anchor.height } : anchor
    this.set({ floating: panel, anchor: a })
  }

  closeFloating() { this.set({ floating: undefined }) }

  // MARK: selection

  select(id: string) {
    if (this.s.editing && keyEntryID(this.s.editing) !== id) this.endEditing()
    if (this.s.selection !== id) this.sound('select')
    this.set({ selection: id, pageSelected: false, floating: undefined })
  }

  clearSelection() {
    this.endEditing()
    this.set({ selection: undefined, pageSelected: false, floating: undefined })
  }

  /** Tapping empty space drops whatever is selected or open. With touch, tapping it again selects the whole page
   *  (its toolbar grows from where it was tapped); with a mouse the page's settings are on right-click. */
  /** A tap on the paper or the phone's empty wall. Mouse: only clears. Touch: clears; on a clean page, selects the
   *  page (four corners, a toolbar where the finger was). */
  tapWall(at?: { x: number; y: number }) {
    const s = this.s
    if (finePointer || s.pageSelected || s.selection || s.floating || s.editing) { this.clearSelection(); return }
    this.set({ pageSelected: true, pageTap: at })
    this.sound('select')
  }

  moveSelection(step: number) {
    const ids = visibleEntries(this.project).map(e => e.id)
    if (!ids.length) return
    const current = this.s.selection ? ids.indexOf(this.s.selection) : -1
    const next = current < 0 ? (step > 0 ? 0 : ids.length - 1) : Math.min(Math.max(current + step, 0), ids.length - 1)
    this.set({ selection: ids[next], scrollTo: { id: ids[next], bottom: false, tick: Date.now() } })
    this.sound('select')
  }

  // MARK: inline editing

  /** Committed by whoever is editing when another edit starts or the canvas is clicked. */
  private pendingCommit?: () => void

  registerCommit(fn: (() => void) | undefined) { this.pendingCommit = fn }

  beginEdit(key: string) {
    if (this.s.playing || this.s.editing === key) return
    this.endEditing()
    const id = keyEntryID(key)
    this.set({ editing: key, selection: id ?? this.s.selection, pageSelected: false, floating: undefined })
    this.sound('edit')
  }

  /** Make whatever is being edited commit (clicked elsewhere). */
  endEditing() {
    const fn = this.pendingCommit
    this.pendingCommit = undefined
    fn?.()
  }

  editSelected() {
    const id = this.s.selection
    const e = id && this.project.entries.find(x => x.id === id)
    if (!e || this.s.editing) return
    if (e.kind === 'image' || e.kind === 'sticker') void this.requestImage({ kind: 'entry', id: e.id })
    else if (e.kind === 'voice') this.beginEdit(`seconds:${e.id}`)
    else if (!['recall', 'snap', 'screenshot'].includes(e.kind)) this.beginEdit(`text:${e.id}`)
  }

  cancelEdit(key: string) {
    if (this.s.editing !== key) return
    this.pendingCommit = undefined
    if (this.chainComment && key === `text:${this.chainComment}`) this.chainComment = undefined
    this.set({ editing: undefined })
    const [kind, id] = key.split(':')
    const e = kind === 'text' ? this.project.entries.find(x => x.id === id) : undefined
    if (e && ['text', 'system', 'notification'].includes(e.kind) && !e.text) {
      this.mutate(p => {
        p.entries = p.entries.filter(x => x.id !== id)
        this.dropOrphan(e.personID, p)
      })
      if (this.s.selection === id) this.set({ selection: undefined })
    }
  }

  commit(key: string, raw: string, bySubmit = false) {
    if (this.s.editing !== key) return
    this.pendingCommit = undefined
    this.set({ editing: undefined })
    const value = raw.trim()
    const [kind, id, extra] = key.split(':')
    let removed = false
    const entry = (p: Project) => p.entries.find(e => e.id === id)
    switch (kind) {
      case 'text':
        this.mutate(p => {
          const e = entry(p)
          if (!e) return
          if (['text', 'time', 'system', 'notification'].includes(e.kind)) {
            if (!value) {
              p.entries = p.entries.filter(x => x.id !== id)
              this.dropOrphan(e.personID, p)
              removed = true
            } else if (e.kind === 'time') readTime(p, value.slice(0, 60), e)
            else e.text = value.slice(0, isAssistant(projectRules(p)) ? REPLY_LIMIT : TEXT_LIMIT)
          } else if (['image', 'pat', 'link', 'file', 'location', 'card', 'call'].includes(e.kind)) {
            e.text = value.slice(0, TEXT_LIMIT)
          }
        })
        break
      case 'seconds': {
        const n = parseInt(value.replace(/\D/g, '').slice(0, 3), 10)
        this.mutate(p => { const e = entry(p); if (e && n > 0) e.seconds = Math.min(n, 60) })
        break
      }
      case 'quote': this.mutate(p => { const e = entry(p); if (e) e.quote = value }); break
      case 'metadata': this.mutate(p => { const e = entry(p); if (e) e.metadata = value.slice(0, 40) }); break
      case 'likes': this.mutate(p => { const e = entry(p); if (e) e.likes = value.slice(0, 12) }); break
      case 'name':
        this.mutate(p => { const e = entry(p); if (e && value) rename(p, e.personID, value) })
        break
      case 'level':
        this.mutate(p => {
          const e = entry(p)
          const person = e && p.people.find(x => x.id === e.personID)
          if (person) person.level = value.replace(/\D/g, '').slice(0, 2)
        })
        break
      case 'castName': this.mutate(p => { if (value) rename(p, id, value) }); break
      case 'personaName': if (value) library.update(id, x => ({ ...x, name: value.slice(0, 35) })); break
      case 'title': this.mutate(p => applyTitle(p, value)); break
      case 'statusTime': this.mutate(p => { p.statusTime = value ? value.slice(0, 12) : '9:41' }); break
      case 'badge': {
        const badge = value.replace(/[^\d+]/g, '').slice(0, 4)
        this.mutate(p => { p.backBadge = badge || undefined })
        break
      }
      case 'replies': this.mutate(p => { const e = entry(p); if (e) e.replies = value.slice(0, 12) || undefined }); break
      case 'commentCount': this.mutate(p => { p.commentCount = value.slice(0, 12) || undefined }); break
      case 'status': this.mutate(p => { p.status = value.slice(0, 60) }); break
      case 'detail': this.mutate(p => { const e = entry(p); if (e) e.detail = value ? value.slice(0, 300) : undefined }); break
      case 'source': this.mutate(p => { const e = entry(p); if (e) e.source = value ? value.slice(0, 60) : undefined }); break
      case 'noteTitle': this.mutate(p => { p.noteTitle = value ? value.slice(0, 100) : undefined }); break
      case 'noteText': this.mutate(p => { p.noteText = value ? value.slice(0, TEXT_LIMIT) : undefined }); break
      case 'noteMeta': this.mutate(p => { p.noteMeta = value ? value.slice(0, 60) : undefined }); break
      case 'noteLikes': this.mutate(p => { p.noteLikes = value ? value.slice(0, 12) : undefined }); break
      case 'noteSaves': this.mutate(p => { p.noteSaves = value ? value.slice(0, 12) : undefined }); break
      case 'momentsAlert': this.mutate(p => { p.momentsAlert = value.slice(0, 6) || undefined }); break
      case 'reaction': this.setReactionCount(id, extra, value); break
      case 'thinkingSeconds': {
        const n = parseInt(value.replace(/\D/g, '').slice(0, 4), 10) || 0
        this.mutate(p => {
          const e = entry(p)
          if (!e) return
          if (n <= 0) e.thinking = undefined
          else if (e.thinking) e.thinking.seconds = n
        })
        break
      }
      case 'thinkingText':
        this.mutate(p => { const e = entry(p); if (e?.thinking) e.thinking.text = value ? value.slice(0, TEXT_LIMIT) : undefined })
        break
      case 'sources': {
        const names = value.split(/[,，、\n]+/).map(s => s.trim().slice(0, 40)).filter(Boolean)
        this.mutate(p => { const e = entry(p); if (e) e.sources = names.length ? names.slice(0, 6) : undefined })
        break
      }
      case 'version': {
        const digits = value.split(/\D+/).filter(Boolean).slice(0, 2)
        this.mutate(p => {
          const e = entry(p)
          if (e) e.version = digits.length === 2 ? `${digits[0]}/${digits[1]}` : digits.length ? `${digits[0]}/${digits[0]}` : undefined
        })
        break
      }
    }
    if (removed) {
      this.sound('delete')
      if (this.s.selection === id) this.set({ selection: undefined })
    } else this.sound('commit')
    if (kind === 'text' && this.chainComment === id) {
      this.chainComment = undefined
      if (bySubmit && !removed && value) this.continueComments(id)
    }
  }

  /** People in comments exist because they commented: a fresh one whose only comment was emptied goes too. */
  private dropOrphan(person: string, p: Project) {
    if (!freshSender(projectRules(p)) || p.selfID === person || this.s.sender === person || p.authorID === person) return
    if (p.entries.some(e => e.personID === person || e.target === person || (e.likers ?? []).includes(person))) return
    p.people = p.people.filter(x => x.id !== person)
  }

  // MARK: sending

  /** Who the next entry is from. Chats: always someone; comments: undefined = someone new. */
  activeSender(): string | undefined {
    const p = this.project
    const s = this.s.sender
    if (s && p.people.some(x => x.id === s)) return s
    if (freshSender(projectRules(p))) return undefined
    return p.selfID ?? p.people[0]?.id
  }

  /** Resolve the author inside the same change as the entry, so one undo reverts both. */
  author(p: Project): string {
    const r = projectRules(p)
    const s = this.activeSender()
    if (s && p.people.some(x => x.id === s)) return s
    if (!freshSender(r)) {
      const id = p.selfID ?? p.people[0]?.id
      if (id) return id
    }
    if (hasSelf(r) && !freshSender(r)) {
      const me = makePerson(zhen(p.language, '我', 'Me'), freshCritter(p.people.map(x => x.color)))
      p.people.push(me)
      p.selfID = me.id
      return me.id
    }
    return addFreshPerson(p)
  }

  send(raw: string): boolean {
    let text = raw.trim()
    if (!text || this.atLimit()) return false
    const p0 = this.project
    const r = projectRules(p0)
    if (has(r, 'likers')) { this.sendMoments(text); return true }
    if (isAssistant(r) && assistantTurns(text)) { this.pasteAssistant(text); return true }
    const threaded = has(r, 'thread') && text.startsWith('>')
    if (threaded) text = text.slice(1).trim()
    if (!text) return false
    const e = makeEntry('', { text: text.slice(0, isAssistant(r) ? REPLY_LIMIT : TEXT_LIMIT), isReply: threaded })
    const opening = allows(r, 'time') && visibleEntries(p0).length === 0
    this.mutate(p => {
      e.personID = this.author(p)
      if (opening) p.entries.push(makeEntry(e.personID, { kind: 'time', date: timeEntryDate(p, p.entries.length) }))
      if (opening) {
        const time = p.entries[p.entries.length - 1]
        time.text = formatTime(time.date!, screenshotDay(p), platformOf(p), p.language, usesTwelveHour(p))
      }
      readTokens(p, e)
      readReplyTarget(p, e)
      p.entries.push(e)
    })
    this.set({ selection: undefined, scrollTo: { id: e.id, bottom: true, tick: Date.now() } })
    this.afterAdding(e)
    if (isAssistant(r)) this.set({ sender: assistantPartner(this.project, e.personID) })
    return true
  }

  private afterAdding(e: Entry) {
    this.cue(e)
    // Private chat + a third person → the group version of the same app.
    const p = this.project
    const r = projectRules(p)
    if (oneOnOne(r) && p.people.filter(x => x.id !== p.selfID).length > 1) {
      const group = counterpart(p.template)
      if (group) {
        this.mutate(q => switchTemplateGuard(q, group))
        this.say(t('Switched to {0}', t(DISPLAY_NAME[group])))
      }
    }
  }

  cue(e: Entry) {
    switch (e.kind) {
      case 'recall': this.sound('delete'); break
      case 'pat': this.sound('pat'); if (e.target) this.shake(e.target); break
      case 'time': case 'system': this.sound('drop'); break
      case 'screenshot': this.sound('shutter'); break
      case 'notification': this.sound('notify'); break
      default: {
        const p = this.project
        const mine = !isChat(projectRules(p)) || e.personID === p.selfID
        this.sound(mine ? 'send' : 'receive')
      }
    }
  }

  setDraft(text: string) { this.set({ draft: text }) }
  focusComposer() { this.set({ focusTick: this.s.focusTick + 1 }) }

  setSender(id: string) {
    if (this.s.sender === id) return
    this.set({ sender: id })
    this.sound('select')
  }

  setFreshSender() {
    if (!freshSender(projectRules(this.project))) return
    this.set({ sender: undefined })
    this.sound('select')
  }

  pickSender(n: number) {
    if (n === 0) { this.setFreshSender(); return }
    const cast = castOf(this.project)
    const person = cast[n - 1]
    if (person) this.setSender(person.id)
  }

  cycleSender(step: number) {
    const cast = castOf(this.project)
    const fresh = freshSender(projectRules(this.project))
    const slots: (string | undefined)[] = [...cast.map(x => x.id), ...(fresh ? [undefined] : [])]
    if (!slots.length) return
    const at = slots.indexOf(this.activeSender())
    const next = slots[(at + step + slots.length) % slots.length]
    this.set({ sender: next })
    this.sound('select')
  }

  // MARK: adding

  async insert(after: string | undefined, kind: Kind, reply = false) {
    const p0 = this.project
    const r = projectRules(p0)
    this.set({ floating: undefined })
    if (!allows(r, kind)) { this.say(t('{0} has no {1}', t(DISPLAY_NAME[p0.template]), kindLabel(kind))); return }
    if (this.atLimit()) return
    if (kind === 'image' || kind === 'sticker') {
      await this.requestImage({ kind: 'newEntry', after, sticker: kind === 'sticker' })
      return
    }
    let e = makeEntry('', { kind, isReply: reply && has(r, 'thread') })
    const index = after ? p0.entries.findIndex(x => x.id === after) + 1 : p0.entries.length
    this.mutate(p => {
      const author = this.author(p)
      e.personID = author
      switch (kind) {
        case 'time': {
          const date = timeEntryDate(p, index)
          e = { ...e, date, text: formatTime(date, screenshotDay(p), platformOf(p), p.language, usesTwelveHour(p)) }
          break
        }
        case 'voice':
          e.seconds = 3
          if (author !== p.selfID && isChat(projectRules(p))) e.unread = true
          break
        case 'pat': case 'card': e.target = patTarget(author, after, p); break
        case 'link': case 'file': case 'location': {
          const s = starter(p, kind)
          e.text = s.text; e.detail = s.detail; e.source = s.source
          break
        }
        case 'call': { const l = callLabel(p, '', false); e.text = l.text; e.detail = l.detail; break }
        case 'notification': {
          if (author === p.selfID) {
            const other = p.people.find(x => x.id !== p.selfID)
            if (other) e.personID = other.id
          }
          e.text = zhen(p.language, '我到楼下了（这次是真的）', "i'm outside. wrong outside, give me a sec")
          break
        }
      }
      p.entries.splice(Math.min(index, p.entries.length), 0, e)
    })
    this.set({ selection: e.id, scrollTo: { id: e.id, bottom: !after, tick: Date.now() } })
    this.cue(e)
    if (['text', 'time', 'system', 'link', 'file', 'location', 'call', 'notification'].includes(kind)) this.beginEdit(`text:${e.id}`)
  }

  pat(target: string, after?: string) {
    const p0 = this.project
    if (this.s.playing || !allows(projectRules(p0), 'pat') || this.atLimit()) return
    const e = makeEntry('', { kind: 'pat', target })
    const index = after ? p0.entries.findIndex(x => x.id === after) + 1 : p0.entries.length
    this.mutate(p => {
      e.personID = this.author(p)
      p.entries.splice(Math.min(index, p.entries.length), 0, e)
    })
    this.set({ selection: e.id })
    this.cue(e)
  }

  shake(person: string) {
    this.set({ shakes: { ...this.s.shakes, [person]: (this.s.shakes[person] ?? 0) + 1 } })
  }

  delete(id: string) {
    const list = visibleEntries(this.project)
    const i = list.findIndex(e => e.id === id)
    if (i < 0) return
    this.mutate(p => { p.entries = p.entries.filter(e => e.id !== id) })
    const rest = visibleEntries(this.project)
    this.set({ selection: rest.length ? rest[Math.min(i, rest.length - 1)].id : undefined, floating: undefined })
    this.sound('delete')
  }

  duplicate(id: string) {
    if (this.atLimit()) return
    const i = this.project.entries.findIndex(e => e.id === id)
    if (i < 0) return
    const copy = { ...structuredClone(this.project.entries[i]), id: uid() }
    this.mutate(p => { p.entries.splice(i + 1, 0, copy) })
    this.set({ selection: copy.id })
    this.sound('drop')
  }

  move(id: string, target: string, after: boolean) {
    if (id === target) return
    const ids = visibleEntries(this.project).map(e => e.id).filter(x => x !== id)
    const at = ids.indexOf(target)
    if (at < 0) return
    ids.splice(after ? at + 1 : at, 0, id)
    this.mutate(p => reorderVisible(p, ids))
    this.sound('drop')
  }

  // MARK: one entry

  private edit(id: string, change: (e: Entry, p: Project) => void, cue: Cue = 'toggle') {
    this.mutate(p => { const e = p.entries.find(x => x.id === id); if (e) change(e, p) })
    this.sound(cue)
  }

  addQuote(id: string) {
    const p = this.project
    const i = p.entries.findIndex(e => e.id === id)
    if (i < 0) return
    const source = p.entries.slice(0, i).reverse().find(e => !isNoticeKind(e.kind))
    const name = source && p.people.find(x => x.id === source.personID)?.name
    const text = source ? `${name}：${summary(source)}` : zhen(p.language, '引用的内容', 'quoted message')
    this.mutate(q => { const e = q.entries.find(x => x.id === id); if (e) e.quote = text })
    this.beginEdit(`quote:${id}`)
  }

  removeQuote(id: string) { this.edit(id, e => { e.quote = '' }, 'delete') }
  setReaction(id: string, emoji?: string) { this.edit(id, e => { e.isLiked = !!emoji; e.reaction = emoji }, emoji ? 'react' : 'delete') }
  toggleEdited(id: string) { this.edit(id, e => { e.edited = e.edited ? undefined : true }) }
  toggleFailed(id: string) { this.edit(id, e => { e.failed = e.failed ? undefined : true }) }
  toggleUnread(id: string) { this.edit(id, e => { e.unread = e.unread ? undefined : true }) }
  toggleSaved(id: string) { this.edit(id, e => { e.saved = e.saved ? undefined : true }) }
  togglePinned(id: string) { this.edit(id, e => { e.pinned = e.pinned ? undefined : true }) }
  toggleAuthorLiked(id: string) { this.edit(id, e => { e.authorLiked = e.authorLiked ? undefined : true }, 'react') }
  toggleLiked(id: string) {
    this.edit(id, e => {
      e.isLiked = !e.isLiked
      // Liking a comment adds one to its count when it's a plain number.
      const n = Number(e.likes || '0')
      if (/^\d*$/.test(e.likes)) e.likes = String(Math.max(0, n + (e.isLiked ? 1 : -1)) || '')
    }, 'react')
  }
  toggleVideoCall(id: string) {
    this.edit(id, (e, p) => {
      e.video = e.video ? undefined : true
      const l = callLabel(p, e.detail ?? '', !!e.video)
      if (platformOf(p) !== 'wechat') e.text = l.text
    })
  }
  addReplies(id: string) { this.mutate(p => { const e = p.entries.find(x => x.id === id); if (e) e.replies = '12' }); this.beginEdit(`replies:${id}`) }
  removeReplies(id: string) { this.edit(id, e => { e.replies = undefined }, 'delete') }
  setReply(id: string, on: boolean) {
    const r = projectRules(this.project)
    if (!has(r, 'thread')) return
    this.edit(id, e => { e.isReply = on; if (!on) e.target = undefined }, 'drop')
  }
  toggleReply(id: string) {
    const e = this.project.entries.find(x => x.id === id)
    if (e) this.setReply(id, !e.isReply)
  }
  setTarget(id: string, person: string | undefined) { this.edit(id, e => { e.target = person }, 'select') }
  /** Tab on a selected entry: the next person in the cast wrote it. */
  cycleAuthor(id: string, step: number) {
    const cast = castOf(this.project)
    const e = this.project.entries.find(x => x.id === id)
    if (!e || cast.length < 2) return
    const at = cast.findIndex(x => x.id === e.personID)
    const next = cast[(at + step + cast.length) % cast.length]
    this.setAuthor(id, next.id)
  }

  setAuthor(id: string, person: string) {
    this.edit(id, e => { e.personID = person }, 'drop')
    this.shake(person)
  }
  cycleReceipt(id: string) {
    this.edit(id, (e, p) => {
      const now = effectiveReceipt(p, e)
      if (!now) return
      const steps = receiptSteps(p)
      e.receipt = steps[(steps.indexOf(now) + 1) % steps.length]
    })
  }
  toggleSnapOpened(id: string) { this.edit(id, e => { e.receipt = e.receipt === 'read' ? undefined : 'read' }) }
  toggleSnapSound(id: string) { this.edit(id, e => { e.video = e.video ? undefined : true }) }
  toggleMyReaction(id: string, emoji: string) {
    let added = false
    this.mutate(p => {
      const e = p.entries.find(x => x.id === id)
      if (!e) return
      const list = [...(e.reactions ?? [])]
      const k = list.findIndex(x => x.emoji === emoji)
      if (k >= 0) {
        if (list[k].mine) {
          list[k] = { ...list[k], count: list[k].count - 1, mine: undefined }
          if (list[k].count <= 0) list.splice(k, 1)
        } else { list[k] = { ...list[k], count: list[k].count + 1, mine: true }; added = true }
      } else { list.push({ emoji, count: 1, mine: true }); added = true }
      e.reactions = list.length ? list : undefined
    })
    this.sound(added ? 'react' : 'delete')
  }
  setReactionCount(id: string, emoji: string, raw: string) {
    const n = parseInt(raw.replace(/\D/g, '').slice(0, 6), 10) || 0
    this.mutate(p => {
      const e = p.entries.find(x => x.id === id)
      if (!e?.reactions) return
      const list = e.reactions.map(x => ({ ...x }))
      const k = list.findIndex(x => x.emoji === emoji)
      if (k < 0) return
      if (n <= 0) list.splice(k, 1); else list[k].count = n
      e.reactions = list.length ? list : undefined
    })
  }
  convertToImage(id: string) { void this.requestImage({ kind: 'entry', id }, true) }

  // AI chat
  toggleThinking(id: string) {
    let added = false
    this.edit(id, e => { if (e.thinking) e.thinking = undefined; else { e.thinking = { seconds: 8 }; added = true } }, 'drop')
    if (added) this.beginEdit(`thinkingSeconds:${id}`)
  }
  toggleThinkingOpen(id: string) {
    let opened = false, empty = false
    this.edit(id, e => {
      if (!e.thinking) return
      e.thinking.open = e.thinking.open ? undefined : true
      opened = !!e.thinking.open
      empty = !e.thinking.text
    })
    if (opened && empty) this.beginEdit(`thinkingText:${id}`)
  }
  toggleFeedback(id: string, value: Feedback) { this.edit(id, e => { e.feedback = e.feedback === value ? undefined : value }, 'react') }
  addSources(id: string) {
    this.mutate(p => { const e = p.entries.find(x => x.id === id); if (e && !(e.sources ?? []).length) e.sources = ['Wikipedia'] })
    this.beginEdit(`sources:${id}`)
  }
  removeSources(id: string) { this.edit(id, e => { e.sources = undefined }, 'delete') }
  toggleVersion(id: string) {
    let added = false
    this.edit(id, e => { if (e.version) e.version = undefined; else { e.version = '2/2'; added = true } })
    if (added) this.beginEdit(`version:${id}`)
  }

  // MARK: people

  makeSelf(person: string) {
    this.mutate(p => { p.selfID = person })
    this.shake(person)
    this.sound('toggle')
  }
  toggleCreator(person: string) {
    this.mutate(p => { p.authorID = p.authorID === person ? undefined : person })
    this.shake(person)
    this.sound('toggle')
  }
  toggleVerified(person: string) {
    this.mutate(p => { const x = p.people.find(y => y.id === person); if (x) x.verified = x.verified ? undefined : true })
    this.sound('toggle')
  }
  setRoleColor(person: string, color?: number) {
    this.mutate(p => { const x = p.people.find(y => y.id === person); if (x) x.roleColor = color })
    this.shake(person)
    this.sound('select')
  }
  toggleBot(person: string) {
    this.mutate(p => { const x = p.people.find(y => y.id === person); if (x) x.isBot = x.isBot ? undefined : true })
    this.sound('toggle')
  }
  setAvatar(person: string, ref?: string) {
    this.mutate(p => { const x = p.people.find(y => y.id === person); if (x) x.avatar = ref })
    this.shake(person)
    this.sound('drop')
  }
  /** The paw: back to a critter if there's a photo, otherwise another critter nobody here has. */
  nextCritter(person: string) {
    this.mutate(p => {
      const x = p.people.find(y => y.id === person)
      if (!x) return
      if (x.avatar) { x.avatar = undefined; return }
      x.color = freshCritter(p.people.map(y => y.color).concat(x.color))
    })
    this.shake(person)
    this.sound('drop')
  }
  deletePerson(person: string) {
    const p = this.project
    if (p.people.length <= 1) return
    this.mutate(q => removePerson(q, person))
    if (this.s.sender === person) this.set({ sender: undefined })
    this.set({ floating: undefined })
    this.sound('delete')
  }
  addPerson() {
    const p = this.project
    const used = new Set(p.people.map(x => x.name))
    const persona = library.pick(1, used)[0]
    let id = ''
    this.mutate(q => {
      id = addPerson(q, persona?.name ?? fallbackName(q.language, used))
      const x = q.people.find(y => y.id === id)!
      if (persona) { x.avatar = persona.avatar; x.color = persona.color }
    })
    this.set({ sender: id })
    this.sound('drop')
    const r = projectRules(this.project)
    if (oneOnOne(r) && this.project.people.filter(x => x.id !== this.project.selfID).length > 1) {
      const group = counterpart(this.project.template)
      if (group) {
        this.mutate(q => switchTemplateGuard(q, group))
        this.say(t('Switched to {0}', t(DISPLAY_NAME[group])))
      }
    }
  }

  // MARK: avatar library

  fillPerson(person: string, personaID: string) {
    const persona = library.get(personaID)
    if (!persona) return
    this.mutate(p => {
      const x = p.people.find(y => y.id === person)
      if (!x) return
      const old = x.name
      x.name = persona.name
      x.avatar = persona.avatar
      x.color = persona.color
      if (has(projectRules(p), 'contactTitle') && p.title === old) p.title = persona.name
    })
    this.shake(person)
    this.sound('target')
  }

  /** Clicking an account: fills the current sender; with "someone new" in comments it adds that account as a new person. */
  fillSender(personaID: string) {
    const sender = this.activeSender()
    if (sender) { this.fillPerson(sender, personaID); return }
    this.addFromPersona(personaID)
  }

  addFromPersona(personaID: string) {
    const persona = library.get(personaID)
    if (!persona) return
    let id = ''
    this.mutate(p => {
      id = addPerson(p, persona.name)
      const x = p.people.find(y => y.id === id)!
      x.avatar = persona.avatar
      x.color = persona.color
    })
    this.set({ sender: id })
    this.sound('target')
  }

  savePerson(person: string) {
    const x = this.project.people.find(y => y.id === person)
    if (!x) return
    const existing = library.match(x.name)
    if (existing) library.update(existing.id, y => ({ ...y, avatar: x.avatar ?? y.avatar, color: x.color }))
    else {
      const id = library.add(x.name, x.avatar)
      library.update(id, y => ({ ...y, color: x.color }))
    }
    this.say(t('“{0}” is in the library', x.name))
    this.sound('save')
  }

  /** Everyone except me becomes an account from the library that isn't on screen yet. Undo brings them back. */
  shuffleCast() {
    const p0 = this.project
    const others = p0.people.filter(x => x.id !== p0.selfID)
    const picks = library.pick(others.length, new Set(p0.people.map(x => x.name)))
    if (!picks.length) { this.say(t('The library has no one new')); return }
    this.mutate(p => {
      p.people.filter(x => x.id !== p.selfID).forEach((x, i) => {
        const persona = picks[i]
        if (!persona) return
        const old = x.name
        x.name = persona.name; x.avatar = persona.avatar; x.color = persona.color
        if (has(projectRules(p), 'contactTitle') && p.title === old) p.title = persona.name
      })
    })
    this.sound('target')
  }

  // MARK: the page

  togglePage(key: 'dark' | 'showStatusBar' | 'showComposer') {
    this.mutate(p => { p[key] = !p[key] })
    this.sound('toggle')
  }
  toggleTwelveHour() {
    this.mutate(p => {
      p.clock12 = !usesTwelveHour(p)
      for (const e of p.entries) {
        if (e.kind === 'time' && e.date !== undefined) e.text = formatTime(e.date, screenshotDay(p), platformOf(p), p.language, p.clock12)
      }
    })
    this.sound('toggle')
  }
  toggleKeyboard() { this.mutate(p => { p.keyboard = p.keyboard ? undefined : true; if (p.keyboard) p.showComposer = true }); this.sound('toggle') }
  toggleSMS() { this.mutate(p => { p.sms = p.sms ? undefined : true }); this.sound('toggle') }
  setLanguage(lang: Lang) { this.mutate(p => { p.language = lang }); this.sound('toggle') }
  setArrangement(a: Arrangement) { this.mutate(p => { p.arrangement = a === 'page' ? undefined : a }); this.sound('toggle') }
  pinComposerText(text: string) {
    if (!text.trim()) { this.say(t('Type something in the composer first')); return }
    this.mutate(p => { p.composerText = text.trim() })
    this.sound('toggle')
    this.say(t('The screenshot will keep this text in the composer'))
  }
  clearComposerText() { this.mutate(p => { p.composerText = undefined }); this.sound('delete') }
  setWallpaper(ref?: string) { this.mutate(p => { p.wallpaper = ref }); this.sound(ref ? 'drop' : 'delete') }
  setMomentsProfile(on: boolean) { this.mutate(p => { p.momentsProfile = on || undefined }); this.sound('toggle') }
  toggleMomentsAlert() { this.mutate(p => { p.momentsAlert = p.momentsAlert ? undefined : '3' }); this.sound('toggle') }
  /** Moments: a post's place under it, then edit it right there. */
  addLocation(id: string) {
    this.edit(id, e => { e.detail = this.project.language === 'chinese' ? '上海' : 'San Francisco' }, 'toggle')
    this.beginEdit(`detail:${id}`)
  }
  removeLocation(id: string) { this.edit(id, e => { e.detail = undefined }, 'delete') }
  removePhotos(id: string) { this.edit(id, e => { e.gallery = undefined; if (e.kind === 'image') { e.kind = 'text'; e.image = undefined } }, 'delete') }
  removeCommentImage(id: string) { this.edit(id, e => { e.kind = 'text'; e.image = undefined }, 'delete') }
  renamePerson(person: string, name: string) {
    this.beginEdit(`castName:${person}`)
    this.commit(`castName:${person}`, name)
  }
  /** "+" in a who-sent-it row: a new person, and this entry is theirs. */
  addPersonFor(id: string) {
    const before = new Set(this.project.people.map(x => x.id))
    this.addPerson()
    const added = this.project.people.find(x => !before.has(x.id))
    if (added) this.setAuthor(id, added.id)
  }
  toggleHideLead() { this.mutate(p => { p.hideLead = p.hideLead ? undefined : true }); this.sound('toggle') }
  toggleFollowing() { this.mutate(p => { p.following = p.following ? undefined : true }); this.sound('toggle') }
  setCover(ref?: string) { this.mutate(p => { p.cover = ref }); this.sound(ref ? 'drop' : 'delete') }
  /** Xiaohongshu: flip the note's pictures. */
  showNotePicture(index: number) {
    const count = notePictures(this.project).length
    if (count < 2) return
    const page = Math.min(Math.max(index, 0), count - 1)
    if (page === notePictureIndex(this.project)) return
    this.mutate(p => { p.notePage = page || undefined })
    this.sound('tick')
  }
  removeNotePicture() {
    const index = notePictureIndex(this.project)
    const list = notePictures(this.project)
    if (!list[index]) return
    this.mutate(p => {
      setNotePictures(p, list.filter((_, i) => i !== index))
      const page = Math.max(0, index - 1)
      p.notePage = page || undefined
    })
    this.sound('delete')
  }
  toggleMomentsProfile() { this.mutate(p => { p.momentsProfile = p.momentsProfile ? undefined : true }); this.sound('toggle') }
  previewBattery(level: number) {
    const v = Math.min(Math.max(Math.round(level), 1), 100)
    const old = this.s.battery ?? this.project.battery ?? 80
    if (Math.floor(v / 5) !== Math.floor(old / 5)) this.sound('tick')
    this.set({ battery: v })
  }
  commitBattery() {
    const v = this.s.battery
    if (v === undefined) return
    this.mutate(p => { p.battery = v })
    this.set({ battery: undefined })
    this.sound('drop')
  }

  switchScene(target: Template) {
    const p = this.project
    if (target === p.template) return
    if (!canSwitch(p, target)) { this.say(t('A direct chat can only have you and one other person')); return }
    rememberAssistant(target)
    this.mutate(q => switchTemplateGuard(q, target))
    const hidden = this.project.entries.length - visibleEntries(this.project).length
    if (hidden > 0) this.say(t('{0} hidden in {1}. Switch back to see them', hidden, t(DISPLAY_NAME[target])))
    this.set({ selection: undefined, floating: undefined, sender: undefined })
    this.sound('toggle')
  }

  loadSample() {
    const p = this.project
    const sample = exampleProject(p.template)
    this.mutate(q => { Object.assign(q, sample, { dark: q.dark || sample.dark }) })
    this.set({ selection: undefined, sender: undefined })
    this.sound('drop')
  }

  clearAll() {
    const p = this.project
    const fresh = blankProject(p.template)
    this.mutate(q => { Object.assign(q, fresh, { dark: q.dark, language: q.language }) })
    this.set({ selection: undefined, sender: undefined, floating: undefined })
    this.say(t('Cleared. Undo to bring it back'))
    this.sound('delete')
  }

  // MARK: images

  /** Opens the file picker and delivers the picked image. Must be called from a click. */
  async requestImage(request: ImageRequest, convert = false) {
    const [file] = await pickFile('image/*')
    if (file) await this.deliver(file, request, convert)
  }

  async deliver(file: Blob, request: ImageRequest, convert = false) {
    let ref: string
    try { ref = await importImage(file, maxPixelsFor(request)) } catch { this.say(t('This image can’t be opened. Try a common image file.')); return }
    switch (request.kind) {
      case 'entry':
        this.edit(request.id, e => {
          e.image = ref
          if (convert && !['image', 'sticker', 'link', 'location', 'notification'].includes(e.kind)) { e.kind = 'image'; e.text = '' }
        }, 'drop')
        break
      case 'newEntry': this.insertImage(ref, request.after, request.sticker ? 'sticker' : 'image'); break
      case 'avatar': this.setAvatar(request.person, ref); break
      case 'persona': library.update(request.id, x => ({ ...x, avatar: ref })); this.sound('drop'); break
      case 'viewer': this.mutate(p => { p.viewerAvatar = ref }); this.sound('drop'); break
      case 'wallpaper': this.setWallpaper(ref); break
      case 'cover': this.mutate(p => { p.cover = ref }); this.sound('drop'); break
      case 'photo':
        this.edit(request.id, e => {
          const g = [...(e.gallery ?? [])]
          if (request.index !== undefined && g[request.index]) g[request.index] = ref
          else if (g.length < 9) g.push(ref)
          e.gallery = g
        }, 'drop')
        break
      case 'commentPicture': this.edit(request.id, e => { e.image = ref }, 'drop'); break
      case 'notePicture': {
        const list = notePictures(this.project)
        if (request.index === undefined || !list[request.index]) {
          if (list.length >= NOTE_PICTURE_LIMIT) { this.say(t('A note can have up to {0} pictures.', NOTE_PICTURE_LIMIT)); return }
          this.mutate(p => { setNotePictures(p, [...list, ref]); p.notePage = list.length || undefined })
        } else {
          const at = request.index
          this.mutate(p => { setNotePictures(p, list.map((x, i) => (i === at ? ref : x))) })
        }
        this.sound('drop')
        break
      }
    }
  }

  insertImage(ref: string, after?: string, kind: Kind = 'image') {
    if (this.atLimit()) return
    const p0 = this.project
    const e = makeEntry('', { kind, image: ref })
    const index = after ? p0.entries.findIndex(x => x.id === after) + 1 : p0.entries.length
    const opening = isChat(projectRules(p0)) && allows(projectRules(p0), 'time') && visibleEntries(p0).length === 0
    this.mutate(p => {
      e.personID = this.author(p)
      if (opening) {
        const date = timeEntryDate(p, 0)
        p.entries.push(makeEntry(e.personID, { kind: 'time', date, text: formatTime(date, screenshotDay(p), platformOf(p), p.language, usesTwelveHour(p)) }))
      }
      p.entries.splice(Math.min(opening ? p.entries.length : index, p.entries.length), 0, e)
    })
    this.set({ selection: e.id, scrollTo: { id: e.id, bottom: !after, tick: Date.now() } })
    this.cue(e)
  }

  // MARK: paste

  pasteText(text: string, after?: string) {
    const p = this.project
    if (isAssistant(projectRules(p))) { this.pasteAssistant(text, after); return }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length <= 1) { this.send(text); return }
    this.importScript(text, false)
  }

  importScript(text: string, replace: boolean) {
    let added: string[] = []
    try {
      this.mutate(p => { added = importScript(p, text, replace) })
    } catch (err) {
      if (err instanceof ScriptError) this.say(err.message === 'tooMany' ? t('A project can have up to {0} items.', ITEM_LIMIT) : t('Paste at least one line first.'))
      return
    }
    if (!added.length) return
    // Names that match the library pick up its avatars.
    this.mutate(p => {
      for (const x of p.people) {
        if (x.avatar) continue
        const persona = library.match(x.name)
        if (persona) { x.avatar = persona.avatar; x.color = persona.color }
      }
    })
    const last = added[added.length - 1]
    this.set({ selection: undefined, scrollTo: { id: last, bottom: true, tick: Date.now() } })
    this.say(t('Pasted {0}', added.length))
    this.sound('drop')
  }

  pasteAssistant(raw: string, after?: string) {
    const text = raw.trim()
    if (!text) return
    const turns = assistantTurns(text)
    if (this.atLimit(turns?.length ?? 1)) return
    const added: Entry[] = []
    this.mutate(p => {
      const speaker = this.author(p)
      const pieces = turns ?? [{ mine: speaker === p.selfID, text }]
      let index = after ? p.entries.findIndex(e => e.id === after) + 1 : p.entries.length
      for (const piece of pieces) {
        const person = turns ? assistantSpeaker(p, piece.mine) : speaker
        const e = makeEntry(person, { text: piece.text.slice(0, REPLY_LIMIT) })
        p.entries.splice(Math.min(index, p.entries.length), 0, e)
        index++
        added.push(e)
      }
    })
    const last = added[added.length - 1]
    if (!last) return
    this.set({ selection: undefined, scrollTo: { id: last.id, bottom: true, tick: Date.now() }, sender: assistantPartner(this.project, last.personID) })
    if (added.length > 1) this.say(t('Pasted {0}', added.length))
    this.cue(last)
  }

  // MARK: Moments (WeChat feed)

  /** Selected post → comment on it; nothing selected → a new post at the top. */
  sendMoments(text: string) {
    const p0 = this.project
    const selected = p0.entries.find(e => e.id === this.s.selection)
    if (selected) {
      const posts = threadPost(p0, selected.id)
      const after = lastInThread(p0, posts)
      const e = makeEntry('', { text: text.slice(0, TEXT_LIMIT), isReply: true })
      this.mutate(p => {
        e.personID = this.author(p)
        if (selected.isReply && selected.personID !== e.personID) e.target = selected.personID
        const i = p.entries.findIndex(x => x.id === after)
        p.entries.splice(i + 1, 0, e)
      })
      this.cue(e)
      return
    }
    this.newMomentsPost(text)
  }

  newMomentsPost(text = '', image?: string) {
    if (this.atLimit()) return
    const e = makeEntry('', { text: text.slice(0, TEXT_LIMIT), metadata: zhen(this.project.language, '刚刚', 'Just now'), gallery: image ? [image] : undefined })
    this.mutate(p => {
      e.personID = p.selfID ?? this.author(p)
      p.entries.unshift(e)
    })
    this.set({ selection: e.id, scrollTo: { id: e.id, bottom: false, tick: Date.now() } })
    this.sound('send')
    if (!text) this.beginEdit(`text:${e.id}`)
  }

  /** Moments: start a comment under a post (from the "··" panel). Return commits and opens the next one. */
  startComment(postID: string, replyTo?: string) {
    if (this.atLimit()) return
    const p0 = this.project
    const after = lastInThread(p0, postID)
    const e = makeEntry('', { isReply: true, target: replyTo })
    this.mutate(p => {
      e.personID = this.author(p)
      if (e.target === e.personID) e.target = undefined
      const i = p.entries.findIndex(x => x.id === after)
      p.entries.splice(i + 1, 0, e)
    })
    this.chainComment = e.id
    this.set({ selection: e.id, floating: undefined })
    this.beginEdit(`text:${e.id}`)
  }

  private continueComments(after: string) {
    const p = this.project
    const post = threadPost(p, after)
    if (post) this.startComment(post)
  }

  /** Moments: like a post as the current sender ("someone new" brings one more account from the library). */
  toggleLike(postID: string, person?: string) {
    let who = person
    this.mutate(p => {
      who ??= this.author(p)
      const e = p.entries.find(x => x.id === postID)
      if (!e) return
      const list = e.likers ?? []
      e.likers = list.includes(who) ? list.filter(x => x !== who) : [...list, who]
      if (!e.likers.length) e.likers = undefined
    })
    this.set({ floating: undefined })
    this.sound('react')
  }

  /** Does the current sender like this post? */
  likesNow(postID: string) {
    const me = this.activeSender()
    return !!me && !!this.project.entries.find(e => e.id === postID)?.likers?.includes(me)
  }

  addLiker(postID: string, person: string) {
    this.mutate(p => {
      const e = p.entries.find(x => x.id === postID)
      if (e && !(e.likers ?? []).includes(person)) e.likers = [...(e.likers ?? []), person]
    })
    this.shake(person)
    this.sound('react')
  }

  addLikerFromPersona(postID: string, personaID: string) {
    const source = library.get(personaID)
    if (!source) return
    let added: string | undefined
    this.mutate(p => {
      let person = p.people.find(x => x.name === source.name)?.id
      if (!person) {
        person = addPerson(p, source.name)
        const x = p.people.find(y => y.id === person)!
        x.avatar = source.avatar
        x.color = source.color
      }
      added = person
      const e = p.entries.find(x => x.id === postID)
      if (e && !(e.likers ?? []).includes(person)) e.likers = [...(e.likers ?? []), person]
    })
    if (added) this.shake(added)
    this.sound('react')
  }

  /** Who would be added, in order, when the likes are dragged longer: current likers, then the cast, then the library. */
  likeCandidates(postID: string): { name: string; person?: string; persona?: string }[] {
    const p = this.project
    const e = p.entries.find(x => x.id === postID)
    if (!e) return []
    const likers = e.likers ?? []
    const list: { name: string; person?: string; persona?: string }[] = []
    for (const id of likers) { const x = p.people.find(y => y.id === id); if (x) list.push({ name: x.name, person: x.id }) }
    for (const x of p.people) if (!likers.includes(x.id) && x.id !== e.personID) list.push({ name: x.name, person: x.id })
    const used = new Set(p.people.map(x => x.name))
    for (const persona of library.all()) if (!used.has(persona.name)) list.push({ name: persona.name, persona: persona.id })
    return list
  }

  previewLikes(postID: string, count: number) {
    const value = Math.min(Math.max(count, 0), this.likeCandidates(postID).length)
    const old = this.s.likePreview
    if (old?.id !== postID || old.count !== value) this.sound('tick')
    this.set({ likePreview: { id: postID, count: value } })
  }

  commitLikes() {
    const preview = this.s.likePreview
    if (!preview) return
    const chosen = this.likeCandidates(preview.id).slice(0, preview.count)
    this.set({ likePreview: undefined })
    this.mutate(p => {
      const e = p.entries.find(x => x.id === preview.id)
      if (!e) return
      const ids: string[] = []
      for (const c of chosen) {
        if (c.person) ids.push(c.person)
        else if (c.persona) {
          const source = library.get(c.persona)
          if (!source) continue
          const id = addPerson(p, source.name)
          const x = p.people.find(y => y.id === id)!
          x.avatar = source.avatar
          x.color = source.color
          ids.push(id)
        }
      }
      e.likers = ids.length ? ids : undefined
    })
    this.sound('drop')
  }

  cycleAudience(id: string) {
    this.edit(id, e => { e.audience = e.audience === undefined ? 'partial' : e.audience === 'partial' ? 'onlyMe' : undefined }, 'toggle')
  }

  removeLiker(postID: string, person: string) {
    this.edit(postID, e => { e.likers = (e.likers ?? []).filter(x => x !== person); if (!e.likers.length) e.likers = undefined }, 'delete')
  }

  setAudience(id: string, audience?: Entry['audience']) { this.edit(id, e => { e.audience = audience }) }

  // MARK: playback

  play(from = 0) {
    this.endEditing()
    this.set({ playing: { origin: performance.now() - from * 1000, from, typing: this.s.playing?.typing ?? true }, floating: undefined, selection: undefined, pageSelected: false })
  }

  stop() { this.set({ playing: undefined }) }
  setTyping(on: boolean) { const pl = this.s.playing; if (pl) this.set({ playing: { ...pl, typing: on } }) }
}

// MARK: helpers

function kindLabel(kind: Kind): string {
  const names: Record<Kind, string> = {
    text: 'Text', time: 'Time', image: 'Photo', voice: 'Voice', recall: 'Unsend', pat: 'Nudge', system: 'Notice',
    sticker: 'Sticker', link: 'Link', file: 'File', location: 'Location', card: 'Contact', call: 'Call', snap: 'Snap',
    screenshot: 'Screenshot', notification: 'Notification',
  }
  return t(names[kind])
}

function patTarget(author: string, near: string | undefined, p: Project): string | undefined {
  const e = near ? p.entries.find(x => x.id === near) : undefined
  if (e && !isNoticeKind(e.kind) && e.personID !== author) return e.personID
  if (author === p.selfID) return p.people.find(x => x.id !== author)?.id
  return p.selfID
}

export function fallbackName(lang: Lang, used: Set<string>) {
  const names = lang === 'chinese'
    ? ['像素没对齐', '这条先别剪', '耳机只剩左边', '帧率随缘', '拖延有时差', '今天不加冰', '折叠椅本人', '回来取伞']
    : ['receipt.jpg', 'roomtemp.exe', 'gloss.archive', 'cachemiss', 'packetloss', 'kneecap.jpg', 'cablebasil', 'patchnotes']
  const free = names.find(n => !used.has(n))
  if (free) return free
  const prefix = lang === 'chinese' ? '路过的' : 'lurker'
  let n = used.size + 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** Comments: each new comment is someone not on screen yet, from the library if possible. */
export function addFreshPerson(p: Project): string {
  const used = new Set(p.people.map(x => x.name))
  const persona = library.pick(1, used)[0]
  const id = addPerson(p, persona?.name ?? fallbackName(p.language, used))
  if (persona) {
    const x = p.people.find(y => y.id === id)!
    x.avatar = persona.avatar
    x.color = persona.color
  }
  return id
}

/** The top-level post an entry belongs to (Moments). */
export function threadPost(p: Project, id: string): string | undefined {
  let post: string | undefined
  for (const e of p.entries) {
    if (!e.isReply) post = e.id
    if (e.id === id) return post
  }
  return undefined
}

function lastInThread(p: Project, postID: string | undefined): string | undefined {
  if (!postID) return undefined
  const i = p.entries.findIndex(e => e.id === postID)
  let last = postID
  for (let k = i + 1; k < p.entries.length && p.entries[k].isReply; k++) last = p.entries[k].id
  return last
}

export const critterOf = critterIndex

// MARK: React access

export const StudioContext = createContext<Studio | null>(null)
export const useStudioRef = () => useContext(StudioContext)

/** Read from the editor; outside the editor (exports, thumbnails) returns `fallback`. */
export function useStudio<T>(select: (s: StudioState) => T, fallback: T): T {
  const studio = useContext(StudioContext)
  return useStore(studio?.store, select, fallback)
}
