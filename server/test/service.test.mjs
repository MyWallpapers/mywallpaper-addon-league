import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, CONSENT_VERSION } from '../src/config.mjs'
import { createStore, randomToken } from '../src/store.mjs'
import { createApp } from '../src/app.mjs'
import { sameToken, clientAddress } from '../src/http.mjs'

const account = { subject: 'test-player', displayName: 'Test#EUW', details: { platform: 'euw1', queueId: 420, gameName: 'Test', tagLine: 'EUW' } }
const sample = profile => ({ schemaVersion: 1, state: 'ready', playerOptedIn: true, capturedAtMs: Date.now(), expiresAtMs: Date.now() + 360000,
  player: { gameName: profile.details.gameName, tagLine: profile.details.tagLine, platform: profile.details.platform, presence: 'unknown',
    profileIconId: null, level: null, rank: null, stats: null, statsScope: 'recent-ranked' }, session: null, history: [] })
async function harness(t, approved = true, overrides = {}) {
  let identityCalls = 0, dataCalls = 0, forgotten = []
  const provider = {
    issuer: 'https://identity.example',
    validateConnection: value => value?.platform === 'euw1' && value?.queueId === 420 ? { platform: 'euw1', queueId: 420 } : null,
    authorization() { const state = randomToken(); return { state, nonce: randomToken(), verifier: randomToken(), url: `https://identity.example/authorize?state=${state}` } },
    async identity() { identityCalls++; return account },
    emptySnapshot: sample,
    async fetchSnapshot(profile) { dataCalls++; return sample(profile) },
    forget(id) { forgotten.push(id) },
    ...overrides,
  }
  const store = createStore(':memory:', CONSENT_VERSION)
  const config = { ...loadConfig({}), approved }
  const app = createApp(config, store, provider)
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${app.server.address().port}`
  t.after(() => app.close())
  const request = (path, options) => fetch(base + path, { redirect: 'manual', ...options })
  async function guest() {
    const response = await request('/api/session'), body = await response.json()
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/u)
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.csrf }
  }
  function actionHeaders(user) { return { Cookie: user.cookie, Origin: config.origin, 'X-CSRF-Token': user.csrf, 'Content-Type': 'application/json' } }
  async function begin(user, values = {}) {
    const response = await request('/api/connect', { method: 'POST', headers: actionHeaders(user),
      body: JSON.stringify({ accepted: true, consentVersion: CONSENT_VERSION, connection: { platform: 'euw1', queueId: 420 }, ...values }) })
    return { response, body: await response.json() }
  }
  async function link(user) {
    const { response, body } = await begin(user)
    assert.equal(response.status, 200)
    const state = new URL(body.url).searchParams.get('state')
    const callback = await request(`/oauth/callback?code=test&state=${state}`, { headers: { Cookie: user.cookie } })
    assert.equal(callback.status, 303)
    assert.equal(callback.headers.get('location'), '/')
    const cookie = callback.headers.get('set-cookie').split(';')[0]
    const own = await request('/api/session', { headers: { Cookie: cookie } }).then(r => r.json())
    return { cookie, csrf: own.csrf, id: own.profile.id, state }
  }
  return { store, app, request, guest, begin, link, actionHeaders, counts: () => ({ identityCalls, dataCalls }), forgotten: () => [...forgotten] }
}

test('configuration is closed by default and rejects incomplete activation or insecure origins', () => {
  assert.equal(loadConfig({}).approved, false)
  assert.throws(() => loadConfig({}, true))
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'http://public.example' }))
  assert.throws(() => loadConfig({ PUBLIC_ORIGIN: 'https://service.example/path' }))
  assert.equal(sameToken('é'.repeat(43), 'a'.repeat(43)), false)
  assert.throws(() => loadConfig({ TRUSTED_PROXY_IP: '*' }))
  assert.throws(() => loadConfig({ PROXY_CLIENT_IP_HEADER: 'x-forwarded-for' }))
})

test('client IP headers are accepted only from the configured proxy and as a single valid address', () => {
  const request = { socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-real-ip': '198.51.100.8' } }
  assert.equal(clientAddress(request, loadConfig({})), '127.0.0.1')
  const trusted = loadConfig({ TRUSTED_PROXY_IP: '127.0.0.1' })
  assert.equal(clientAddress(request, trusted), '198.51.100.8')
  assert.equal(clientAddress({ ...request, socket: { remoteAddress: '192.0.2.7' } }, trusted), '192.0.2.7')
  assert.equal(clientAddress({ ...request, headers: { 'x-real-ip': '198.51.100.8, 198.51.100.9' } }, trusted), '127.0.0.1')
  const cloudflare = loadConfig({ TRUSTED_PROXY_IP: '127.0.0.1', PROXY_CLIENT_IP_HEADER: 'cf-connecting-ip' })
  assert.equal(clientAddress({ ...request, headers: { 'cf-connecting-ip': '2001:db8::8' } }, cloudflare), '2001:db8::8')
})

test('disabled service never authenticates or fetches unconsented data', async t => {
  const h = await harness(t, false), user = await h.guest()
  assert.equal((await h.begin(user)).response.status, 503)
  const response = await h.request(`/api/profiles/${'a'.repeat(24)}`)
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/u)
  assert.deepEqual(h.counts(), { identityCalls: 0, dataCalls: 0 })
})

test('consent and mutations require the original session, origin and CSRF token', async t => {
  const h = await harness(t), user = await h.guest()
  assert.equal((await h.begin(user, { accepted: false })).response.status, 400)
  assert.equal((await h.begin(user, { consentVersion: 'old' })).response.status, 400)
  assert.equal((await h.begin(user, { connection: { platform: 'https://evil.example', queueId: 420 } })).response.status, 400)
  const headers = h.actionHeaders(user)
  for (const altered of [{ Origin: 'https://evil.example' }, { 'X-CSRF-Token': 'wrong' }, { Cookie: '' }]) {
    const response = await h.request('/api/connection', { method: 'DELETE', headers: { ...headers, ...altered } })
    assert.equal(response.status, 403)
  }
  assert.equal(h.store.profileCount(), 0)
})

test('OAuth callback is session-bound, single-use and rotates the session', async t => {
  const h = await harness(t), first = await h.guest(), other = await h.guest()
  const { body } = await h.begin(first), wrongState = new URL(body.url).searchParams.get('state')
  const wrong = await h.request(`/oauth/callback?code=test&state=${wrongState}`, { headers: { Cookie: other.cookie } })
  assert.equal(wrong.headers.get('location'), '/?connection=failed')
  assert.equal(h.counts().identityCalls, 0)
  const linked = await h.link(first)
  assert.notEqual(linked.cookie, first.cookie)
  const old = await h.request('/api/connection', { method: 'DELETE', headers: h.actionHeaders(first) })
  assert.equal(old.status, 403)
  const replay = await h.request(`/oauth/callback?code=test&state=${linked.state}`, { headers: { Cookie: linked.cookie } })
  assert.equal(replay.headers.get('location'), '/?connection=failed')
  assert.equal(h.counts().identityCalls, 1)
})

test('public reads deduplicate refreshes, and withdrawal also blocks a late result', async t => {
  let resolveData, calls = 0
  const pending = new Promise(resolve => { resolveData = resolve })
  const h = await harness(t, true, { fetchSnapshot: () => { calls++; return pending } }), user = await h.link(await h.guest())
  assert.ok(h.forgotten().includes(user.id))
  const before = await h.request(`/api/profiles/${user.id}`)
  assert.equal(before.status, 200)
  assert.equal((await before.json()).player.gameName, 'Test')
  await Promise.all([h.request(`/api/profiles/${user.id}`), h.request(`/api/profiles/${user.id}`)])
  assert.equal(calls, 1)
  const revoked = await h.request('/api/connection', { method: 'DELETE', headers: h.actionHeaders(user) })
  assert.equal(revoked.status, 200)
  assert.equal(h.store.profileCount(), 0)
  assert.ok(h.forgotten().includes(user.id))
  resolveData(sample({ details: account.details }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await h.request(`/api/profiles/${user.id}`)).status, 404)
  const relinked = await h.link(await h.guest())
  assert.notEqual(relinked.id, user.id)
})

test('an expired snapshot reports an upstream failure after refresh fails', async t => {
  const realNow = Date.now
  let calls = 0
  const h = await harness(t, true, {
    async fetchSnapshot(profile) {
      calls++
      if (calls > 1) throw new Error('upstream unavailable')
      const value = sample(profile)
      value.expiresAtMs = realNow() + 1000
      return value
    },
  })
  try {
    const user = await h.link(await h.guest())
    await h.request(`/api/profiles/${user.id}`)
    await new Promise(resolve => setImmediate(resolve))
    const fresh = await h.request(`/api/profiles/${user.id}`).then(response => response.json())
    assert.equal(fresh.state, 'ready')
    Date.now = () => realNow() + 61000
    await h.request(`/api/profiles/${user.id}`)
    await new Promise(resolve => setImmediate(resolve))
    const stale = await h.request(`/api/profiles/${user.id}`).then(response => response.json())
    assert.equal(stale.state, 'error')
    assert.equal(stale.history.length, 0)
  } finally { Date.now = realNow }
})

test('withdrawal during the identity exchange cannot create a new sharing grant', async t => {
  let resolveIdentity, signalStarted
  const started = new Promise(resolve => { signalStarted = resolve })
  const h = await harness(t, true, { identity: () => { signalStarted(); return new Promise(resolve => { resolveIdentity = resolve }) } })
  const guest = await h.guest(), { body } = await h.begin(guest), state = new URL(body.url).searchParams.get('state')
  const callback = h.request(`/oauth/callback?code=test&state=${state}`, { headers: { Cookie: guest.cookie } })
  await started
  assert.equal((await h.request('/api/connection', { method: 'DELETE', headers: h.actionHeaders(guest) })).status, 200)
  resolveIdentity(account)
  assert.equal((await callback).headers.get('location'), '/?connection=failed')
  assert.equal(h.store.profileCount(), 0)
})

test('sessions persist and a consent-version change blocks reads but still permits withdrawal', () => {
  const folder = mkdtempSync(join(tmpdir(), 'league-profile-'))
  let store
  try {
    const file = join(folder, 'store.sqlite')
    store = createStore(file, 'v1')
    const id = store.grant(account, 2), session = store.newSession(id)
    store.close(); store = createStore(file, 'v2')
    assert.equal(store.session(session.token).profile_id, id)
    assert.equal(store.profile(id), undefined)
    assert.equal(store.ownedProfile(id).display_name, 'Test#EUW')
    store.revoke(id)
    assert.equal(store.profileCount(), 0)
    assert.equal(store.session(session.token).profile_id, null)
  } finally { store?.close(); rmSync(folder, { recursive: true, force: true }) }
})
