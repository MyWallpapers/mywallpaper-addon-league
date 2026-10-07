export const layouts = ['rank', 'overview', 'session', 'rings', 'history'] as const
export type Layout = typeof layouts[number]
export type SnapshotState = 'unlinked' | 'loading' | 'ready' | 'offline' | 'error'
export const platforms = ['br1', 'eun1', 'euw1', 'jp1', 'kr', 'la1', 'la2', 'na1', 'oc1', 'tr1', 'ru', 'me1', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'] as const
export const tiers = ['UNRANKED', 'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'] as const
export interface Kda { kills: number; deaths: number; assists: number }
export interface RankedInfo {
  tier: typeof tiers[number]
  division: 'I' | 'II' | 'III' | 'IV' | null
  lp: number | null
  change: number | null
  queueId: 420 | 440
  wins: number
  losses: number
}
export interface MatchSummary {
  id: string
  queueId: 420 | 440
  championId: number
  endedAtMs: number
  durationSeconds: number
  win: boolean
  kda: Kda
  cs: number
  gold: number
  items: number[]
}
export interface PlayerSnapshot {
  schemaVersion: 1
  state: SnapshotState
  playerOptedIn: boolean
  capturedAtMs: number
  expiresAtMs: number
  player: {
    gameName: string
    tagLine: string
    platform: typeof platforms[number]
    presence: 'unknown' | 'playing' | 'not-playing'
    profileIconId: number | null
    level: number | null
    rank: RankedInfo | null
    stats: { matches: number; wins: number; kills: number; deaths: number; assists: number } | null
    statsScope: 'recent-ranked'
  } | null
  session: {
    queueId: number
    championId: number
    startedAtMs: number | null
    level: number | null
    kda: Kda | null
    cs: number | null
    gold: number | null
    items: number[] | null
  } | null
  history: MatchSummary[]
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const integer = (v: unknown, max = 1000000): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max
const epoch = (v: unknown): v is number => integer(v, 8640000000000000)
const text = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v)
const nullable = <T>(v: unknown, check: (v: unknown) => v is T): v is T | null => v === null || check(v)
function kda(v: unknown): v is Kda { return record(v) && integer(v.kills, 10000) && integer(v.deaths, 10000) && integer(v.assists, 10000) }
function items(v: unknown): v is number[] { return Array.isArray(v) && v.length <= 7 && v.every(n => integer(n, 100000)) }
function ranked(v: unknown): v is RankedInfo {
  if (!record(v) || !tiers.includes(v.tier as RankedInfo['tier']) || ![420, 440].includes(v.queueId as number)
    || !integer(v.wins) || !integer(v.losses) || !nullable(v.lp, (n): n is number => integer(n, 100000))
    || !(v.change === null || typeof v.change === 'number' && Number.isSafeInteger(v.change) && Math.abs(v.change) <= 100000)) return false
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(v.tier as string)
  if (v.tier === 'UNRANKED') return v.division === null && v.lp === null && v.change === null
  return v.lp !== null && (apex ? v.division === null : ['I', 'II', 'III', 'IV'].includes(v.division as string))
}
function player(v: unknown): v is NonNullable<PlayerSnapshot['player']> {
  return record(v) && text(v.gameName, 32) && text(v.tagLine, 16) && platforms.includes(v.platform as typeof platforms[number])
    && ['unknown', 'playing', 'not-playing'].includes(v.presence as string)
    && nullable(v.profileIconId, (n): n is number => integer(n, 100000)) && nullable(v.level, (n): n is number => integer(n, 100000))
    && nullable(v.rank, ranked) && v.statsScope === 'recent-ranked'
    && nullable(v.stats, (s): s is NonNullable<NonNullable<PlayerSnapshot['player']>['stats']> => record(s)
      && integer(s.matches, 10) && integer(s.wins, s.matches) && integer(s.kills, 100000) && integer(s.deaths, 100000) && integer(s.assists, 100000))
}
function session(v: unknown): v is NonNullable<PlayerSnapshot['session']> {
  return record(v) && integer(v.queueId, 10000) && integer(v.championId, 10000) && nullable(v.startedAtMs, epoch)
    && nullable(v.level, (n): n is number => integer(n, 100000)) && nullable(v.kda, kda)
    && nullable(v.cs, (n): n is number => integer(n, 100000)) && nullable(v.gold, (n): n is number => integer(n))
    && nullable(v.items, items)
}
function match(v: unknown): v is MatchSummary {
  return record(v) && text(v.id, 80) && /^[A-Z0-9]+_\d+$/u.test(v.id) && [420, 440].includes(v.queueId as number)
    && integer(v.championId, 10000) && epoch(v.endedAtMs) && integer(v.durationSeconds, 86400) && typeof v.win === 'boolean'
    && kda(v.kda) && integer(v.cs, 100000) && integer(v.gold) && items(v.items)
}
export function parseSnapshot(value: unknown): PlayerSnapshot | null {
  if (!record(value) || value.schemaVersion !== 1 || !['unlinked', 'loading', 'ready', 'offline', 'error'].includes(value.state as string)
    || !epoch(value.capturedAtMs) || !epoch(value.expiresAtMs) || value.expiresAtMs < value.capturedAtMs
    || typeof value.playerOptedIn !== 'boolean' || !nullable(value.player, player) || !nullable(value.session, session)
    || !Array.isArray(value.history) || value.history.length > 10 || !value.history.every(match)
    || new Set(value.history.map(v => v.id)).size !== value.history.length) return null
  if (!value.playerOptedIn && (value.player !== null || value.session !== null || value.history.length)) return null
  if (value.state === 'ready' && (!value.playerOptedIn || !value.player)) return null
  if (value.session && value.player?.presence !== 'playing') return null
  if (value.player?.presence === 'playing' && !value.session) return null
  return value as unknown as PlayerSnapshot
}
