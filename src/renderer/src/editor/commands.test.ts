import { describe, expect, it } from 'vitest'
import { COMMANDS, collisions } from './commands'
import { DEFAULT_KEYS } from '../config/editorKeys'
import { keyId, formatKey, parseKey } from './keyparse'
import { fuzzy } from './fuzzy'
import { fmtTime, parseTime } from './timefmt'

describe('command registry', () => {
  it('ids are unique and every default key table entry has a command', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(DEFAULT_KEYS).filter((k) => !ids.includes(k))).toEqual([])
  })
  it('no default key is bound twice', () => {
    const seen = new Map<string, string>()
    for (const c of COMMANDS) for (const k of c.keys) {
      const id = keyId(k); expect(id, `${c.id} key ${k}`).not.toBeNull()
      expect(seen.get(id!), `${k} used by ${seen.get(id!)} and ${c.id}`).toBeUndefined(); seen.set(id!, c.id)
    }
  })
  it('collisions() finds a taken key', () => { expect(collisions('Cmd+Z', 'redo').map((c) => c.id)).toEqual(['undo']); expect(collisions('Cmd+Alt+9')).toEqual([]) })
})
describe('key strings', () => {
  it('parses to codes and formats as glyphs', () => {
    expect(parseKey('Cmd+Shift+K')).toEqual({ code: 'KeyK', meta: true, shift: true, alt: false })
    expect(parseKey("'")?.code).toBe('Quote'); expect(parseKey('Alt+Left')?.code).toBe('ArrowLeft')
    expect(formatKey('Cmd+Shift+K')).toBe('⌘⇧K'); expect(formatKey('Alt+Left')).toBe('⌥←')
  })
})
describe('palette fuzzy match', () => {
  it('matches subsequences, rejects others, prefers word starts', () => {
    expect(fuzzy('xyz', 'Add marker')).toBeNull()
    expect(fuzzy('am', 'Add marker')).not.toBeNull()
    expect(fuzzy('rip', 'Ripple trim')!.score).toBeGreaterThan(fuzzy('rip', 'Strip nothing')!.score)
  })
})
describe('time text', () => {
  it('round trips', () => {
    expect(fmtTime(83.4567)).toBe('1:23.457'); expect(fmtTime(59.9996)).toBe('1:00.000')
    expect(parseTime('1:23.456')).toBeCloseTo(83.456); expect(parseTime('83.4')).toBeCloseTo(83.4); expect(parseTime('abc')).toBeNull(); expect(parseTime('')).toBeNull()
  })
})
