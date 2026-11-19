// The Markdown an AI answer is written in: block parsing, inline styles, code coloring.
// Small on purpose: headings, lists, quotes, code fences, tables, rules, **bold**, *italic*, `code`, ~~strike~~, [links](…).

import type { ReactNode } from 'react'

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'item'; marker?: string; depth: number; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'rule' }

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let quote: string[] = []
  let table: string[] = []
  let codeLanguage: string | undefined
  let codeLines: string[] = []
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') }); paragraph = [] }
  const flushQuote = () => { if (quote.length) blocks.push({ type: 'quote', text: quote.join('\n') }); quote = [] }
  const flushTable = () => {
    const rows = table.map(tableRow).filter((r): r is string[] => !!r)
    if (rows.length) blocks.push({ type: 'table', rows })
    table = []
  }
  const flushAll = () => { flushParagraph(); flushQuote(); flushTable() }
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim()
    if (codeLanguage !== undefined) {
      if (trimmed.startsWith('```')) {
        blocks.push({ type: 'code', language: codeLanguage, text: codeLines.join('\n') })
        codeLanguage = undefined
        codeLines = []
      } else codeLines.push(line)
      continue
    }
    if (trimmed.startsWith('```')) { flushAll(); codeLanguage = trimmed.slice(3).trim(); continue }
    if (!trimmed) { flushAll(); continue }
    if (trimmed.startsWith('|')) { flushParagraph(); flushQuote(); table.push(trimmed); continue }
    flushTable()
    if (trimmed.startsWith('>')) { flushParagraph(); quote.push(trimmed.slice(1).trim()); continue }
    flushQuote()
    const heading = headingBlock(trimmed)
    const item = heading ? undefined : listItem(line)
    if (heading) { flushParagraph(); blocks.push(heading) }
    else if (isRule(trimmed)) { flushParagraph(); blocks.push({ type: 'rule' }) }
    else if (item) { flushParagraph(); blocks.push(item) }
    else paragraph.push(trimmed)
  }
  if (codeLanguage !== undefined) blocks.push({ type: 'code', language: codeLanguage, text: codeLines.join('\n') })
  flushAll()
  return blocks
}

function headingBlock(line: string): Block | undefined {
  const m = /^(#{1,6}) (.+)$/.exec(line)
  const text = m?.[2].trim()
  return m && text ? { type: 'heading', level: m[1].length, text } : undefined
}

function isRule(line: string) {
  const compact = line.replace(/ /g, '')
  return compact.length >= 3 && '-*_'.includes(compact[0]) && [...compact].every(c => c === compact[0])
}

function listItem(line: string): Block | undefined {
  const indent = /^[ \t]*/.exec(line)![0]
  const spaces = [...indent].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0)
  const body = line.slice(indent.length)
  const depth = Math.min(Math.floor(spaces / 2), 3)
  const bullet = /^[-*+] (.*)$/.exec(body)
  if (bullet) return { type: 'item', depth, text: bullet[1].trim() }
  const numbered = /^(\d{1,3})[.)] (.*)$/.exec(body)
  if (numbered) return { type: 'item', marker: numbered[1] + '.', depth, text: numbered[2].trim() }
  return undefined
}

function tableRow(line: string): string[] | undefined {
  const cells = line.split('|').map(c => c.trim())
  if (cells[0] === '') cells.shift()
  if (cells[cells.length - 1] === '') cells.pop()
  if (!cells.length) return undefined
  const separator = cells.every(c => c && /^[-:]+$/.test(c) && c.includes('-'))
  return separator ? undefined : cells
}

/** What the editor's Enter adds on the next line inside a list: "- ", "3. "… ('' = end the list). */
export function listContinuation(line: string): string | undefined {
  const bullet = /^([ \t]*)([-*+]) (.*)$/.exec(line)
  if (bullet) return bullet[3].trim() ? `${bullet[1]}${bullet[2]} ` : ''
  const numbered = /^([ \t]*)(\d{1,3})([.)]) (.*)$/.exec(line)
  if (numbered) return numbered[4].trim() ? `${numbered[1]}${Number(numbered[2]) + 1}${numbered[3]} ` : ''
  return undefined
}

