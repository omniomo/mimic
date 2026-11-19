// Every sound is a real CC0 recording (see SOUNDS.md), never synthesized. What you hear while editing is what the video gets.
// Files are 48 kHz mono WAV in public/sounds, trimmed and loudness-matched.

export type Cue =
  // in videos
  | 'send' | 'receive' | 'tick' | 'image' | 'recall' | 'pat' | 'system' | 'react' | 'comment' | 'reply'
  | 'notify' | 'stream' | 'otherTyping'
  // editing only
  | 'select' | 'lift' | 'drop' | 'target' | 'reject' | 'delete' | 'undo' | 'redo' | 'toggle' | 'edit' | 'commit' | 'save' | 'shutter'

export const SAMPLE_RATE = 48000

const FILES: Cue[] = ['send', 'receive', 'tick', 'image', 'recall', 'pat', 'system', 'react', 'comment', 'reply', 'otherTyping',
  'select', 'lift', 'drop', 'target', 'reject', 'delete', 'undo', 'redo', 'toggle', 'edit', 'commit', 'save', 'shutter']

const samples = new Map<string, Float32Array>()
let loadingAll: Promise<void> | undefined

/** Decode every recording once, at 48 kHz mono. */
export function loadSounds(): Promise<void> {
  loadingAll ??= (async () => {
    const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE)
    await Promise.all(FILES.map(async name => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.wav`)
        if (!res.ok) return
        const buffer = await decoder.decodeAudioData(await res.arrayBuffer())
        const mono = new Float32Array(buffer.length)
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const data = buffer.getChannelData(c)
          for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels
        }
        samples.set(name, mono)
      } catch { /* a missing recording just stays silent */ }
    }))
  })()
  return loadingAll
}

/** All samples of one cue. No recording → empty (silent), never a synthesized stand-in. */
export function samplesFor(cue: Cue, seconds = 0): Float32Array {
  if (cue === 'otherTyping') {
    const full = samples.get('otherTyping')
    if (!full || seconds <= 0) return new Float32Array(0)
    const count = Math.min(full.length, Math.floor(seconds * SAMPLE_RATE))
    const out = full.slice(0, count)
    const fade = Math.min(count, Math.floor(0.08 * SAMPLE_RATE))
    for (let k = 0; k < fade; k++) out[count - fade + k] *= (fade - k) / fade
    return out
  }
  const hit = samples.get(cue)
  if (hit) return hit
  // Not picked yet: borrow the closest one (see the sound design doc).
  if (cue === 'notify') return samples.get('receive') ?? new Float32Array(0)
  if (cue === 'stream') return (samples.get('tick') ?? new Float32Array(0)).map(v => v * 0.45)
  return new Float32Array(0)
}

/** Peak limiter at -1 dBFS: 3 ms look-ahead ramp down, 80 ms release, no clicks. */
export function limit(mix: Float32Array, ceiling = 0.891) {
  const n = mix.length
  let peak = 0
  for (let k = 0; k < n; k++) peak = Math.max(peak, Math.abs(mix[k]))
  if (peak <= ceiling) return
  const gain = new Float32Array(n).fill(1)
  for (let k = 0; k < n; k++) { const a = Math.abs(mix[k]); if (a > ceiling) gain[k] = ceiling / a }
  const ramp = 1 / (0.003 * SAMPLE_RATE)
  for (let k = n - 2; k >= 0; k--) gain[k] = Math.min(gain[k], gain[k + 1] + ramp)
  const release = Math.exp(-1 / (0.08 * SAMPLE_RATE))
  let current = 1
  for (let k = 0; k < n; k++) {
    current = Math.min(gain[k], 1 - (1 - current) * release)
    mix[k] *= current
  }
}

// MARK: live playback

let ctx: AudioContext | undefined
let lastTick = 0
const playing = new Set<AudioBufferSourceNode>()

export function soundEnabled() {
  try { return localStorage.getItem('mimic.sound') !== 'off' } catch { return true }
}

export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem('mimic.sound', on ? 'on' : 'off') } catch { /* ignore */ }
}

function context() {
  ctx ??= new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function bufferOf(data: Float32Array) {
  const c = context()
  const buffer = c.createBuffer(1, Math.max(1, data.length), SAMPLE_RATE)
  buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  return buffer
}

/** Play a cue now (or `delay` seconds from now). */
export function play(cue: Cue, opts: { delay?: number; seconds?: number; force?: boolean } = {}) {
  if (!opts.force && !soundEnabled()) return
  if (cue === 'tick') {
    const now = performance.now()
    if (now - lastTick < 30) return
    lastTick = now
  }
  void loadSounds().then(() => {
    const data = samplesFor(cue, opts.seconds)
    if (!data.length) return
    const c = context()
    const src = c.createBufferSource()
    src.buffer = bufferOf(data)
    const gain = c.createGain()
    gain.gain.value = 0.9
    src.connect(gain).connect(c.destination)
    src.onended = () => playing.delete(src)
    playing.add(src)
    src.start(c.currentTime + (opts.delay ?? 0))
  })
}

/** Stop everything that is still scheduled (stopping a preview). */
export function stopAll() {
  for (const src of playing) { try { src.stop() } catch { /* already stopped */ } }
  playing.clear()
}

/** Unlock audio on the first gesture (browsers start AudioContexts suspended). */
export function unlockAudio() {
  context()
  void loadSounds()
}
