import { describe, expect, it } from 'vitest'
import { afconvertArgs, phoneDest, phoneFileName } from './phoneNames'

describe('phone names', () => {
  it('builds safe .m4a names', () => {
    expect(phoneFileName('Helium (0.80x reverb)')).toBe('Helium (0.80x reverb).m4a')
    expect(phoneFileName('a/b:c')).toBe('a-b-c.m4a')
    expect(phoneFileName('   ')).toBe('Song.m4a')
    expect(phoneFileName('.hidden')).toBe('hidden.m4a')
  })
  it('puts a copy in the category folder of the song (Songs by default), flat', () => {
    expect(phoneDest('/icloud/Slowverb Phone', 'Songs', 'Run')).toBe('/icloud/Slowverb Phone/Songs/Run.m4a')
    expect(phoneDest('/icloud/Slowverb Phone', 'Songs/Gym/Deep', 'Run')).toBe('/icloud/Slowverb Phone/Songs/Run.m4a')
    expect(phoneDest('/icloud/Slowverb Phone', 'White noise', 'Rain')).toBe('/icloud/Slowverb Phone/White noise/Rain.m4a')
    expect(phoneDest('/icloud/Slowverb Phone', 'Sound bites/x', 'Click')).toBe('/icloud/Slowverb Phone/Sound bites/Click.m4a')
    expect(phoneDest('/icloud/Slowverb Phone', '', 'Loose')).toBe('/icloud/Slowverb Phone/Songs/Loose.m4a')
    expect(phoneDest('/r', '../../etc', 'x')).toBe('/r/Songs/x.m4a')
  })
  it('afconvert args are AAC in m4a at the requested bitrate', () => {
    expect(afconvertArgs('/t/in.wav', '/o/out.m4a', 192)).toEqual(['-f', 'm4af', '-d', 'aac', '-b', '192000', '/t/in.wav', '/o/out.m4a'])
  })
})
