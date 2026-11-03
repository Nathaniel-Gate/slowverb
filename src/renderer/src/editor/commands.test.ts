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
  it('wave 3 keys are bound and Resolve-style', () => {
    const keyOf = (id: string) => COMMANDS.find((c) => c.id === id)?.keys
    expect(keyOf('tool.range')).toEqual(['R']); expect(keyOf('tool.rate')).toEqual(['Shift+R'])
    expect(keyOf('extend')).toEqual(['E']); expect(keyOf('trimSel.start')).toEqual(['Shift+[']); expect(keyOf('trimSel.end')).toEqual(['Shift+]'])
    expect(keyOf('marker')).toEqual(['M']); expect(keyOf('range.mute')).toEqual(['Alt+M'])
    expect(keyOf('split')).toContain('Cmd+\\'); expect(keyOf('fit')).toContain('Shift+Z')
    expect(collisions('Alt+F')[0]?.id).toBe('range.fadeIn'); expect(collisions('Alt+Shift+F')[0]?.id).toBe('range.fadeOut')
  })
  it('palette-only wave 3 commands exist', () => {
    const ids = COMMANDS.map((c) => c.id)
    for (const id of ['auto.sections', 'auto.trimSilence', 'auto.cut1', 'auto.cut2', 'auto.cut4', 'env.clear', 'fade.in.lin', 'fade.out.s', 'smooth.toggle', 'splitMarkers', 'dock.auto']) expect(ids, id).toContain(id)
  })
  it('range commands call the exact store actions', () => {
    const calls: string[] = []
    const base = { range: { a: 1, b: 2, tracks: null }, selection: [], markIn: null, markOut: null, project: { smoothCuts: false, markers: [] } }
    const s = new Proxy(base, { get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : (...a: unknown[]) => calls.push(`${k}(${a.join()})`)) }) as never
    const run = (id: string) => COMMANDS.find((c) => c.id === id)!.run(s)
    for (const id of ['range.mute', 'range.fadeIn', 'range.fadeOut', 'range.gainUp', 'range.gainDown', 'extend', 'trimSel.start', 'trimSel.end', 'splitMarkers', 'smooth.toggle', 'fade.in.log', 'env.clear', 'auto.cut4', 'lift', 'extract']) run(id)
    expect(calls).toEqual(['muteRange()', 'fadeRangeEdge(in)', 'fadeRangeEdge(out)', 'gainRangeDb(1)', 'gainRangeDb(-1)', 'extendEditToPlayhead()', 'trimStartToPlayhead()',
      'trimEndToPlayhead()', 'splitAtMarkers()', 'setSmoothCuts(true)', 'setFadeCurveSel(in,log)', 'clearEnvSelected()', 'cutEveryBeatsAction(4)', 'liftRangeSel()', 'extractRangeSel()'])
  })
  it('wave 4 loop keys are bound without collisions', () => {
    const keyOf = (id: string) => COMMANDS.find((c) => c.id === id)?.keys
    expect(keyOf('loop.make')).toEqual(['Alt+L']); expect(keyOf('loop.unloop')).toEqual(['Alt+Shift+L'])
    expect(keyOf('loop.in-')).toEqual(['Alt+[']); expect(keyOf('loop.in+')).toEqual(['Alt+]'])
    expect(keyOf('loop.out-')).toEqual(['Alt+Shift+[']); expect(keyOf('loop.out+')).toEqual(['Alt+Shift+]'])
    expect(keyOf('loop.in-fine')).toEqual(['Cmd+Alt+[']); expect(keyOf('loop.out+fine')).toEqual(['Cmd+Alt+Shift+]'])
    expect(keyOf('loop.count+')).toEqual(['Alt+=']); expect(keyOf('loop.count-')).toEqual(['Alt+-'])
    expect(COMMANDS.find((c) => c.id === 'loop.fill')).toBeDefined()
    for (const k of ['Alt+L', 'Alt+[', 'Alt+Shift+]', 'Alt+=']) expect(collisions(k).length, k).toBe(1)
    expect(collisions('L')[0]?.id).toBe('shuttle.fwd'); expect(collisions('Cmd+L')[0]?.id).toBe('loop')   // untouched
  })
  it('loop commands call the exact store actions', () => {
    const calls: string[] = []
    const loop = { id: 'lp1', count: 4, xfade: 0.04 }
    const base = { selection: ['c1'], selectedLoop: () => loop }
    const s = new Proxy(base, { get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : (...a: unknown[]) => calls.push(`${k}(${a.join()})`)) }) as never
    const run = (id: string) => COMMANDS.find((c) => c.id === id)!.run(s)
    for (const id of ['loop.in-', 'loop.in+', 'loop.out-', 'loop.out+', 'loop.in-fine', 'loop.out+fine', 'loop.fill', 'loop.unloop', 'loop.count+', 'loop.count-']) run(id)
    expect(calls).toEqual(['nudgeLoop(in,-0.001)', 'nudgeLoop(in,0.001)', 'nudgeLoop(out,-0.001)', 'nudgeLoop(out,0.001)', 'nudgeLoop(in,-0.01)', 'nudgeLoop(out,0.01)',
      'loopFillToPlayhead()', 'unloopSelection()', 'updateLoopLive(lp1,[object Object],loopcount:lp1)', 'showToast(Loop x4, crossfade 40 ms)', 'updateLoopLive(lp1,[object Object],loopcount:lp1)', 'showToast(Loop x4, crossfade 40 ms)'])
    const mk: string[] = []
    const m = new Proxy({ selection: ['c1'] }, { get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : (...a: unknown[]) => mk.push(`${k}(${a.join()})`)) }) as never
    COMMANDS.find((c) => c.id === 'loop.make')!.run(m); expect(mk).toEqual(['makeLoopFromSelection()'])
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
