import { describe, expect, it } from 'vitest'
import type { Song } from '../platform/types'
import { useAmbience } from '../state/ambience.store'
import { buildLayers, layerSongIds } from './layers'
import { installBrowserFakes } from './testkit'

installBrowserFakes()
const song = (id: string, category: string, file: string): Song => ({ id, title: id, artist: '', duration: 5, size: 1, addedAt: 1, category, file })
const songs = [song('rain', 'White noise', 'Rain.m4a'), song('click', 'Sound bites', 'Click.m4a'), song('tune', 'Songs', 'Tune.m4a')]
const url = (id: string) => `blob:${id}`

describe('phone layers', () => {
  it('maps chosen tracks to engine layers: White noise and queued layers loop by default, other songs play once', () => {
    const l = buildLayers([{ rel: 'White noise/Rain.m4a', level: -3 }, { rel: 'Songs/Tune.m4a', level: 0 }, { rel: 'Sound bites/Click.m4a', level: 0, queue: ['Songs/Tune.m4a'] }, { rel: 'Songs/Tune.m4a', level: 0, loop: true }], songs, url)
    expect(l.map((x) => [x.key, x.loop, x.db, x.urls])).toEqual([
      ['White noise/Rain.m4a', true, -3, ['blob:rain']], ['Songs/Tune.m4a', false, 0, ['blob:tune']], ['Sound bites/Click.m4a', true, 0, ['blob:click', 'blob:tune']], ['Songs/Tune.m4a', true, 0, ['blob:tune']]])
  })
  it('skips tracks that are not on the phone (the choice is kept) and ones whose url is unknown', () => {
    expect(buildLayers([{ rel: 'Songs/Gone.m4a', level: 0 }, { rel: 'White noise/Rain.m4a', level: 0, queue: ['Songs/Gone.m4a'] }], songs, url)[0].urls).toEqual(['blob:rain'])
    expect(buildLayers([{ rel: 'White noise/Rain.m4a', level: 0 }], songs, () => undefined)).toEqual([])
    expect(layerSongIds([{ rel: 'White noise/Rain.m4a', level: 0, queue: ['Songs/Tune.m4a', 'Songs/Gone.m4a'] }, { rel: 'White noise/Rain.m4a', level: 0 }], songs)).toEqual(['rain', 'tune'])
  })
  it('the layers store clamps levels, queues tracks, switches on when a layer is added, and saves', () => {
    const a = useAmbience.getState()
    a.addSounds(['White noise/Rain.m4a', 'White noise/Rain.m4a', 'Songs/Tune.m4a'])
    expect(useAmbience.getState().on).toBe(true); expect(useAmbience.getState().sounds.map((s) => s.rel)).toEqual(['White noise/Rain.m4a', 'Songs/Tune.m4a'])
    a.setSoundLevel('Songs/Tune.m4a', 99); a.setLevel(-100); a.queueAdd('Songs/Tune.m4a', ['Sound bites/Click.m4a', 'Songs/Tune.m4a']); a.queueRemove('Songs/Tune.m4a', 1); a.setLoop('Songs/Tune.m4a', true)
    const s = useAmbience.getState()
    expect(s.sounds[1]).toMatchObject({ level: 6, queue: ['Sound bites/Click.m4a'], loop: true }); expect(s.level).toBe(-48)
    expect(JSON.parse(localStorage.getItem('slowverb.ambience')!).sounds).toHaveLength(2)
    a.toggleSound('Songs/Tune.m4a'); expect(useAmbience.getState().sounds).toHaveLength(1)
  })
})