// MARK: inline

const INLINE = /(`[^`\n]+`)|(\*\*(?=\S)[\s\S]+?\*\*|(?<![\w])__(?=\S)[\s\S]+?__(?![\w]))|(~~(?=\S)[\s\S]+?~~)|(\*(?=[^\s*])[^*\n]+?\*|(?<![\w])_(?=[^\s_])[^_\n]+?_(?![\w]))|(\[[^\]\n]+\]\([^)\s]+\))/g

export function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index!
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}.${n++}`
    const [all, code, bold, strike, italic, link] = m
    if (code) out.push(<code key={k} className="md-code">{code.slice(1, -1)}</code>)
    else if (bold) out.push(<strong key={k}>{inline(bold.slice(2, -2), k)}</strong>)
    else if (strike) out.push(<s key={k}>{inline(strike.slice(2, -2), k)}</s>)
    else if (italic) out.push(<em key={k}>{inline(italic.slice(1, -1), k)}</em>)
    else if (link) {
      const label = link.slice(1, link.indexOf(']('))
      out.push(<span key={k} className="md-link">{inline(label, k)}</span>)
    } else out.push(all)
    last = at + all.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// MARK: code coloring

const KEYWORDS = new Set([
  'func', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'import', 'class', 'struct', 'enum', 'def', 'from',
  'in', 'and', 'or', 'not', 'true', 'false', 'nil', 'None', 'True', 'False', 'null', 'const', 'function', 'async',
  'await', 'try', 'catch', 'throw', 'new', 'public', 'private', 'static', 'self', 'this', 'case', 'switch', 'break',
  'continue', 'do', 'elif', 'with', 'as', 'echo', 'export', 'sudo', 'print', 'lambda', 'yield', 'fn', 'pub', 'mut',
  'SELECT', 'FROM', 'WHERE', 'select', 'from', 'where', 'cd', 'then', 'fi', 'done',
])
const HASH_COMMENTS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'python', 'py', 'ruby', 'rb', 'yaml', 'yml', 'toml', 'r', 'perl'])

export function highlight(code: string, language: string): ReactNode[] {
  const lang = language.toLowerCase()
  const hash = HASH_COMMENTS.has(lang)
  const chars = [...code]
  const out: ReactNode[] = []
  let plain = ''
  const flush = () => { if (plain) out.push(plain); plain = '' }
  const add = (piece: string, cls: string) => { flush(); out.push(<span key={out.length} className={cls}>{piece}</span>) }
  const isLetter = (c?: string) => !!c && /\p{L}/u.test(c)
  const isDigit = (c?: string) => !!c && /\p{N}/u.test(c)
  let i = 0
  while (i < chars.length) {
    const c = chars[i], next = chars[i + 1]
    if ((hash && c === '#') || (!hash && c === '/' && next === '/') || (c === '-' && next === '-' && lang === 'sql')) {
      let end = i
      while (end < chars.length && chars[end] !== '\n') end++
      add(chars.slice(i, end).join(''), 'md-cm')
      i = end
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let end = i + 1
      while (end < chars.length && chars[end] !== c && chars[end] !== '\n') { if (chars[end] === '\\') end++; end++ }
      end = Math.min(end + 1, chars.length)
      add(chars.slice(i, end).join(''), 'md-str')
      i = end
      continue
    }
    if (isDigit(c) && (i === 0 || !(isLetter(chars[i - 1]) || chars[i - 1] === '_'))) {
      let end = i
      while (end < chars.length && (isDigit(chars[end]) || chars[end] === '.')) end++
      add(chars.slice(i, end).join(''), 'md-num')
      i = end
      continue
    }
    if (isLetter(c) || c === '_') {
      let end = i
      while (end < chars.length && (isLetter(chars[end]) || isDigit(chars[end]) || chars[end] === '_')) end++
      const word = chars.slice(i, end).join('')
      if (KEYWORDS.has(word)) add(word, 'md-kw'); else plain += word
      i = end
      continue
    }
    plain += c
    i++
  }
  flush()
  return out
}
