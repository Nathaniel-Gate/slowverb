import { DEFAULT_FX } from '@app/config/fx'
import { useFx } from '@app/features/fx/fx.store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAudioContext, installBrowserFakes, type FakeAudio } from '../audio/testkit'
import { engine } from '../audio/engine'
import { setPlatform } from '../platform'
import { fakeFile, memoryPlatform } from '../platform/testkit'
import { useLibrary } from './library.store'
import { usePlayer } from './player.store'
import { useSettings } from './settings.store'

const SLOW = { speed: 0.8, pitchLock: false, wet: 0.4, decay: 4.5, damping: 0.4 }
// Engine and player are singletons wired on first play, so the browser fakes are installed ONCE per file.
const { session } = installBrowserFakes()
let ids: string[]
const el = () => engine.el as unknown as FakeAudio
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(async () => {
  vi.useRealTimers()
  session.metadata = null; session.position = null
  const mem = memoryPlatform([fakeFile('A.mp3'), fakeFile('B.mp3'), fakeFile('C.mp3')]); setPlatform(mem)
  useLibrary.setState({ songs: [] }); await useLibrary.getState().importFiles()
  ids = useLibrary.getState().songs.map((s) => s.id)
  usePlayer.getState().stop()
  useFx.setState({ fx: DEFAULT_FX, preset: 'Original', bypass: false })
  useSettings.setState({ autoAdvance: true })
})

describe('player: playback + remembered version', () => {
  it('plays a song through the engine with a latencyHint playback context', async () => {
    await usePlayer.getState().play(ids[0])
    expect(usePlayer.getState().cur).toBe(ids[0]); expect(usePlayer.getState().playing).toBe(true)
    expect(el().src).toBe(`mem://${ids[0]}`)
    expect((engine.ctx as unknown as FakeAudioContext).opts).toEqual({ latencyHint: 'playback' })
    expect(engine.ctx.state).toBe('running')
  })
  it('restores a song\'s remembered fx into useFx and the audio element', async () => {
    await useLibrary.getState().setSongFx(ids[1], SLOW)
    await usePlayer.getState().play(ids[1])
    expect(useFx.getState().fx).toEqual(SLOW); expect(useFx.getState().preset).toBe('Slowed + Reverb')
    expect(el().playbackRate).toBe(0.8); expect(el().preservesPitch).toBe(false)
  })
  it('saves a user edit back to the song (debounced) and restores it on the next play', async () => {
    await usePlayer.getState().play(ids[0])
    vi.useFakeTimers()
    useFx.getState().set({ speed: 0.7 }); useFx.getState().set({ speed: 0.65 })
    expect(useLibrary.getState().songs[0].fx).toBeUndefined() // not yet
    await vi.advanceTimersByTimeAsync(500)
    vi.useRealTimers()
    expect(useLibrary.getState().songs[0].fx?.speed).toBe(0.65)
    expect(el().playbackRate).toBe(0.65)
    await usePlayer.getState().play(ids[1]); useFx.getState().replace(DEFAULT_FX)
    await usePlayer.getState().play(ids[0])
    expect(useFx.getState().fx.speed).toBe(0.65)
  })
  it('an edit made just before switching songs is flushed to the OLD song', async () => {
    await usePlayer.getState().play(ids[0])
    useFx.getState().set({ wet: 0.5 })
    await usePlayer.getState().play(ids[1])
    await flush()
    expect(useLibrary.getState().songs.find((s) => s.id === ids[0])?.fx?.wet).toBe(0.5)
    expect(useLibrary.getState().songs.find((s) => s.id === ids[1])?.fx).toBeUndefined()
  })
  it('A/B bypass plays the original without changing the stored version', async () => {
    await useLibrary.getState().setSongFx(ids[0], SLOW)
    await usePlayer.getState().play(ids[0])
    useFx.getState().toggleBypass()
    expect(el().playbackRate).toBe(1)
    useFx.getState().toggleBypass()
    expect(el().playbackRate).toBe(0.8)
  })
})

