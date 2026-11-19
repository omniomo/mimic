// Plays the conversation at the exported video's pace, with the same typing and sounds. Export the video from here.
// No speed control: speeding the whole clip up is one click in any editing app.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Phone, PHONE_H, PHONE_W } from '../scene/Phone'
import { Timeline } from '../video/timeline'
import { play, stopAll, loadSounds } from '../sound/board'
import { useStudio, type Studio } from '../store/studio'
import { Lu } from './icons'
import { Cell, GlyphButton } from './kit'
import { t } from '../i18n'

const BAR = 240

export function Player({ studio }: { studio: Studio }) {
  const p = studio.project
  const playing = useStudio(s => s.playing, undefined)!
  const typing = playing?.typing ?? true
  const timeline = useMemo(() => new Timeline(p, typing), [p, typing])
  const [now, setNow] = useState(playing?.from ?? 0)
  const [scale, setScale] = useState(1)
  const origin = useRef(performance.now() - (playing?.from ?? 0) * 1000)

  // Sounds for everything from `at` on.
  const schedule = (at: number) => {
    stopAll()
    void loadSounds().then(() => {
      for (const cue of timeline.cues) {
        if (cue.time + 0.001 < at) continue
        play(cue.sound, { delay: cue.time - at, seconds: cue.seconds })
      }
    })
  }

  const seek = (at: number) => {
    const clamped = Math.max(0, Math.min(at, timeline.duration))
    origin.current = performance.now() - clamped * 1000
    setNow(clamped)
    schedule(clamped)
  }

  useEffect(() => { seek(playing?.from ?? 0); return () => stopAll() }, [timeline])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const t = (performance.now() - origin.current) / 1000
      setNow(Math.min(t, timeline.duration))
      if (t < timeline.duration) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [timeline, origin.current])

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 150) / (PHONE_H + 16), (window.innerWidth - 40) / (PHONE_W + 16)))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const frame = timeline.frame(now)
  const bar = useRef<HTMLDivElement>(null)
  const scrub = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    seek(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * timeline.duration)
  }

  return (
    <div className="player" onClick={() => studio.stop()}>
      <div className="player-stack" onClick={ev => ev.stopPropagation()}>
        <div style={{ width: (PHONE_W + 16) * scale, height: (PHONE_H + 16) * scale }}>
          <div style={{ width: PHONE_W + 16, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <div className="bezel" style={{ padding: 8, borderRadius: 42 }}>
              <div className="bezel-clip" style={{ borderRadius: 34 }}><Phone p={p} mode="screen" playback={frame} /></div>
            </div>
          </div>
        </div>
        <div className="progress" ref={bar} style={{ width: BAR }} title={t('Playback position')} aria-label={t('Playback position')}
          onPointerDown={ev => { ev.currentTarget.setPointerCapture(ev.pointerId); scrub(ev.clientX) }}
          onPointerMove={ev => { if (ev.buttons) scrub(ev.clientX) }}>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${(now / Math.max(timeline.duration, 0.1)) * 100}%` }} /></div>
        </div>
        <div className="player-bar frost">
          <GlyphButton title={t('Stop')} size={40} onClick={() => studio.stop()}>
            <Lu name="squareFill" size={14} style={{ fill: 'currentColor' }} />
          </GlyphButton>
          <GlyphButton icon="rotateCcw" title={t('Replay')} size={40} glyph={16} onClick={() => seek(0)} />
          <Cell icon="keyboard" title={t('Type out my messages')} on={typing} size={36} glyph={17} onClick={() => studio.setTyping(!typing)} />
          <GlyphButton icon="share" title={`${t('Export video')}  ⇧⌘E`} size={40} glyph={15} filled style={{ marginLeft: 6 }}
            onClick={() => { studio.stop(); void import('../export/actions').then(m => m.exportVideoNow(studio, typing)) }} />
        </div>
      </div>
    </div>
  )
}
