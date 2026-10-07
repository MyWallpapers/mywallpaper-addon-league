import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { parseSnapshot } from '../../src/contract.ts'
import { createRiot, loadRiotConfig } from '../src/riot.mjs'

const config = { origin: 'https://service.example', clientId: 'league-client', clientSecret: 'league-private', apiKey: 'league-api', budget: 30000, maxProfiles: 1000 }
const reply = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const profile = { id: 'a'.repeat(24), subject: 'owner-puuid', details: { platform: 'euw1', queueId: 420, gameName: 'Owner', tagLine: 'EUW' } }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('League activation uses its own credentials and accepts only fixed platform and queue choices', () => {
  assert.equal(loadRiotConfig({}).approved, false)
  assert.throws(() => loadRiotConfig({ RIOT_LEAGUE_RSO_APPROVED: 'true' }))
  const provider = createRiot(config)
  assert.deepEqual(provider.validateConnection({ platform: 'euw1', queueId: 420, host: 'https://evil.example' }), { platform: 'euw1', queueId: 420 })
  assert.deepEqual(provider.validateConnection({ platform: 'me1', queueId: 440 }), { platform: 'me1', queueId: 440 })
  for (const connection of [
    { platform: '__proto__', queueId: 420 },
    { platform: ['euw1'], queueId: 420 },
    { platform: 'ph2', queueId: 420 },
    { platform: 'th2', queueId: 440 },
    { platform: 'euw1', queueId: 999 },
    { platform: 'euw1', queueId: '420' },
  ]) assert.equal(provider.validateConnection(connection), null)
  const flow = provider.authorization(), url = new URL(flow.url)
  assert.equal(url.origin, 'https://auth.riotgames.com')
  assert.equal(url.searchParams.get('scope'), 'openid')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://service.example/oauth/callback')
  provider.close()
})

test('identity verifies signed nonce, audience, issuer, and calls accounts/me with the RSO token', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  const key = { ...await exportJWK(publicKey), kid: 'test', alg: 'ES256' }
  let mode = 'valid', calls = []
  const transport = async (url, options) => {
    calls.push({ url, options })
    if (url === 'https://auth.riotgames.com/token') {
      const token = await new SignJWT({ nonce: mode === 'nonce' ? 'wrong' : 'nonce' }).setProtectedHeader({ alg: 'ES256', kid: 'test' })
        .setIssuer(mode === 'issuer' ? 'https://evil.example' : 'https://auth.riotgames.com')
        .setAudience(mode === 'audience' ? 'wrong' : 'league-client')
        .setSubject(mode === 'subject' ? 'other-puuid' : 'owner-puuid')
        .setIssuedAt().setExpirationTime('5m').sign(privateKey)
      return reply({ access_token: 'private-access', id_token: token, token_type: 'Bearer' })
    }
    assert.equal(url, 'https://europe.api.riotgames.com/riot/account/v1/accounts/me')
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.Authorization, 'Bearer private-access')
    return reply({ puuid: 'owner-puuid', gameName: 'Player', tagLine: 'EUW' })
  }
  const provider = createRiot(config, transport, createLocalJWKSet({ keys: [key] }))
  try {
    const flow = { nonce: 'nonce', verifier: 'verifier', connection: { platform: 'euw1', queueId: 420 } }
    const account = await provider.identity('code', flow)
    assert.deepEqual(account, {
      subject: 'owner-puuid',
      displayName: 'Player#EUW',
      details: { gameName: 'Player', tagLine: 'EUW', platform: 'euw1', queueId: 420 },
    })
    assert.equal(new URLSearchParams(calls[0].options.body).get('code_verifier'), 'verifier')
    assert.equal(JSON.stringify(account).includes('private-access'), false)
    mode = 'subject'; calls = []
    const independent = await provider.identity('code', flow)
    assert.equal(independent.subject, 'owner-puuid')
    assert.equal(calls.length, 2)
    for (const invalid of ['nonce', 'issuer', 'audience']) {
      mode = invalid; calls = []
      await assert.rejects(provider.identity('code', flow))
      assert.equal(calls.length, 1)
    }
  } finally { provider.close() }
})

