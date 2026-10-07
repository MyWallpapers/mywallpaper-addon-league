import { createRemoteJWKSet, jwtVerify } from 'jose'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { randomToken, digest } from './store.mjs'

const issuer = 'https://auth.riotgames.com'
const platforms = Object.freeze({
  br1: { platform: 'br1', account: 'americas', regional: 'americas' },
  eun1: { platform: 'eun1', account: 'europe', regional: 'europe' },
  euw1: { platform: 'euw1', account: 'europe', regional: 'europe' },
  me1: { platform: 'me1', account: 'europe', regional: 'europe' },
  jp1: { platform: 'jp1', account: 'asia', regional: 'asia' },
  kr: { platform: 'kr', account: 'asia', regional: 'asia' },
  la1: { platform: 'la1', account: 'americas', regional: 'americas' },
  la2: { platform: 'la2', account: 'americas', regional: 'americas' },
  na1: { platform: 'na1', account: 'americas', regional: 'americas' },
  oc1: { platform: 'oc1', account: 'asia', regional: 'sea' },
  tr1: { platform: 'tr1', account: 'europe', regional: 'europe' },
  ru: { platform: 'ru', account: 'europe', regional: 'europe' },
  sg2: { platform: 'sg2', account: 'asia', regional: 'sea' },
  tw2: { platform: 'tw2', account: 'asia', regional: 'sea' },
  vn2: { platform: 'vn2', account: 'asia', regional: 'sea' },
})
const regionalHosts = new Set(['americas', 'europe', 'asia', 'sea'])
const supportedHosts = new Set([...regionalHosts, ...Object.values(platforms).map(value => value.platform)])
const queues = Object.freeze({ 420: 'RANKED_SOLO_5x5', 440: 'RANKED_FLEX_SR' })
const tiers = new Set(['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'])
const CORE_TTL = 5 * 60000
const LIVE_TTL = 60000
const SNAPSHOT_TTL = 2 * 60000
const jwks = createRemoteJWKSet(new URL(issuer + '/jwks.json'), { timeoutDuration: 8000 })
const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value)
const integer = (value, max = 1000000) => Number.isSafeInteger(value) && value >= 0 && value <= max
const epoch = value => integer(value, 8640000000000000)

export class RiotError extends Error {
  constructor(code, retryAfter = 60) { super(code); this.code = code; this.retryAfter = retryAfter }
}

async function json(response, limit) {
  if (!response.ok) {
    await response.body?.cancel()
    const header = response.headers.get('retry-after'), seconds = header === null ? NaN : Number(header)
    const code = response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limit' : 'upstream'
    throw new RiotError(code, Number.isFinite(seconds) ? Math.max(1, Math.min(3600, seconds)) : 60)
  }
  if (!response.body) throw new RiotError('invalid_response')
  const reader = response.body.getReader()
  let length = 0, chunks = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) throw new RiotError('invalid_response')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    if (error instanceof RiotError) throw error
    throw new RiotError('invalid_response')
  } finally { await reader.cancel().catch(() => {}) }
}

export function loadRiotConfig(env) {
  const readSecret = path => {
    if (!path) return ''
    const value = readFileSync(path, 'utf8').trim()
    if (!value || value.length > 8192 || /[\r\n]/u.test(value)) throw new Error('Invalid secret file')
    return value
  }
  const config = {
    approved: env.RIOT_LEAGUE_RSO_APPROVED === 'true',
    clientId: env.RIOT_LEAGUE_RSO_CLIENT_ID || '',
    clientSecret: readSecret(env.RIOT_LEAGUE_RSO_CLIENT_SECRET_FILE),
    apiKey: readSecret(env.RIOT_LEAGUE_API_KEY_FILE),
    budget: Number(env.RIOT_LEAGUE_REQUESTS_PER_MINUTE || 60),
  }
  if (!Number.isSafeInteger(config.budget) || config.budget < 1 || config.budget > 30000) throw new Error('Invalid Riot request budget')
  if (config.clientId.length > 256 || /[\u0000-\u001f]/u.test(config.clientId)) throw new Error('Invalid client ID')
  if (config.approved && (!config.clientId || !config.clientSecret || !config.apiKey)) throw new Error('Approved League RSO requires independent Riot credentials')
  return Object.freeze(config)
}

