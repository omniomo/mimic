// A minimal MP4 writer for one H.264 video track and an optional AAC audio track (WebCodecs output).
// Samples go into one mdat, the index (moov) is written at the end. No dependencies.

export interface Sample { data: Uint8Array; duration: number; key: boolean }

export interface VideoTrack { width: number; height: number; timescale: number; avcC: Uint8Array; samples: Sample[] }
export interface AudioTrack { sampleRate: number; channels: number; timescale: number; asc: Uint8Array; samples: Sample[]; bitrate: number }

class W {
  parts: Uint8Array[] = []
  size = 0
  push(b: Uint8Array) { this.parts.push(b); this.size += b.length }
  u8(v: number) { this.push(new Uint8Array([v & 255])) }
  u16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); this.push(b) }
  u24(v: number) { this.push(new Uint8Array([(v >> 16) & 255, (v >> 8) & 255, v & 255])) }
  u32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); this.push(b) }
  u64(v: number) { this.u32(Math.floor(v / 2 ** 32)); this.u32(v % 2 ** 32) }
  str(s: string) { this.push(new TextEncoder().encode(s)) }
  zeros(n: number) { this.push(new Uint8Array(n)) }
  bytes() { const out = new Uint8Array(this.size); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length } return out }
}

function box(type: string, ...content: (Uint8Array | ((w: W) => void))[]): Uint8Array {
  const w = new W()
  for (const c of content) {
    if (c instanceof Uint8Array) w.push(c)
    else c(w)
  }
  const body = w.bytes()
  const out = new W()
  out.u32(body.length + 8)
  out.str(type)
  out.push(body)
  return out.bytes()
}

const full = (version: number, flags: number) => (w: W) => { w.u8(version); w.u24(flags) }
const MATRIX = (w: W) => { for (const v of [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000]) w.u32(v) }

function stts(samples: Sample[]) {
  const runs: [number, number][] = []
  for (const s of samples) {
    const last = runs[runs.length - 1]
    if (last && last[1] === s.duration) last[0]++
    else runs.push([1, s.duration])
  }
  return box('stts', full(0, 0), w => { w.u32(runs.length); for (const [n, d] of runs) { w.u32(n); w.u32(d) } })
}

function stsz(samples: Sample[]) {
  return box('stsz', full(0, 0), w => { w.u32(0); w.u32(samples.length); for (const s of samples) w.u32(s.data.length) })
}

/** One chunk per sample keeps it simple and lets us use absolute offsets. */
function stscAndOffsets(offsets: number[]) {
  const stsc = box('stsc', full(0, 0), w => { w.u32(1); w.u32(1); w.u32(1); w.u32(1) })
  const big = offsets.some(o => o > 0xffffffff)
  const co = big
    ? box('co64', full(0, 0), w => { w.u32(offsets.length); for (const o of offsets) w.u64(o) })
    : box('stco', full(0, 0), w => { w.u32(offsets.length); for (const o of offsets) w.u32(o) })
  return [stsc, co]
}

function durationOf(samples: Sample[]) { return samples.reduce((a, s) => a + s.duration, 0) }

function tkhd(id: number, duration: number, width: number, height: number, audio: boolean) {
  return box('tkhd', full(0, 3), w => {
    w.u32(0); w.u32(0); w.u32(id); w.u32(0); w.u32(duration)
    w.zeros(8); w.u16(0); w.u16(0); w.u16(audio ? 0x0100 : 0); w.u16(0)
    MATRIX(w)
    w.u32(width * 0x10000); w.u32(height * 0x10000)
  })
}

function mdhd(timescale: number, duration: number) {
  return box('mdhd', full(0, 0), w => { w.u32(0); w.u32(0); w.u32(timescale); w.u32(duration); w.u16(0x55c4); w.u16(0) })
}

function hdlr(type: string, name: string) {
  return box('hdlr', full(0, 0), w => { w.u32(0); w.str(type); w.zeros(12); w.str(name); w.u8(0) })
}

const dinf = () => box('dinf', box('dref', full(0, 0), w => w.u32(1), box('url ', full(0, 1))))

function esds(asc: Uint8Array, bitrate: number) {
  const descr = (tag: number, body: Uint8Array) => {
    const w = new W()
    w.u8(tag)
    w.u8(0x80); w.u8(0x80); w.u8(0x80); w.u8(body.length)
    w.push(body)
    return w.bytes()
  }
  const dsi = descr(0x05, asc)
  const dcd = new W()
  dcd.u8(0x40); dcd.u8(0x15); dcd.u24(0); dcd.u32(bitrate); dcd.u32(bitrate); dcd.push(dsi)
  const dec = descr(0x04, dcd.bytes())
  const sl = descr(0x06, new Uint8Array([0x02]))
  const es = new W()
  es.u16(1); es.u8(0); es.push(dec); es.push(sl)
  return box('esds', full(0, 0), descr(0x03, es.bytes()))
}

