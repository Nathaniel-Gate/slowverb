/** Subsequence match with bonuses for consecutive letters and word starts. Returns score + matched indexes, or null. */
export function fuzzy(query: string, text: string): { score: number; at: number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, ''), t = text.toLowerCase(), at: number[] = []
  let ti = 0, score = 0, prev = -2
  for (const ch of q) {
    const i = t.indexOf(ch, ti); if (i < 0) return null
    score += 1 + (i === prev + 1 ? 3 : 0) + (i === 0 || t[i - 1] === ' ' ? 4 : 0) - Math.min(i - ti, 5) * 0.2
    at.push(i); prev = i; ti = i + 1
  }
  return { score: score - t.length * 0.01, at }
}
