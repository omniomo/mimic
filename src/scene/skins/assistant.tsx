// AI chats (ChatGPT-, Gemini- and DeepSeek-like). Prompts are bubbles on the right; answers are
// full-width Markdown with a thinking line, sources and action icons. Long answers can be cut
// between blocks when a screenshot needs several screens ([data-cut]).

import type * as R from 'react'
import type { ReactNode } from 'react'
import { useScene, type RowProps } from '../context'
import { Ed, ImageContent, RowShell, cx, editOn } from '../parts'
import { ComposerField, PlusButton, ViewerAvatar, useComposerHasText } from '../shared'
import { highlight, inline, parseMarkdown, type Block } from '../markdown'
import type { ComposerProps, Skin } from '../skin'
import { assistantTitle } from '../../model/project'
import type { Entry, Platform } from '../../model/types'
import { Io, type IoName } from '../../ui/icons'
import { useStudio } from '../../store/studio'
import './assistant.css'

const ink = (pl: Platform) => (pl === 'gemini' ? 'gemini' : pl === 'deepseek' ? 'deepseek' : 'chatgpt')

const PAPER: Record<string, [string, string]> = { chatgpt: ['#FFFFFF', '#212121'], gemini: ['#FFFFFF', '#131314'], deepseek: ['#FFFFFF', '#1E1F22'] }