function snapshot(profile, core, live, state) {
  const now = Date.now()
  const details = profile.details
  return {
    schemaVersion: 1,
    state,
    playerOptedIn: true,
    capturedAtMs: now,
    expiresAtMs: now + SNAPSHOT_TTL,
    player: {
      gameName: details.gameName,
      tagLine: details.tagLine,
      platform: details.platform,
      presence: live?.presence || 'unknown',
      profileIconId: core?.profileIconId ?? null,
      level: core?.level ?? null,
      rank: core?.rank ?? null,
      stats: core?.stats ?? null,
      statsScope: 'recent-ranked',
    },
    session: live?.session ?? null,
    history: core?.history ?? [],
  }
}

function emptyCore() {
  return {
    profileIconId: null,
    level: null,
    rank: null,
    stats: null,
    history: [],
  }
}

function validateEntry(entry, queueId) {
  const tier = typeof entry?.tier === 'string' ? entry.tier.toUpperCase() : ''
  const isUnranked = tier === 'UNRANKED'
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)
  const division = typeof entry?.rank === 'string' ? entry.rank.toUpperCase() : ''
  if (!integer(entry?.wins) || !integer(entry?.losses) || entry.wins > 1000000 || entry.losses > 1000000) return null
  if (isUnranked) return { tier: 'UNRANKED', division: null, lp: null, change: null, queueId, wins: entry.wins, losses: entry.losses }
  if (!tiers.has(tier) || !integer(entry?.leaguePoints, 100000) || (!apex && !['I', 'II', 'III', 'IV'].includes(division))
    || (apex && division && !['I', 'II', 'III', 'IV'].includes(division))) return null
  return { tier, division: apex ? null : division, lp: entry.leaguePoints, change: null, queueId, wins: entry.wins, losses: entry.losses }
}

function rankedInfo(entries, queueId) {
  const queueType = queues[queueId]
  if (!Array.isArray(entries)) return null
  const entry = entries.find(value => value?.queueType === queueType)
  if (!entry) return { tier: 'UNRANKED', division: null, lp: null, change: null, queueId, wins: 0, losses: 0 }
  return validateEntry(entry, queueId)
}

function matchStats(match, puuid, queueId) {
  const info = match?.info
  if (!info || info.queueId !== queueId || !Array.isArray(info.participants) || !integer(info.gameDuration, 86400)) return null
  const player = info.participants.find(value => value?.puuid === puuid)
  const stats = player
  if (!stats || !integer(stats.kills, 10000) || !integer(stats.deaths, 10000) || !integer(stats.assists, 10000)
    || !integer(stats.totalMinionsKilled, 100000) || !integer(stats.neutralMinionsKilled, 100000)
    || stats.totalMinionsKilled + stats.neutralMinionsKilled > 100000
    || !integer(stats.goldEarned, 1000000) || !integer(stats.championId, 10000) || typeof stats.win !== 'boolean') return null
  const endedAtMs = epoch(info.gameEndTimestamp) && info.gameEndTimestamp > 0
    ? info.gameEndTimestamp
    : epoch(info.gameCreation) && info.gameCreation > 0 ? info.gameCreation + info.gameDuration * 1000 : null
  if (!epoch(endedAtMs) || endedAtMs > Date.now()) return null
  const items = []
  for (let slot = 0; slot <= 6; slot++) {
    const item = stats['item' + slot]
    if (integer(item, 100000) && item > 0) items.push(item)
  }
  return {
    id: match.metadata?.matchId,
    queueId,
    championId: stats.championId,
    endedAtMs,
    durationSeconds: info.gameDuration,
    win: stats.win,
    kda: { kills: stats.kills, deaths: stats.deaths, assists: stats.assists },
    cs: stats.totalMinionsKilled + stats.neutralMinionsKilled,
    gold: stats.goldEarned,
    items,
  }
}