describe('player: transport', () => {
  it('toggle pauses and resumes; skip and seek clamp', async () => {
    await usePlayer.getState().play(ids[0])
    el().duration = 100; el().fire('durationchange')
    usePlayer.getState().toggle(); expect(usePlayer.getState().playing).toBe(false)
    usePlayer.getState().toggle(); await flush(); expect(usePlayer.getState().playing).toBe(true)
    usePlayer.getState().seek(30); usePlayer.getState().skip(15); expect(el().currentTime).toBe(45)
    usePlayer.getState().skip(-999); expect(el().currentTime).toBe(0)
    usePlayer.getState().skip(999); expect(el().currentTime).toBe(100)
  })
  it('next/prev wrap around the library', async () => {
    await usePlayer.getState().play(ids[2])
    usePlayer.getState().next(1); await flush(); expect(usePlayer.getState().cur).toBe(ids[0])
    usePlayer.getState().next(-1); await flush(); expect(usePlayer.getState().cur).toBe(ids[2])
  })
  it('toggle with nothing loaded starts the first song', async () => {
    usePlayer.getState().toggle(); await flush(); await flush()
    expect(usePlayer.getState().cur).toBe(ids[0])
  })
  it('auto-advances at the end when the setting is on, stops when off', async () => {
    await usePlayer.getState().play(ids[0]); el().finish(); await flush(); await flush()
    expect(usePlayer.getState().cur).toBe(ids[1])
    useSettings.setState({ autoAdvance: false })
    el().finish(); await flush()
    expect(usePlayer.getState().cur).toBe(ids[1]); expect(usePlayer.getState().playing).toBe(false)
  })
  it('resumes where you left off, per song', async () => {
    await usePlayer.getState().play(ids[0])
    el().currentTime = 50; el().fire('timeupdate'); el().pause()
    await usePlayer.getState().play(ids[1])
    el().currentTime = 0
    await usePlayer.getState().play(ids[0])
    expect(el().currentTime).toBe(50)
  })
  it('deleting the loaded song stops playback', async () => {
    await usePlayer.getState().play(ids[0])
    await useLibrary.getState().remove(ids[0])
    expect(usePlayer.getState().cur).toBeNull(); expect(usePlayer.getState().playing).toBe(false); expect(engine.loaded).toBe(false)
  })
})

describe('media session (lock screen)', () => {
  it('sets metadata, state and every action handler', async () => {
    await useLibrary.getState().rename(ids[0], 'Nights', 'Frank')
    await usePlayer.getState().play(ids[0])
    expect(session.metadata).toMatchObject({ title: 'Nights', artist: 'Frank' })
    expect(session.playbackState).toBe('playing')
    for (const a of ['play', 'pause', 'seekto', 'nexttrack', 'previoustrack']) expect(typeof session.handlers[a]).toBe('function')
    el().pause(); expect(session.playbackState).toBe('paused')
  })
  it('handlers drive the player', async () => {
    await usePlayer.getState().play(ids[0])
    session.handlers.pause(); expect(usePlayer.getState().playing).toBe(false)
    session.handlers.play(); await flush(); expect(usePlayer.getState().playing).toBe(true)
    el().duration = 200; el().fire('durationchange')
    session.handlers.seekto({ seekTime: 77 }); expect(el().currentTime).toBe(77)
    session.handlers.nexttrack(); await flush(); expect(usePlayer.getState().cur).toBe(ids[1])
    session.handlers.previoustrack(); await flush(); expect(usePlayer.getState().cur).toBe(ids[0])
  })
  it('reports position with the slowed playback rate', async () => {
    await useLibrary.getState().setSongFx(ids[0], SLOW)
    await usePlayer.getState().play(ids[0])
    el().duration = 100; el().currentTime = 10; el().fire('timeupdate')
    expect(session.position).toEqual({ duration: 100, playbackRate: 0.8, position: 10 })
  })
})

describe('player: queue (the list a song was started from)', () => {
  it('next, previous and auto-advance stay inside the queue, wrapping at its ends', async () => {
    await usePlayer.getState().play(ids[0], [ids[0], ids[2]])
    usePlayer.getState().next(1); await flush(); expect(usePlayer.getState().cur).toBe(ids[2])
    usePlayer.getState().next(1); await flush(); expect(usePlayer.getState().cur).toBe(ids[0])
    usePlayer.getState().next(-1); await flush(); expect(usePlayer.getState().cur).toBe(ids[2])
    el().finish(); await flush(); expect(usePlayer.getState().cur).toBe(ids[0])
  })
  it('playing a song outside the queue goes back to the whole library; stop clears it', async () => {
    await usePlayer.getState().play(ids[0], [ids[0], ids[2]])
    await usePlayer.getState().play(ids[1]); expect(usePlayer.getState().queue).toBeNull()
    usePlayer.getState().next(1); await flush(); expect(usePlayer.getState().cur).toBe(ids[2])
    await usePlayer.getState().play(ids[0], [ids[0]]); usePlayer.getState().stop(); expect(usePlayer.getState().queue).toBeNull()
  })
})
