// One screen at a time: split a whole page into consecutive phone screens. An entry never splits;
// a time row never stays at the bottom of a screen, it travels with the entry below it.
// AI answers are the exception: they can be taller than a screen, so they split between blocks (skip / shown).

export interface ScreenWindow { start: number; end: number; skip?: number; shown?: number }

export function screenStarts(heights: number[], available: number, glue: boolean[] = [], lead = 0): number[] {
  if (!heights.length) return []
  const out = [0]
  let used = lead
  heights.forEach((h, i) => {
    if (i > 0 && used + h > available + 0.5) {
      let cut = i
      const start = out[out.length - 1]
      if (cut - 1 > start && glue[cut - 1]) cut -= 1
      out.push(cut)
      used = heights.slice(cut, i).reduce((a, b) => a + b, 0)
    }
    used += h
  })
  return out
}

export function screenWindows(heights: number[], available: number, glue: boolean[] = [], lead = 0): ScreenWindow[] {
  const starts = screenStarts(heights, available, glue, lead)
  return starts.map((start, i) => ({ start, end: i + 1 < starts.length ? starts[i + 1] : heights.length }))
}

/** Split by position (AI chats): fill each screen, cutting only between rows or at `cuts` inside a row. */
export function screenSlices(heights: number[], cuts: number[][], available: number): ScreenWindow[] {
  if (!heights.length || available <= 1) return []
  const tops: number[] = []
  let total = 0
  for (const h of heights) { tops.push(total); total += h }
  const marks: number[] = []
  heights.forEach((h, i) => {
    if (i > 0) marks.push(tops[i])
    for (const c of cuts[i] ?? []) if (c > 0.5 && c < h - 0.5) marks.push(tops[i] + c)
  })
  marks.sort((a, b) => a - b)
  const window = (from: number, to: number): ScreenWindow => {
    let first = 0
    tops.forEach((t, i) => { if (t <= from + 0.5) first = i })
    let last = first
    tops.forEach((t, i) => { if (t < to - 0.5) last = Math.max(first, i) })
    return { start: first, end: last + 1, skip: Math.max(0, from - tops[first]), shown: to - from }
  }
  const out: ScreenWindow[] = []
  let top = 0
  while (total - top > available + 0.5) {
    const limit = top + available + 0.5
    const cut = [...marks].reverse().find(m => m > top + 0.5 && m <= limit) ?? top + available
    out.push(window(top, cut))
    top = cut
  }
  out.push(window(top, total))
  return out
}