/** ChatGPT's two-line menu. */
function Equal({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 9h16M4 15h10" /></svg>
}

/** A voice-mode waveform: five rounded bars. */
function Bars({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4M8.5 7v10M13 4v16M17.5 8v8M22 11v2" />
    </svg>
  )
}

function Title({ chevron }: { chevron?: boolean }) {
  const scene = useScene()
  const editing = useStudio(s => s.editing === 'title', false)
  return (
    <span className="ai-title-wrap">
      <Ed k="title" value={editing ? scene.p.title : assistantTitle(scene.p)} className="ai-title" multiline={false}
        placeholder={scene.tx('标题', 'Title')} />
      {chevron && <Io name="forward" size={11} className="ai-muted" />}
    </span>
  )
}

function Nav() {
  const scene = useScene()
  switch (ink(scene.pl)) {
    case 'gemini':
      return (
        <div className="nav ai-nav gm">
          <span className="ai-icon ai-muted"><Io name="menu" size={21} /></span>
          <Title />
          <span style={{ flex: 1 }} />
          <span className="ai-icon ai-muted"><Io name="create" size={20} /></span>
          <ViewerAvatar size={32} />
        </div>
      )
    case 'deepseek':
      return (
        <div className="nav ai-nav ds">
          <span className="ai-icon"><Io name="menu" size={21} /></span>
          <span className="ai-center"><Title /></span>
          <span className="ai-icon"><Io name="create" size={21} /></span>
        </div>
      )
    default:
      return (
        <div className="nav ai-nav gpt">
          <span className="ai-round"><Equal /></span>
          <span className="ai-center"><Title chevron /></span>
          <span className="ai-round"><Io name="create" size={18} /></span>
        </div>
      )
  }
}

function Action({ typed, live, busy }: ComposerProps) {
  const scene = useScene()
  const hasText = useComposerHasText(typed, live)
  const studio = scene.live ? scene.studio : null
  const kind = ink(scene.pl)
  const side = kind === 'chatgpt' ? 42 : kind === 'deepseek' ? 32 : 36
  const box = { width: side, height: side }
  if (busy) return <span className="ai-action" style={box}><i className="ai-stop" style={{ width: side * 0.32, height: side * 0.32 }} /></span>
  if (hasText || kind === 'deepseek') {
    return (
      <span className={cx('ai-action', !hasText && 'faint')} style={box}
        onClick={studio ? ev => { ev.stopPropagation(); if (studio.send(studio.s.draft)) studio.setDraft('') } : undefined}>
        <Io name="arrowUp" size={side * 0.48} />
      </span>
    )
  }
  if (kind === 'gemini') return <span className="ai-plain ai-muted" style={box}><Io name="mic" size={20} /></span>
  return <span className="ai-action" style={box}><Bars /></span>
}

function Composer(props: ComposerProps) {
  const scene = useScene()
  switch (ink(scene.pl)) {
    case 'gemini':
      return (
        <div className="ai-composer gm">
          <div className="ai-box">
            <ComposerField placeholder={scene.tx('问问看', 'Ask anything')} typed={props.typed} live={props.live} className="ai-field" />
            <div className="ai-tools">
              <PlusButton icon="add" size={22} className="ai-plain ai-muted" />
              <span className="ai-tool ai-muted"><Io name="options" size={16} />{scene.tx('工具', 'Tools')}</span>
              <span style={{ flex: 1 }} />
              <Action {...props} />
            </div>
          </div>
        </div>
      )
    case 'deepseek':
      return (
        <div className="ai-composer ds">
          <div className="ai-box">
            <ComposerField placeholder={scene.tx('发送消息', 'Message')} typed={props.typed} live={props.live} className="ai-field" />
            <div className="ai-tools">
              <span className="ai-pill on"><Io name="bulb" size={13} />{scene.tx('深度思考', 'DeepThink')}</span>
              <span className="ai-pill"><Io name="globe" size={13} />{scene.tx('联网搜索', 'Search')}</span>
              <span style={{ flex: 1 }} />
              <PlusButton icon="add" size={21} className="ai-plain" />
              <Action {...props} />
            </div>
          </div>
          <div className="ai-disclaimer">{scene.tx('内容由 AI 生成，请仔细甄别', 'AI-generated, for reference only')}</div>
        </div>
      )
    default:
      return (
        <div className="ai-composer gpt">
          <PlusButton icon="add" size={22} className="ai-circle" />
          <span className="ai-capsule">
            <ComposerField placeholder={scene.tx('有问题，尽管问', 'Ask anything')} typed={props.typed} live={props.live} className="ai-field" />
            <Io name="mic" size={20} />
          </span>
          <Action {...props} />
        </div>
      )
  }
}

// MARK: rows

function Row(props: RowProps) {
  const scene = useScene()
  return props.e.personID === scene.viewer ? <Prompt {...props} /> : <Reply {...props} />
}

function Prompt({ e, prev, isolated }: RowProps) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  let body: ReactNode
  if (e.kind === 'image') body = <ImageContent e={e} maxW={230} maxH={280} radius={18} />
  else if (e.kind === 'file') body = <File e={e} />
  else body = <div className="ai-bubble hit" {...editOn(studio, `text:${e.id}`)}><Ed k={`text:${e.id}`} value={e.text} /></div>
  return (
    <RowShell e={e} className={cx('ai-prompt', (!prev || isolated) && 'first')}>
      {body}
      {e.version && <Version e={e} />}
    </RowShell>
  )
}

function File({ e }: { e: Entry }) {
  const name = e.text || 'file.pdf'
  const type = (name.includes('.') ? name.split('.').pop()! : 'file').toUpperCase()
  return (
    <div className="ai-file hit">
      <span className="ai-file-icon"><Io name="docFill" size={16} /></span>
      <span className="ai-file-text">
        <Ed k={`text:${e.id}`} value={name} className="ai-file-name" multiline={false} />
        <span className="ai-muted">{type}</span>
      </span>
    </div>
  )
}

function Version({ e }: { e: Entry }) {
  return (
    <span className="ai-version ai-muted">
      <Io name="back" size={11} />
      <Ed k={`version:${e.id}`} value={e.version ?? ''} multiline={false} />
      <Io name="forward" size={11} />
    </span>
  )
}

/** Gap under each block, as in the apps: list items hug, code and tables breathe. */
function gap(blocks: Block[], i: number) {
  const b = blocks[i], next = blocks[i + 1]
  if (b.type === 'item' && next?.type === 'item') return 5
  if (b.type === 'heading') return 8
  if (b.type === 'code' || b.type === 'table') return 16
  return 13
}

