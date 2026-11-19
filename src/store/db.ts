// Everything is stored locally in IndexedDB: projects, images, the avatar library. Nothing leaves the browser.

const DB_NAME = 'mimic'
const DB_VERSION = 1
export type StoreName = 'projects' | 'assets' | 'kv'

let opening: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets')
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(name: StoreName, mode: IDBTransactionMode) {
  const db = await open()
  return db.transaction(name, mode).objectStore(name)
}

export async function dbGet<T>(name: StoreName, key: string): Promise<T | undefined> {
  return wrap((await store(name, 'readonly')).get(key)) as Promise<T | undefined>
}

export async function dbPut(name: StoreName, value: unknown, key?: string) {
  await wrap((await store(name, 'readwrite')).put(value, key))
}

export async function dbDelete(name: StoreName, key: string) {
  await wrap((await store(name, 'readwrite')).delete(key))
}

export async function dbAll<T>(name: StoreName): Promise<T[]> {
  return wrap((await store(name, 'readonly')).getAll()) as Promise<T[]>
}

/** Ask the browser not to evict our data (Safari otherwise may clear site data after 7 days without a visit). */
export async function requestPersistence() {
  try { await navigator.storage?.persist?.() } catch { /* ignore */ }
}
