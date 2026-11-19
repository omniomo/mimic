// Photos into the avatar library: each picture becomes a person you can drop on anyone.

import type { Studio } from '../store/studio'
import { pickFile } from '../store/studio'
import { library } from '../store/library'
import { importImage, MAX_PIXELS } from '../store/assets'
import { t } from '../i18n'

export async function addPersonas(studio: Studio, files?: File[]) {
  const list = files ?? await pickFile('image/*', true)
  let n = 0
  for (const f of list) {
    try {
      const ref = await importImage(f, MAX_PIXELS.avatar)
      library.add(t('New person {0}', library.all().length + 1), ref)
      n++
    } catch { /* skip unreadable */ }
  }
  if (n) { studio.say(t('Added {0} to the library', n)); studio.sound('save') }
}