function matchFixture(id, values = {}) {
  return {
    metadata: { matchId: id },
    info: {
      queueId: 420,
      gameDuration: 1890,
      gameCreation: 1700000000000,
      gameEndTimestamp: values.endedAt,
      participants: [
        {
          puuid: 'owner-puuid', championId: values.championId ?? 81,
          kills: values.kills ?? 4, deaths: values.deaths ?? 1, assists: values.assists ?? 7,
          totalMinionsKilled: values.minions ?? 150, neutralMinionsKilled: values.neutral ?? 12,
          goldEarned: values.gold ?? 14000, win: values.win ?? true,
          item0: 1001, item1: 3006, item2: 0, item3: 0, item4: 0, item5: 0, item6: 3363,
        },
        { puuid: 'opponent-secret', championId: 999, kills: 99, deaths: 0, assists: 0, totalMinionsKilled: 999, neutralMinionsKilled: 0 },
      ],
    },
  }
}

test('snapshot matches the addon contract and bounds ranked history to owner-only match data', async () => {
  const calls = []
  const transport = async (url, options) => {
    calls.push({ url, options })
    assert.equal(options.headers['X-Riot-Token'], 'league-api')
    const parsed = new URL(url)
    if (parsed.pathname.includes('/lol/summoner/v4/summoners/by-puuid/')) return reply({ puuid: 'owner-puuid', profileIconId: 123, summonerLevel: 200 })
    if (parsed.pathname.includes('/lol/league/v4/entries/by-puuid/')) return reply([
      { queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'II', leaguePoints: 74, wins: 40, losses: 30 },
      { queueType: 'RANKED_FLEX_SR', tier: 'GOLD', rank: 'I', leaguePoints: 20, wins: 10, losses: 8 },
    ])
    if (parsed.pathname.endsWith('/ids')) {
      assert.equal(parsed.searchParams.get('queue'), '420')
      assert.equal(parsed.searchParams.get('count'), '10')
      return reply(['EUW1_1', 'EUW1_2', 'EUW1_3'])
    }
    if (parsed.pathname.endsWith('/EUW1_1')) return reply(matchFixture('EUW1_1', { endedAt: 1700001890000 }))
    if (parsed.pathname.endsWith('/EUW1_2')) return reply(matchFixture('EUW1_2', { endedAt: 0, kills: 3, deaths: 2, assists: 5, minions: 200, neutral: 10, gold: 17000, win: false }))
    if (parsed.pathname.endsWith('/EUW1_3')) return reply({ metadata: { matchId: 'EUW1_3' }, info: { queueId: 440 } })
    if (parsed.pathname.includes('/lol/spectator/v5/active-games/by-summoner/')) return reply({
      gameQueueConfigId: 420, gameStartTime: 1700001000000,
      participants: [
        { puuid: 'owner-puuid', championId: 81, profileIconId: 123 },
        { puuid: 'opponent-secret', championId: 999 },
      ],
    })
    throw new Error('Unexpected Riot route: ' + url)
  }
  const provider = createRiot(config, transport)
  try {
    const snapshot = await provider.fetchSnapshot(profile)
    assert.ok(parseSnapshot(snapshot), 'the real League adapter snapshot is accepted by the addon contract')
    assert.deepEqual(Object.keys(snapshot).sort(), ['capturedAtMs', 'expiresAtMs', 'history', 'player', 'playerOptedIn', 'schemaVersion', 'session', 'state'].sort())
    assert.equal(snapshot.schemaVersion, 1)
    assert.equal(snapshot.state, 'ready')
    assert.equal(snapshot.playerOptedIn, true)
    assert.deepEqual(snapshot.player, {
      gameName: 'Owner', tagLine: 'EUW', platform: 'euw1', presence: 'playing',
      profileIconId: 123, level: 200,
      rank: { tier: 'DIAMOND', division: 'II', lp: 74, change: null, queueId: 420, wins: 40, losses: 30 },
      stats: { matches: 2, wins: 1, kills: 7, deaths: 3, assists: 12 },
      statsScope: 'recent-ranked',
    })
    assert.deepEqual(snapshot.session, {
      queueId: 420, championId: 81, startedAtMs: 1700001000000,
      level: null, kda: null, cs: null, gold: null, items: null,
    })
    assert.equal(snapshot.history.length, 2)
    assert.deepEqual(snapshot.history[0], {
      id: 'EUW1_1', queueId: 420, championId: 81, endedAtMs: 1700001890000, durationSeconds: 1890,
      win: true, kda: { kills: 4, deaths: 1, assists: 7 }, cs: 162, gold: 14000, items: [1001, 3006, 3363],
    })
    assert.equal(snapshot.history[1].endedAtMs, 1700000000000 + 1890 * 1000)
    assert.equal(snapshot.history[1].durationSeconds, 1890)
    assert.equal(JSON.stringify(snapshot).includes('opponent-secret'), false)
    assert.equal(calls.filter(call => /EUW1_[123]$/.test(new URL(call.url).pathname)).length, 3)
    assert.ok(calls.some(call => call.url.startsWith('https://euw1.api.riotgames.com/lol/summoner/')))
    assert.ok(calls.some(call => call.url.startsWith('https://euw1.api.riotgames.com/lol/league/')))
    assert.ok(calls.some(call => call.url.startsWith('https://euw1.api.riotgames.com/lol/spectator/')))
    assert.ok(calls.some(call => call.url.startsWith('https://europe.api.riotgames.com/lol/match/')))
    const count = calls.length
    await provider.fetchSnapshot(profile)
    assert.equal(calls.length, count)
    provider.forget(profile.id)
    await provider.fetchSnapshot(profile)
    assert.equal(calls.length, count * 2)
  } finally { provider.close() }
})