export function writeMP4(video: VideoTrack, audio?: AudioTrack): Blob {
  const ftyp = box('ftyp', w => { w.str('isom'); w.u32(0x200); w.str('isom'); w.str('iso2'); w.str('avc1'); w.str('mp41') })
  // mdat: all video samples, then all audio samples.
  const mdatHeader = 8
  let cursor = ftyp.length + mdatHeader
  const vOffsets = video.samples.map(s => { const o = cursor; cursor += s.data.length; return o })
  const aOffsets = (audio?.samples ?? []).map(s => { const o = cursor; cursor += s.data.length; return o })
  const mdatSize = cursor - ftyp.length
  const mdatHead = new W(); mdatHead.u32(mdatSize); mdatHead.str('mdat')

  const vDur = durationOf(video.samples)
  const movieTimescale = 1000
  const vMovie = Math.round((vDur / video.timescale) * movieTimescale)
  const keys = video.samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean)
  const avc1 = box('avc1', w => {
    w.zeros(6); w.u16(1); w.zeros(16)
    w.u16(video.width); w.u16(video.height)
    w.u32(0x00480000); w.u32(0x00480000); w.u32(0); w.u16(1)
    w.zeros(32); w.u16(0x18); w.u16(0xffff)
  }, box('avcC', video.avcC))
  const vTrak = box('trak',
    tkhd(1, vMovie, video.width, video.height, false),
    box('mdia', mdhd(video.timescale, vDur), hdlr('vide', 'VideoHandler'),
      box('minf', box('vmhd', full(0, 1), w => { w.zeros(8) }), dinf(),
        box('stbl', box('stsd', full(0, 0), w => w.u32(1), avc1), stts(video.samples),
          box('stss', full(0, 0), w => { w.u32(keys.length); for (const k of keys) w.u32(k) }),
          ...stscAndOffsets(vOffsets), stsz(video.samples)))))

  const traks = [vTrak]
  let movieDur = vMovie
  if (audio && audio.samples.length) {
    const aDur = durationOf(audio.samples)
    const aMovie = Math.round((aDur / audio.timescale) * movieTimescale)
    movieDur = Math.max(movieDur, aMovie)
    const mp4a = box('mp4a', w => {
      w.zeros(6); w.u16(1); w.zeros(8)
      w.u16(audio.channels); w.u16(16); w.u16(0); w.u16(0)
      w.u32(audio.sampleRate * 0x10000)
    }, esds(audio.asc, audio.bitrate))
    traks.push(box('trak',
      tkhd(2, aMovie, 0, 0, true),
      box('mdia', mdhd(audio.timescale, aDur), hdlr('soun', 'SoundHandler'),
        box('minf', box('smhd', full(0, 0), w => { w.u32(0) }), dinf(),
          box('stbl', box('stsd', full(0, 0), w => w.u32(1), mp4a), stts(audio.samples),
            ...stscAndOffsets(aOffsets), stsz(audio.samples))))))
  }
  const mvhd = box('mvhd', full(0, 0), w => {
    w.u32(0); w.u32(0); w.u32(movieTimescale); w.u32(movieDur)
    w.u32(0x00010000); w.u16(0x0100); w.zeros(10)
    MATRIX(w)
    w.zeros(24); w.u32(traks.length + 1)
  })
  const moov = box('moov', mvhd, ...traks)
  const parts: BlobPart[] = [ftyp as Uint8Array<ArrayBuffer>, mdatHead.bytes() as Uint8Array<ArrayBuffer>]
  for (const s of video.samples) parts.push(s.data as Uint8Array<ArrayBuffer>)
  for (const s of audio?.samples ?? []) parts.push(s.data as Uint8Array<ArrayBuffer>)
  parts.push(moov as Uint8Array<ArrayBuffer>)
  return new Blob(parts as BlobPart[], { type: 'video/mp4' })
}

/** A plain 16-bit PCM WAV (the soundtrack, when the browser can't encode AAC). */
export function writeWAV(samples: Float32Array, sampleRate: number): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); data.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true)
  data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true)
  str(36, 'data'); data.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  return new Blob([data.buffer], { type: 'audio/wav' })
}
