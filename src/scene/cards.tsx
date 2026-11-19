// Small shared drawings: file icons, map thumbnails, voice waves.

import { Img } from './parts'
import { useAsset } from '../store/assets'

const FILE_TINT: [RegExp, string][] = [
  [/^pdf$/, '#F25B5B'], [/^(doc|docx|pages)$/, '#4A8CF7'], [/^(xls|xlsx|numbers|csv)$/, '#2FAE6A'],
  [/^(ppt|pptx|key)$/, '#F0883E'], [/^(zip|rar|7z)$/, '#9A8B6E'], [/^(mp4|mov|mp3|m4a)$/, '#8A63D2'],
]

export function fileExt(name: string) {
  const parts = name.split('.')
  return parts.length > 1 ? (parts[parts.length - 1] ?? '').toUpperCase() : ''
}

export function fileTint(name: string) {
  const ext = fileExt(name).toLowerCase()
  return FILE_TINT.find(([re]) => re.test(ext))?.[1] ?? '#8C96A8'
}

/** A colored page with the extension on it. */
export function FileIcon({ name, width = 40, height = 48 }: { name: string; width?: number; height?: number }) {
  return (
    <span className="file-icon" style={{ width, height, background: fileTint(name) }}>
      <span className="fi-fold" />
      <span className="fi-ext">{fileExt(name).slice(0, 4)}</span>
    </span>
  )
}

/** Under a location: the picked image, or a few roads and a red pin. */
export function MapThumb({ image, dark, height = 110 }: { image?: string; dark: boolean; height?: number }) {
  const url = useAsset(image)
  if (url) return <Img id={image} className="map-img" style={{ height }} />
  const ground = dark ? '#2E3430' : '#E8EEE4'
  const road = dark ? '#4A524D' : '#FFFFFF'
  const block = dark ? '#3A423C' : '#D6E2CE'
  return (
    <svg className="map-svg" viewBox="0 0 240 110" preserveAspectRatio="none" style={{ height, width: '100%' }}>
      <rect width="240" height="110" fill={ground} />
      <path d="M0 68 L240 53 M82 0 L101 110 M173 0 L192 110" stroke={road} strokeWidth="7" fill="none" />
      <rect x="115" y="11" width="43" height="29" rx="3" fill={block} />
      <path d="M120 30c-6 0-10.5 4.6-10.5 10.3 0 7.6 10.5 18.7 10.5 18.7s10.5-11.1 10.5-18.7C130.5 34.6 126 30 120 30zm0 14a3.7 3.7 0 1 1 0-7.4 3.7 3.7 0 0 1 0 7.4z" fill="#F04B4B" />
    </svg>
  )
}

/** WeChat-like three-arc sound wave (points left or right). */
export function Waves({ dir = 'right', size = 18 }: { dir?: 'left' | 'right'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }} aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.6" fill="currentColor" />
      <path d="M8 6.2a5.4 5.4 0 0 1 0 7.6" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <path d="M11.2 3.3a9.4 9.4 0 0 1 0 13.4" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** A voice waveform with bars of pseudo-random heights (stable for the same seed). */
export function Waveform({ seconds, width, color, played = 0, seed = 7 }: { seconds: number; width: number; color: string; played?: number; seed?: number }) {
  const bars = Math.max(8, Math.floor(width / 4))
  let state = seed * 9301 + seconds * 49297
  const rand = () => { state = (state * 9301 + 49297) % 233280; return state / 233280 }
  return (
    <svg width={width} height={22} viewBox={`0 0 ${width} 22`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const h = 3 + rand() * 15
        return <rect key={i} x={i * 4} y={(22 - h) / 2} width="2" height={h} rx="1" fill={color} opacity={i / bars < played ? 1 : 0.55} />
      })}
    </svg>
  )
}
