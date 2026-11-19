// The soundtrack: every cue of the timeline mixed into one mono track, limited, then encoded as AAC (when the browser can).

import { SAMPLE_RATE, limit, loadSounds, samplesFor } from '../sound/board'
import type { Timeline } from './timeline'
import type { AudioTrack, Sample } from './mp4'

export async function mixTimeline(tl: Timeline, seconds: number): Promise<Float32Array> {
  await loadSounds()
  const count = Math.max(1, Math.floor(seconds * SAMPLE_RATE))
  const mix = new Float32Array(count)
  for (const cue of tl.cues) {
    const data = samplesFor(cue.sound, cue.seconds)
    const start = Math.floor(cue.time * SAMPLE_RATE)
    if (start >= count) continue
    const end = Math.min(count, start + data.length)
    for (let k = start; k < end; k++) mix[k] += data[k - start]
  }
  limit(mix)
  return mix
}

const AAC = { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 128_000 }

export async function canEncodeAAC() {
  if (typeof AudioEncoder === 'undefined') return false
  try { return (await AudioEncoder.isConfigSupported(AAC)).supported === true } catch { return false }
}

/** AAC in an MP4 audio track. Returns undefined when this browser can't encode AAC (Firefox, Linux). */
export async function encodeAAC(mix: Float32Array): Promise<AudioTrack | undefined> {
  if (!(await canEncodeAAC())) return undefined
  const samples: Sample[] = []
  let asc: Uint8Array | undefined
  let error: unknown
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      if (meta?.decoderConfig?.description && !asc) asc = toBytes(meta.decoderConfig.description)
      samples.push({ data, duration: 1024, key: true })
    },
    error: e => { error = e },
  })
  encoder.configure(AAC)
  const block = 4800
  for (let i = 0; i < mix.length; i += block) {
    const slice = mix.slice(i, Math.min(mix.length, i + block))
    const data = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: slice.length, numberOfChannels: 1, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data: slice })
    encoder.encode(data)
    data.close()
  }
  await encoder.flush()
  encoder.close()
  if (error || !samples.length) return undefined
  // Some encoders don't hand out the AudioSpecificConfig: AAC-LC, 48 kHz, mono.
  asc ??= new Uint8Array([0x11, 0x88])
  return { sampleRate: SAMPLE_RATE, channels: 1, timescale: SAMPLE_RATE, asc, samples, bitrate: AAC.bitrate }
}

function toBytes(d: AllowSharedBufferSource): Uint8Array {
  if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0))
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength))
  return new Uint8Array(d as unknown as ArrayBuffer)
}
