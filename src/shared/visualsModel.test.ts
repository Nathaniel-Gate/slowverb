import { describe, expect, it } from 'vitest'
import { classifyLink, groupOf, inVisuals, mediaKindOf, parsePinState, pinterestGroup, safeGroup, upsertBoard, emptyPinState } from './visualsModel'

describe('visuals model', () => {
  it('knows pictures from videos from everything else', () => {
    expect(mediaKindOf('/a/b.JPG')).toBe('image'); expect(mediaKindOf('/a/b.webp')).toBe('image')
    expect(mediaKindOf('/a/b.mp4')).toBe('video'); expect(mediaKindOf('/a/b.mov')).toBe('video')
    expect(mediaKindOf('/a/b.m4a')).toBeNull(); expect(mediaKindOf('/a/noext')).toBeNull()
  })
  it('groups files by their folder under Visuals', () => {
    expect(groupOf('pinterest/ng/mood/1.jpg', 'image')).toBe('pinterest/ng/mood')
    expect(groupOf('loose.jpg', 'image')).toBe('Images'); expect(groupOf('loose.mp4', 'video')).toBe('Videos')
    expect(inVisuals('Visuals/Images/a.jpg')).toBe(true); expect(inVisuals('Songs/Visuals.mp3')).toBe(false)
    expect(safeGroup('../..//.hidden/ok')).toBe('hidden/ok')   // no climbing out, never hidden
    expect(safeGroup('  ')).toBe('Images'); expect(safeGroup('.x')).toBe('x')
  })
  it('classifies pasted links', () => {
    expect(classifyLink('https://www.pinterest.com/ng/moodboard/')).toMatchObject({ kind: 'pinterest', target: 'board', label: 'ng/moodboard' })
    expect(classifyLink('https://uk.pinterest.com/ng/')).toMatchObject({ kind: 'pinterest', target: 'user' })
    expect(classifyLink('https://www.pinterest.co.uk/pin/123456/')).toMatchObject({ kind: 'pinterest', target: 'pin' })
    expect(classifyLink('https://pin.it/abc')).toMatchObject({ kind: 'pinterest', target: 'pin' })
    expect(classifyLink('pinterest.com/ng/moodboard/section')).toMatchObject({ kind: 'pinterest', target: 'section' })
    expect(classifyLink('youtu.be/abc', true)).toMatchObject({ kind: 'site' })
    expect(classifyLink('ng/moodboard', true)).toMatchObject({ kind: 'pinterest', target: 'board', url: 'https://www.pinterest.com/ng/moodboard/' })
    expect(classifyLink('https://x.com/a/pic.PNG?x=1')).toMatchObject({ kind: 'image' })
    expect(classifyLink('https://cdn.site/v/clip.mp4')).toMatchObject({ kind: 'video' })
    expect(classifyLink('https://www.youtube.com/watch?v=abc')).toMatchObject({ kind: 'site' })
    expect(classifyLink('')).toMatchObject({ kind: 'bad' }); expect(classifyLink('file:///etc/passwd')).toMatchObject({ kind: 'bad' })
  })
  it('names the folder a Pinterest link lands in', () => {
    const b = classifyLink('https://www.pinterest.com/ng/mood board/')
    expect(b.kind === 'pinterest' && pinterestGroup(b)).toBe('pinterest/ng/mood board')
  })
  it('keeps a saved board list, tolerating a broken file', () => {
    let s = upsertBoard(emptyPinState(), { url: 'u1', label: 'a/b' })
    s = upsertBoard(s, { url: 'u1', count: 5, lastSync: 9 }); s = upsertBoard(s, { url: 'u2' })
    expect(s.boards.map((b) => [b.url, b.count])).toEqual([['u1', 5], ['u2', 0]])
    expect(parsePinState(JSON.stringify(s))).toEqual(s)
    expect(parsePinState('not json')).toEqual(emptyPinState()); expect(parsePinState(null)).toEqual(emptyPinState())
  })
})