test('spectator 404 is not-playing; a spectator 429 leaves cached rank and history intact', async () => {
  let spectatorStatus = 404
  const transport = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(options.headers['X-Riot-Token'], 'league-api')
    if (parsed.pathname.includes('/lol/summoner/v4/summoners/by-puuid/')) return reply({ profileIconId: 1, summonerLevel: 10 })
    if (parsed.pathname.includes('/lol/league/v4/entries/by-puuid/')) return reply([])
    if (parsed.pathname.endsWith('/ids')) return reply([])
    if (parsed.pathname.includes('/lol/spectator/v5/active-games/by-summoner/')) {
      return spectatorStatus === 404
        ? new Response('', { status: 404 })
        : new Response('', { status: 429, headers: { 'Retry-After': '120' } })
    }
    throw new Error('Unexpected Riot route: ' + url)
  }
  const provider = createRiot(config, transport)
  const realNow = Date.now
  try {
    const first = await provider.fetchSnapshot(profile)
    assert.equal(first.player.presence, 'not-playing')
    assert.deepEqual(first.player.rank, { tier: 'UNRANKED', division: null, lp: null, change: null, queueId: 420, wins: 0, losses: 0 })
    assert.deepEqual(first.player.stats, { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 })
    spectatorStatus = 429
    Date.now = () => realNow() + 61000
    const second = await provider.fetchSnapshot(profile)
    assert.equal(second.player.presence, 'unknown')
    assert.deepEqual(second.player.rank, first.player.rank)
    assert.deepEqual(second.player.stats, first.player.stats)
    assert.deepEqual(second.history, first.history)
  } finally {
    Date.now = realNow
    provider.close()
  }
})

test('global Riot 429 sets a shared retry window without a request storm', async () => {
  let calls = 0
  const provider = createRiot(config, async () => {
    calls++
    return new Response('', { status: 429, headers: { 'Retry-After': '120' } })
  })
  try {
    const snapshot = await provider.fetchSnapshot(profile)
    assert.equal(snapshot.state, 'error')
    assert.equal(snapshot.player.presence, 'unknown')
    assert.equal(calls, 1)
    await provider.fetchSnapshot(profile)
    assert.equal(calls, 1)
  } finally { provider.close() }
})

test('forget aborts in-flight profile requests and prevents queued requests from starting', async () => {
  let calls = 0, signalStarted, signalAborted
  const started = new Promise(resolve => { signalStarted = resolve })
  const aborted = new Promise(resolve => { signalAborted = resolve })
  const provider = createRiot(config, async (_url, { signal }) => {
    calls++
    signalStarted()
    signal.addEventListener('abort', () => {
      signalAborted()
    }, { once: true })
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  })
  try {
    const pending = provider.fetchSnapshot(profile)
    await started
    provider.forget(profile.id)
    await aborted
    const snapshot = await pending
    assert.equal(snapshot.state, 'loading')
    assert.equal(calls, 1)
  } finally { provider.close() }
})