function summarizeMatches(matches) {
  const totals = { matches: matches.length, wins: 0, kills: 0, deaths: 0, assists: 0 }
  for (const match of matches) {
    if (match.win) totals.wins++
    totals.kills += match.kda.kills
    totals.deaths += match.kda.deaths
    totals.assists += match.kda.assists
  }
  return totals
}

function sessionFromGame(game, puuid) {
  if (!game || !Array.isArray(game.participants)) return { presence: 'unknown', session: null }
  const owner = game.participants.find(value => value?.puuid === puuid)
  if (!owner || !integer(game.gameQueueConfigId, 10000) || !integer(owner.championId, 10000)) return { presence: 'unknown', session: null }
  return {
    presence: 'playing',
    session: {
      queueId: game.gameQueueConfigId,
      championId: owner.championId,
      startedAtMs: epoch(game.gameStartTime) && game.gameStartTime > 0 && game.gameStartTime <= Date.now() ? game.gameStartTime : null,
      level: null,
      kda: null,
      cs: null,
      gold: null,
      items: null,
    },
  }
}

export function createRiot(config, transport = fetch, keySet = jwks) {
  // One bounded, serialized outbound budget per instance, shared by all profiles.
  let tail = Promise.resolve(), nextRequest = 0, blockedUntil = 0, waiting = 0
  const shutdown = new AbortController()
  const cache = new Map()
  const cacheLimit = Number.isSafeInteger(config.maxProfiles) ? Math.max(1, Math.min(config.maxProfiles, 10000)) : 1000

  function entryFor(id) {
    let entry = cache.get(id)
    if (!entry) {
      entry = {
        lastAccess: Date.now(),
        controller: new AbortController(),
        fields: {
          summoner: { value: null, expiresAt: 0, retryAt: 0, inFlight: null },
          rank: { value: null, expiresAt: 0, retryAt: 0, inFlight: null },
          recent: { value: null, expiresAt: 0, retryAt: 0, inFlight: null },
          live: { value: null, expiresAt: 0, retryAt: 0, inFlight: null },
        },
      }
      cache.set(id, entry)
      if (cache.size > cacheLimit) {
        const oldest = cache.keys().next().value
        cache.get(oldest)?.controller.abort()
        cache.delete(oldest)
      }
    } else {
      entry.lastAccess = Date.now()
      cache.delete(id)
      cache.set(id, entry)
    }
    return entry
  }

  async function api(host, path, authorization, profileSignal) {
    if (!supportedHosts.has(host) || !path.startsWith('/') || path.length > 2048) throw new RiotError('invalid_request')
    if (waiting >= 40) throw new RiotError('busy')
    waiting++
    const operation = tail.then(async () => {
      profileSignal?.throwIfAborted()
      if (Date.now() < blockedUntil) throw new RiotError('rate_limit', Math.ceil((blockedUntil - Date.now()) / 1000))
      const wait = Math.max(0, nextRequest - Date.now())
      if (wait) await delay(wait, undefined, { signal: profileSignal
        ? AbortSignal.any([shutdown.signal, profileSignal])
        : shutdown.signal })
      profileSignal?.throwIfAborted()
      nextRequest = Date.now() + Math.ceil(60000 / config.budget)
      const signals = [shutdown.signal, AbortSignal.timeout(8000)]
      if (profileSignal) signals.unshift(profileSignal)
      const response = await transport('https://' + host + '.api.riotgames.com' + path, {
        method: 'GET',
        headers: authorization || { 'X-Riot-Token': config.apiKey },
        signal: AbortSignal.any(signals),
        redirect: 'error',
      })
      try { return await json(response, 2 * 1024 * 1024) }
      catch (error) { if (error.code === 'rate_limit') blockedUntil = Date.now() + error.retryAfter * 1000; throw error }
    })
    tail = operation.catch(() => {})
    try { return await operation } finally { waiting-- }
  }

  async function updateField(profile, entry, fieldName, ttl, loader, onErrorValue) {
    const field = entry.fields[fieldName], now = Date.now()
    if (field.value !== null && field.expiresAt > now) return field.value
    if (field.inFlight) return field.inFlight
    if (field.retryAt > now) return field.value
    const pending = Promise.resolve().then(loader).then(value => {
      if (cache.get(profile.id) === entry) {
        field.value = value
        field.expiresAt = Date.now() + ttl
        field.retryAt = 0
      }
      return value
    }).catch(error => {
      if (cache.get(profile.id) === entry) {
        field.value = onErrorValue(error, field.value)
        const retry = Number(error?.retryAfter)
        field.retryAt = Date.now() + (Number.isFinite(retry) ? Math.max(60, Math.min(3600, retry)) : 60) * 1000
      }
      return field.value
    }).finally(() => { field.inFlight = null })
    field.inFlight = pending
    return pending
  }

  function validConnection(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      && typeof value.platform === 'string' && typeof value.queueId === 'number' && Number.isSafeInteger(value.queueId)
      && Object.hasOwn(platforms, value.platform) && Object.hasOwn(queues, value.queueId)
      ? { platform: value.platform, queueId: value.queueId }
      : null
  }

  return {
    issuer,
    close() {
      shutdown.abort()
      for (const entry of cache.values()) entry.controller.abort()
      cache.clear()
    },
    forget(profileId) {
      const entry = cache.get(profileId)
      entry?.controller.abort()
      cache.delete(profileId)
    },
    sweep() {
      const cutoff = Date.now() - CORE_TTL
      for (const [id, entry] of cache) {
        if (entry.lastAccess < cutoff && Object.values(entry.fields).every(field => !field.inFlight)) {
          entry.controller.abort()
          cache.delete(id)
        }
      }
    },
    validateConnection: validConnection,
    authorization() {
      const state = randomToken(), verifier = randomToken(), nonce = randomToken()
      const url = new URL(issuer + '/authorize')
      for (const [key, value] of Object.entries({
        client_id: config.clientId,
        redirect_uri: config.origin + '/oauth/callback',
        response_type: 'code',
        scope: 'openid',
        state,
        nonce,
        code_challenge: Buffer.from(digest(verifier), 'hex').toString('base64url'),
        code_challenge_method: 'S256',
      })) url.searchParams.set(key, value)
      return { url: url.href, state, verifier, nonce }
    },
    async identity(code, flow) {
      const response = await transport(issuer + '/token', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(8000)]),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(encodeURIComponent(config.clientId) + ':' + encodeURIComponent(config.clientSecret)).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.origin + '/oauth/callback',
          code_verifier: flow.verifier,
        }),
      })
      const tokens = await json(response, 65536)
      if (!validText(tokens.access_token, 16384) || !validText(tokens.id_token, 32768) || tokens.token_type?.toLowerCase() !== 'bearer') throw new RiotError('invalid_identity')
      const { payload } = await jwtVerify(tokens.id_token, keySet, {
        issuer,
        audience: config.clientId,
        algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
        maxTokenAge: '10m',
      })
      if (!validText(payload.sub, 128) || payload.nonce !== flow.nonce) throw new RiotError('invalid_identity')
      const route = platforms[flow.connection.platform]
      if (!route) throw new RiotError('invalid_identity')
      const account = await api(route.account, '/riot/account/v1/accounts/me', { Authorization: 'Bearer ' + tokens.access_token })
      if (!validText(account.puuid, 128) || !validText(account.gameName, 32) || !validText(account.tagLine, 16)) throw new RiotError('invalid_identity')
      // Access/ID tokens are deliberately not persisted or returned to the client.
      return {
        subject: account.puuid,
        displayName: account.gameName + '#' + account.tagLine,
        details: {
          gameName: account.gameName,
          tagLine: account.tagLine,
          platform: flow.connection.platform,
          queueId: flow.connection.queueId,
        },
      }
    },
    emptySnapshot(profile) {
      return snapshot(profile, emptyCore(), null, 'loading')
    },
    async fetchSnapshot(profile) {
      const route = platforms[profile.details.platform]
      const queueId = profile.details.queueId
      if (!route || !Object.hasOwn(queues, queueId) || !validText(profile.subject, 128)) throw new RiotError('invalid_profile')
      const entry = entryFor(profile.id)
      const puuid = encodeURIComponent(profile.subject)
      const safeCore = emptyCore()
      const [summoner, rank, recent, live] = await Promise.all([
        updateField(profile, entry, 'summoner', CORE_TTL,
          async () => {
            const value = await api(route.platform, '/lol/summoner/v4/summoners/by-puuid/' + puuid, undefined, entry.controller.signal)
            return {
              profileIconId: integer(value.profileIconId, 100000) ? value.profileIconId : null,
              level: integer(value.summonerLevel, 100000) ? value.summonerLevel : null,
            }
          }, () => null),
        updateField(profile, entry, 'rank', CORE_TTL,
          async () => {
            const values = await api(route.platform, '/lol/league/v4/entries/by-puuid/' + puuid, undefined, entry.controller.signal)
            const value = rankedInfo(values, queueId)
            if (!value) throw new RiotError('invalid_response')
            return value
          }, () => null),
        updateField(profile, entry, 'recent', CORE_TTL,
          async () => {
            const idPath = '/lol/match/v5/matches/by-puuid/' + puuid + '/ids?queue=' + queueId + '&start=0&count=10'
            const ids = await api(route.regional, idPath, undefined, entry.controller.signal)
            if (!Array.isArray(ids)) throw new RiotError('invalid_response')
            const selected = [...new Set(ids.filter(value => validText(value, 80) && /^[A-Z0-9]+_[0-9]+$/u.test(value)))].slice(0, 10)
            const matches = []
            for (const id of selected) {
              if (cache.get(profile.id) !== entry) break
              try {
                const raw = await api(route.regional, '/lol/match/v5/matches/' + encodeURIComponent(id), undefined, entry.controller.signal)
                const summary = matchStats(raw, profile.subject, queueId)
                if (!summary || summary.id !== id || !validText(summary.id, 80) || !/^[A-Z0-9]+_[0-9]+$/u.test(summary.id)) continue
                matches.push(summary)
              } catch { /* One unavailable detail does not erase other owner-only match summaries. */ }
            }
            const unique = [...new Map(matches.map(value => [value.id, value])).values()].slice(0, 10)
            return { stats: summarizeMatches(unique), history: unique }
          }, () => null),
        updateField(profile, entry, 'live', LIVE_TTL,
          async () => {
            try {
              const game = await api(route.platform, '/lol/spectator/v5/active-games/by-summoner/' + puuid, undefined, entry.controller.signal)
              return sessionFromGame(game, profile.subject)
            } catch (error) {
              if (error.code === 'not_found') return { presence: 'not-playing', session: null }
              throw error
            }
          }, () => ({ presence: 'unknown', session: null })),
      ])
      if (summoner) {
        safeCore.profileIconId = summoner.profileIconId
        safeCore.level = summoner.level
      }
      if (rank) safeCore.rank = rank
      if (recent) {
        safeCore.stats = recent.stats
        safeCore.history = recent.history
      }
      const fields = entry.fields
      const hadAnyData = Boolean(fields.summoner.value || fields.rank.value || fields.recent.value)
      const hasRefreshFailure = [fields.summoner, fields.rank, fields.recent, fields.live].some(field => field.retryAt > Date.now())
      const state = hadAnyData ? 'ready' : hasRefreshFailure ? 'error' : 'loading'
      return snapshot(profile, safeCore, live, state)
    },
  }
}
