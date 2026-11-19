// Editor UI text is written in English; other languages are translations keyed by the English text.
// Placeholders are {0}, {1}… To add a language, add <code>.json next to zh.json and list it below.
// (Text drawn inside the phone follows the project's own language, not this.)

import zh from './zh.json'

const TABLES: Record<string, Record<string, string>> = { zh }

function pick(): string {
  try {
    const saved = localStorage.getItem('mimic.locale')
    if (saved && (saved === 'en' || TABLES[saved])) return saved
  } catch { /* ignore */ }
  const lang = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

export let locale = pick()

export function setLocale(next: string) {
  locale = next
  try { localStorage.setItem('mimic.locale', next) } catch { /* ignore */ }
  document.documentElement.lang = next === 'zh' ? 'zh-Hans' : 'en'
}

export function t(text: string, ...args: (string | number)[]): string {
  const table = TABLES[locale]
  const template = (table && table[text]) || text
  return args.length ? template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : template
}
