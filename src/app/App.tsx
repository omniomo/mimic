import { useEffect, useState } from 'react'
import { Gallery } from '../ui/Gallery'
import { Workbench } from '../ui/Workbench'
import { loadProjects } from './projects'
import { loadLibrary } from '../store/library'
import { requestPersistence } from '../store/db'
import { unlockAudio } from '../sound/board'
import { locale, setLocale } from '../i18n'

type Route = { kind: 'gallery' } | { kind: 'project'; id: string }

function readHash(): Route {
  const m = /^#\/p\/([\w-]+)/.exec(location.hash)
  return m ? { kind: 'project', id: m[1] } : { kind: 'gallery' }
}

export function App() {
  const [route, setRoute] = useState<Route>(readHash)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setLocale(locale)
    void Promise.all([loadProjects(), loadLibrary()]).then(() => setReady(true))
    void requestPersistence()
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock) }
    window.addEventListener('pointerdown', unlock)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('pointerdown', unlock) }
  }, [])

  const open = (id: string) => { location.hash = `#/p/${id}` }
  const close = () => { history.replaceState(null, '', location.pathname + location.search); setRoute({ kind: 'gallery' }) }

  if (!ready) return null
  if (route.kind === 'project') return <Workbench key={route.id} id={route.id} onClose={close} />
  return <Gallery onOpen={open} />
}
