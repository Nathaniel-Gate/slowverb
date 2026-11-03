import { describe, expect, it } from 'vitest'
import { dbOf, fmtTime, gainOf, parseNum, parseTime } from './timecode'

describe('timecode', () => {
  it('formats', () => { expect(fmtTime(83.456)).toBe('1:23.456'); expect(fmtTime(0)).toBe('0:00.000'); expect(fmtTime(3725.5)).toBe('1:02:05.500') })
  it('parses common entries', () => {
    expect(parseTime('83.5')).toBeCloseTo(83.5); expect(parseTime('1:23.456')).toBeCloseTo(83.456); expect(parseTime('1:02:03')).toBe(3723)
    expect(parseTime('2:')).toBe(120); expect(parseTime('1m30s')).toBe(90); expect(parseTime('1,5')).toBe(1.5)
  })
  it('rejects junk', () => { expect(parseTime('')).toBeNull(); expect(parseTime('abc')).toBeNull(); expect(parseTime('1:2:3:4')).toBeNull(); expect(parseTime('-3')).toBeNull() })
  it('numbers and db', () => {
    expect(parseNum('-6 dB')).toBe(-6); expect(parseNum('125%')).toBe(125); expect(parseNum('x')).toBeNull()
    expect(dbOf(1)).toBe(0); expect(gainOf(-6)).toBeCloseTo(0.501, 2); expect(dbOf(0)).toBe(-Infinity)
  })
})
