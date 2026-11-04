import type { Fx } from '@shared/types'
import { effectiveFx, useFx } from '@app/features/fx/fx.store'
import { create } from 'zustand'
import { engine } from '../audio/engine'
import { CONFIG } from '../config'
import { platform } from '../platform'
import { useLibrary } from './library.store'
import { afterEnd, matchPreset, neighbour, resumeAt } from './order'
import { clearPos, getPos, savePos } from './positions'
import { useSettings } from './settings.store'

type S = {
  cur: string | null; playing: boolean; pos: number; dur: number
  queue: string[] | null   // the song ids next / previous / auto-advance walk through (the list the song was tapped in); null = the whole library
  play(id: string, queue?: string[]): Promise<void>
  toggle(): void
  seek(t: number): void
  skip(d: number): void
  next(dir?: 1 | -1): void
  stop(): void
}

let token = 0            // bumps on every song change so a slow load never overrides a newer tap
let bound = false
let pending: { id: string; fx: Fx } | null = null
let fxTimer: ReturnType<typeof setTimeout> | undefined
let lastPosSave = 0

const flushFx = () => {
  clearTimeout(fxTimer)
  if (pending) { const { id, fx } = pending; pending = null; void useLibrary.getState().setSongFx(id, fx) }
}
const allIds = () => useLibrary.getState().songs.map((s) => s.id)

export const usePlayer = create<S>((set, get) => {
  const ids = () => { const q = get().queue, all = allIds(); if (!q) return all; const have = new Set(all); return q.filter((i) => have.has(i)) }
  const rememberPos = () => { const { cur, pos } = get(); if (cur && useLibrary.getState().songs.some((x) => x.id === cur)) savePos(cur, pos) }

  /** One-time wiring of engine events, lock-screen buttons, fx -> engine, fx -> song memory. Lazy so importing never builds Web Audio. */
  function bind() {
    if (bound) return; bound = true
    const el = engine.el
    el.addEventListener('play', () => set({ playing: true }))
    el.addEventListener('pause', () => { if (!el.ended) { set({ playing: false }); rememberPos() } })
    el.addEventListener('error', () => set({ playing: false }))
    el.addEventListener('durationchange', () => { if (Number.isFinite(el.duration) && el.duration > 0) set({ dur: el.duration }) })
    el.addEventListener('timeupdate', () => {
      set({ pos: el.currentTime })
      const now = Date.now()
      if (now - lastPosSave >= CONFIG.posSaveMs) { lastPosSave = now; rememberPos() }
    })
    el.addEventListener('ended', () => {
      const { cur } = get(); if (cur) clearPos(cur)
      const nxt = afterEnd(ids(), cur, useSettings.getState().autoAdvance)
      if (nxt) void get().play(nxt); else set({ playing: false, pos: 0 })
    })
    engine.bindSession({
      play: () => { engine.unlock(); void el.play().catch(() => undefined) },
      pause: () => el.pause(),
      seekto: (t) => get().seek(t),
      nexttrack: () => get().next(1),
      previoustrack: () => get().next(-1)
    })
    useFx.subscribe((s, prev) => {
      if (s.fx !== prev.fx || s.bypass !== prev.bypass) engine.apply(effectiveFx(s))
      if (s.touched !== prev.touched) { // a user edit: remember it on the current song (debounced)
        const { cur } = get(); if (!cur) return
        pending = { id: cur, fx: s.fx }; clearTimeout(fxTimer); fxTimer = setTimeout(flushFx, CONFIG.fxSaveDebounceMs)
      }
    })
    useLibrary.subscribe((s) => { const { cur } = get(); if (cur && !s.songs.some((x) => x.id === cur)) get().stop() }) // song deleted while loaded
  }

  return {
    cur: null, playing: false, pos: 0, dur: 0, queue: null,
    async play(id, queue) {
      const song = useLibrary.getState().songs.find((s) => s.id === id); if (!song) return
      bind(); engine.unlock() // must happen synchronously, inside the tap
      if (queue) set({ queue }); else if (get().queue && !get().queue!.includes(id)) set({ queue: null })
      if (get().cur === id && engine.loaded) { if (engine.el.paused) await engine.el.play().catch(() => undefined); return }
      flushFx(); rememberPos()
      const mine = ++token
      set({ cur: id, playing: false, pos: 0, dur: song.duration })
      if (song.fx) { const f = useFx.getState(); f.replace(song.fx, matchPreset({ ...f.fx, ...song.fx }, f.userPresets)) } // restore this song's version
      try {
        const url = await platform.getSongUrl(id)
        if (mine !== token) return
        engine.setNowPlaying({ title: song.title, artist: song.artist })
        await engine.load(url, effectiveFx(useFx.getState()), true, resumeAt(getPos(id), song.duration))
      } catch (e) {
        if (mine === token) { set({ playing: false }); console.warn('play failed', e) }
      }
    },
    toggle() {
      if (!get().cur) { const first = neighbour(ids(), null, 1); if (first) void get().play(first); return }
      engine.unlock()
      if (engine.el.paused) void engine.el.play().catch(() => undefined); else engine.el.pause()
    },
    seek(t) {
      const { dur } = get(), max = dur > 0 ? dur : Infinity
      const v = Math.min(Math.max(t, 0), max)
      if (engine.loaded) engine.el.currentTime = v
      set({ pos: v })
    },
    skip(d) { get().seek(get().pos + d) },
    next(dir = 1) { const id = neighbour(ids(), get().cur, dir); if (id) void get().play(id) },
    stop() {
      token++; flushFx(); rememberPos()
      engine.clear()
      set({ cur: null, playing: false, pos: 0, dur: 0, queue: null })
    }
  }
})
