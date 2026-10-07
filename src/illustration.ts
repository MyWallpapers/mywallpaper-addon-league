import type { PlayerSnapshot } from './contract'
/** Fictional reference data, exclusively for native thumbnail mode and developer previews. */
export function illustration(now = Date.now()): PlayerSnapshot {
  const rows = [
    [222, true, 12, 4, 8, 2], [103, false, 3, 7, 4, 5], [32, true, 8, 2, 11, 24], [157, false, 1, 6, 9, 48],
  ] as const
  return {
    schemaVersion: 1, state: 'ready', capturedAtMs: now, expiresAtMs: now + 3600000, playerOptedIn: true,
    player: { gameName: 'Rayan', tagLine: 'EUW', platform: 'euw1', presence: 'playing', profileIconId: 29, level: 142,
      rank: { tier: 'EMERALD', division: 'II', lp: 42, change: 18, queueId: 420, wins: 168, losses: 144 },
      stats: { matches: 4, wins: 2, kills: 24, deaths: 19, assists: 32 }, statsScope: 'recent-ranked' },
    session: { queueId: 420, championId: 222, startedAtMs: now - 2537000, level: 18,
      kda: { kills: 12, deaths: 4, assists: 8 }, cs: 215, gold: 15430, items: [3031, 3072, 3046, 3006] },
    history: rows.map(([championId, win, kills, deaths, assists, hours], i) => ({ id: `EUW1_${1000000000 + i}`,
      queueId: 420, championId, endedAtMs: now - hours * 3600000, durationSeconds: 1900 + i * 137,
      win, kda: { kills, deaths, assists }, cs: 215 - i * 24, gold: 15430 - i * 1324, items: [3031, 3072, 3046, 3006] })),
  }
}
