import { CONFIG } from '../config'

// Per-song resume position in seconds, persisted in localStorage (falls back to memory when storage is blocked).
let mem: Record<string, number> = {}
const read = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(CONFIG.keys.positions) ?? '{}') } catch { return mem }
}
const write = (m: Record<string, number>) => {
  mem = m
  try { localStorage.setItem(CONFIG.keys.positions, JSON.stringify(m)) } catch { /* private mode: memory only */ }
}
export const getPos = (id: string): number => read()[id] ?? 0
export const savePos = (id: string, sec: number) => write({ ...read(), [id]: Math.round(sec * 10) / 10 })
export const clearPos = (id: string) => { const m = read(); if (id in m) { delete m[id]; write(m) } }