function Reply({ e }: RowProps) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const editing = useStudio(s => s.editing === `text:${e.id}`, false) && !!studio
  const stream = scene.stream?.id === e.id ? scene.stream : undefined
  const pending = !!stream && stream.chars === undefined
  let source = e.text
  if (stream?.chars !== undefined) {
    const shown = [...e.text].slice(0, stream.chars).join('')
    source = (shown.split('```').length - 1) % 2 === 0 ? shown + ' ●' : shown
  }
  const blocks = parseMarkdown(source)
  const pieces: { key: string; node: ReactNode; gap: number }[] = []
  if (pending) {
    const thinkingWord = scene.pl === 'deepseek' ? scene.tx('思考中…', 'Thinking…') : scene.tx('正在思考', 'Thinking')
    const pulse = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin((stream?.pulse ?? 0) * Math.PI * 2))
    pieces.push({ key: 'pending', node: <span className="ai-pending" style={{ opacity: pulse }}>{thinkingWord}</span>, gap: 10 })
  } else {
    if (e.thinking) pieces.push({ key: 'thinking', node: <ThinkingLine e={e} />, gap: 12 })
    if (e.kind === 'image') pieces.push({ key: 'picture', node: <ImageContent e={e} maxW={350} maxH={420} radius={18} />, gap: 12 })
    else if (e.kind === 'file') pieces.push({ key: 'file', node: <File e={e} />, gap: 12 })
    else if (editing) pieces.push({ key: 'editor', node: <Ed k={`text:${e.id}`} value={e.text} className="ai-editor" markdown />, gap: 12 })
    else blocks.forEach((b, i) => pieces.push({ key: `b${i}`, node: <div {...editOn(studio, `text:${e.id}`)}><BlockView block={b} /></div>, gap: gap(blocks, i) }))
    if (!stream) {
      if (e.sources?.length) pieces.push({ key: 'sources', node: <Sources e={e} />, gap: 12 })
      pieces.push({ key: 'actions', node: <Actions e={e} />, gap: 2 })
    }
  }
  return (
    <RowShell e={e} className="ai-reply">
      <div className="ai-answer hit">
        {pieces.map((piece, i) => (
          <div key={piece.key} className="ai-piece" style={{ paddingBottom: piece.gap }} data-cut={i > 0 ? '' : undefined}>{piece.node}</div>
        ))}
      </div>
    </RowShell>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'paragraph': return <p className="md-p">{inline(block.text)}</p>
    case 'heading': return <p className={cx('md-h', block.level <= 2 && 'strong')} style={{ fontSize: `calc(var(--ai-size) + ${Math.max(0, 4 - block.level) * 2}px)` }}>{inline(block.text)}</p>
    case 'item':
      return (
        <div className={cx('md-item', block.marker && 'numbered')} style={{ paddingLeft: 4 + block.depth * 22 }}>
          <span className="md-marker">{block.marker ?? (block.depth === 0 ? '•' : '◦')}</span>
          <span className="md-p">{inline(block.text)}</span>
        </div>
      )
    case 'quote': return <div className="md-quote"><i /><span className="md-p">{inline(block.text)}</span></div>
    case 'code':
      return (
        <div className="md-block">
          <div className="md-block-head"><span>{block.language ? block.language.toLowerCase() : 'code'}</span><Io name="copy" size={13} /></div>
          <pre className="md-pre">{highlight(block.text, block.language)}</pre>
        </div>
      )
    case 'table': {
      const columns = Math.max(...block.rows.map(r => r.length))
      return (
        <div className="md-table" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
          {block.rows.map((row, r) => Array.from({ length: columns }, (_, c) => (
            <span key={`${r}.${c}`} className={cx('md-cell', r === 0 && 'head', r < block.rows.length - 1 && 'ruled')}>{inline(row[c] ?? '')}</span>
          )))}
        </div>
      )
    }
    case 'rule': return <hr className="md-rule" />
  }
}

