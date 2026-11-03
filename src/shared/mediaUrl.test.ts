import { describe, expect, it } from 'vitest'
import { mediaUrl } from './mediaUrl'

describe('mediaUrl', () => {
  it('keeps # and ? inside the path so the main-process handler gets the whole file name', () => {
    const u = new URL(mediaUrl('/Music/Slowverb/Songs/Ryder - #skeptacore pt.3 (Lyrics)?.m4a'))
    expect(u.hash).toBe(''); expect(u.search).toBe('')
    expect(decodeURIComponent(u.pathname)).toBe('/Music/Slowverb/Songs/Ryder - #skeptacore pt.3 (Lyrics)?.m4a')
  })
  it('handles spaces, unicode and plain names', () => {
    expect(decodeURIComponent(new URL(mediaUrl('/a b/é.mp3')).pathname)).toBe('/a b/é.mp3')
    expect(mediaUrl('/x/y.mp3')).toBe('media://local/x/y.mp3')
  })
})
