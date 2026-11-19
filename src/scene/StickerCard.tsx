import { Phone } from './Phone'
import type { Entry, Project } from '../model/types'

/** One comment sticker, alone and transparent around it (for export). Lives apart from the skin: the skin must not
 *  import Phone, or the skins table would be read before the short-video skins exist. */
export function StickerCard({ p, e }: { p: Project; e: Entry }) {
  return <Phone p={{ ...p, entries: [e], dark: false }} mode="page" variant="stickers" className="isolated" />
}