function ThinkingLine({ e }: { e: Entry }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const thinking = e.thinking ?? { seconds: 0 }
  const open = !!thinking.open
  const en = scene.p.language === 'english'
  const seconds = <Ed k={`thinkingSeconds:${e.id}`} value={String(thinking.seconds)} className="ai-num" multiline={false} />
  let head: ReactNode
  switch (ink(scene.pl)) {
    case 'gemini':
      head = <span className="ai-chip">{en ? 'Show thinking' : '显示思路'}<Io name={open ? 'chevronUp' : 'down'} size={11} /></span>
      break
    case 'deepseek':
      head = <><Io name="bulb" size={14} /><span>{en ? 'Thought for ' : '已深度思考（用时 '}{seconds}{en ? ' seconds' : ' 秒）'}</span><Io name={open ? 'chevronUp' : 'down'} size={11} /></>
      break
    default:
      head = <><span>{en ? 'Thought for ' : '已思考 '}{seconds}{en ? 's' : ' 秒'}</span><Io name={open ? 'down' : 'forward'} size={11} /></>
  }
  return (
    <div className="ai-thinking">
      <div className="ai-thinking-head ai-muted" onClick={studio ? ev => { ev.stopPropagation(); studio.toggleThinkingOpen(e.id) } : undefined}>{head}</div>
      {open && (
        <div className={cx('ai-thought', scene.pl === 'deepseek' && 'barred')}>
          <Ed k={`thinkingText:${e.id}`} value={thinking.text ?? ''} className="ai-muted" placeholder={scene.tx('思考过程', 'Thoughts')} />
        </div>
      )}
    </div>
  )
}

function Sources({ e }: { e: Entry }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const list = e.sources ?? []
  const editing = useStudio(s => s.editing === `sources:${e.id}`, false) && !!studio
  if (editing) return <span className="ai-chip ai-src-edit"><Ed k={`sources:${e.id}`} value={list.join(', ')} multiline={false} /></span>
  return (
    <div className="ai-sources" {...editOn(studio, `sources:${e.id}`)}>
      {list.slice(0, 3).map((name, i) => (
        <span key={i} className="ai-chip ai-source"><i>{[...name][0]?.toUpperCase()}</i><span>{name}</span></span>
      ))}
      {list.length > 3 && <span className="ai-chip ai-muted">+{list.length - 3}</span>}
    </div>
  )
}

function Actions({ e }: { e: Entry }) {
  const scene = useScene()
  const studio = scene.live ? scene.studio : null
  const icon = (name: IoName, onClick?: () => void, style?: R.CSSProperties) => (
    <span key={name} className="ai-act" style={style} onClick={studio && onClick ? ev => { ev.stopPropagation(); onClick() } : undefined}><Io name={name} size={17} /></span>
  )
  const up = icon(e.feedback === 'up' ? 'thumbUpFill' : 'thumbUp', () => studio!.toggleFeedback(e.id, 'up'))
  const down = icon(e.feedback === 'down' ? 'thumbDownFill' : 'thumbDown', () => studio!.toggleFeedback(e.id, 'down'))
  let list: ReactNode[]
  switch (ink(scene.pl)) {
    case 'gemini': list = [up, down, icon('refresh'), icon('share'), icon('copy'), icon('moreV')]; break
    case 'deepseek': list = [icon('copy'), icon('refresh'), up, down, icon('share')]; break
    default: list = [icon('copy'), up, down, icon('volume'), icon('refresh'), icon('more')]
  }
  return (
    <div className="ai-actions ai-muted">
      {e.version && <Version e={e} />}
      {list}
    </div>
  )
}

const skinFor = (kind: 'chatgpt' | 'gemini' | 'deepseek'): Skin => ({
  className: `sk-ai ai-${kind}`,
  navHeight: 52,
  composerHeight: kind === 'chatgpt' ? 60 : kind === 'gemini' ? 108 : 112,
  wall: dark => PAPER[kind][dark ? 1 : 0],
  Nav,
  Composer,
  Row,
})

export const chatgpt = skinFor('chatgpt')
export const gemini = skinFor('gemini')
export const deepseek = skinFor('deepseek')
