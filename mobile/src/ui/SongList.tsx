import { useState } from 'react'
import { usePlayer } from '../state/player.store'
import { useSettings } from '../state/settings.store'
import { useLibrary } from '../state/library.store'
import { SongRow } from './SongRow'
import { SongSheet } from './SongSheet'
import type { Song } from './types'

/** A list of songs (a category, or one playlist) as rows. Tapping plays it with THIS list as the queue, so next / previous / auto-advance stay inside it. */
export function SongList({ songs, listId, openPlayer }: { songs: Song[]; listId: string | null; openPlayer(): void }) {
  const remove = useLibrary((s) => s.remove)
  const { cur, playing, play } = usePlayer()
  const playOnTap = useSettings((s) => s.playOnTap)
  const [openId, setOpenId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ song: Song; edit: boolean } | null>(null)
  const queue = songs.map((s) => s.id)
  const tap = (s: Song) => {
    if (s.id === cur) return openPlayer()
    if (playOnTap) void play(s.id, queue); else setSheet({ song: s, edit: false })
  }
  return (
    <div onPointerDown={(e) => { if (openId && !(e.target as HTMLElement).closest('.song')) setOpenId(null) }}>
      <ul className="songs">
        {songs.map((s, i) => (
          <SongRow key={s.id} song={s} index={i} current={s.id === cur} playing={playing} open={openId === s.id}
            onTap={() => tap(s)} onLong={() => { setOpenId(null); setSheet({ song: s, edit: false }) }}
            onOpen={(o) => setOpenId(o ? s.id : openId === s.id ? null : openId)}
            onEdit={() => setSheet({ song: s, edit: true })} onDelete={() => { setOpenId(null); void remove(s.id) }} />
        ))}
      </ul>
      {sheet && <SongSheet song={sheet.song} startEdit={sheet.edit} listId={listId} onClose={() => setSheet(null)} onPlay={() => { void play(sheet.song.id, queue) }} />}
    </div>
  )
}
