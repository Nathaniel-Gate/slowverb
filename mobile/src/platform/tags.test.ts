import { describe, expect, it } from 'vitest'
import { readDuration, tagsFromName } from './tags'

describe('tagsFromName', () => {
  it('splits Artist - Title', () => expect(tagsFromName('Frank Ocean - Nights.m4a')).toEqual({ artist: 'Frank Ocean', title: 'Nights' }))
  it('keeps a Mac version suffix in the title', () => expect(tagsFromName('Helium (Slowed + Reverb).m4a')).toEqual({ artist: '', title: 'Helium (Slowed + Reverb)' }))
  it('never returns an empty title', () => expect(tagsFromName('.mp3').title).toBeTruthy())
})
describe('readDuration', () => {
  it('is 0 when there is no DOM', async () => expect(await readDuration(new Blob(['x']))).toBe(0))
})
