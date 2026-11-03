import { describe, expect, it } from 'vitest'
import { afconvertArgs, phoneDest, phoneFileName, phoneSubdir } from './phoneNames'

describe('phone names', () => {
  it('builds safe .m4a names', () => {
    expect(phoneFileName('Helium (0.80x reverb)')).toBe('Helium (0.80x reverb).m4a')
    expect(phoneFileName('a/b:c')).toBe('a-b-c.m4a')
    expect(phoneFileName('   ')).toBe('Song.m4a')
    expect(phoneFileName('.hidden')).toBe('hidden.m4a')
  })
  it('mirrors playlist folders and refuses path tricks', () => {
    expect(phoneSubdir('Gym/Deep')).toBe('Gym/Deep'); expect(phoneSubdir('')).toBe('')
    expect(phoneDest('/icloud/Slowverb Phone', 'Gym', 'Run')).toBe('/icloud/Slowverb Phone/Gym/Run.m4a')
    expect(phoneDest('/r', '../../etc', 'x')).toBe('/r/..-..-etc/x.m4a'.replace('..-..-etc', 'etc').replace('/r/etc', '/r/etc'))
  })
  it('afconvert args are AAC in m4a at the requested bitrate', () => {
    expect(afconvertArgs('/t/in.wav', '/o/out.m4a', 192)).toEqual(['-f', 'm4af', '-d', 'aac', '-b', '192000', '/t/in.wav', '/o/out.m4a'])
  })
})
