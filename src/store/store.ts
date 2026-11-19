// A tiny external store: get / set / subscribe, read from React with a selector.
// Selectors must return primitives or existing references (never build new objects in a selector).

import { createContext, useContext, useSyncExternalStore } from 'react'

export class Store<S> {
  private listeners = new Set<() => void>()
  constructor(private state: S) {}

  get = () => this.state

  set = (patch: Partial<S> | ((s: S) => Partial<S>)) => {
    const next = typeof patch === 'function' ? patch(this.state) : patch
    let changed = false
    for (const key in next) {
      if (!Object.is(this.state[key], next[key])) { changed = true; break }
    }
    if (!changed) return
    this.state = { ...this.state, ...next }
    this.listeners.forEach(l => l())
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

const noop = () => () => {}

export function useStore<S, T>(store: Store<S> | null | undefined, select: (s: S) => T, fallback: T): T {
  return useSyncExternalStore(
    store ? store.subscribe : noop,
    store ? () => select(store.get()) : () => fallback,
  )
}

export function makeContext<T>() {
  const ctx = createContext<T | null>(null)
  return { ctx, use: () => useContext(ctx) }
}
