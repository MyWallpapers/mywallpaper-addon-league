import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { HttpError, clientAddress, cookieToken, readJson, sameToken, securityHeaders, send, sessionCookie } from './http.mjs'
import { CONSENT_VERSION } from './config.mjs'
import { digest } from './store.mjs'

const PROFILE_ID = /^[A-Za-z0-9_-]{24}$/u
const FLOW_MS = 10 * 60000, REFRESH_MS = 60000
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
].map(([path, [file, type]]) => [path, { bytes: readFileSync(new URL(`../public/${file}`, import.meta.url)), type }]))

/** Provider boundary: authorization, identity, connection validation and snapshots; optional cache lifecycle hooks. */
export function createApp(config, store, provider) {
  const cookieName = config.secure ? '__Host-profile-session' : 'profile-session'
  const flows = new Map(), cache = new Map(), rates = new Map()
  let activeJobs = 0, closed = false
  function rate(request, group, limit, windowMs) {
    const now = Date.now(), key = `${group}:${clientAddress(request, config)}`
    let entry = rates.get(key)
    if (!entry || entry.until <= now) {
      if (rates.size >= 2048) throw new HttpError(429, 'rate_limit')
      entry = { until: now + windowMs, count: 0 }
      rates.set(key, entry)
    }
    if (++entry.count > limit) throw new HttpError(429, 'rate_limit')
  }
  function sweep() {
    const now = Date.now()
    for (const [key, flow] of flows) if (flow.until <= now) flows.delete(key)
    for (const [key, entry] of rates) if (entry.until <= now) rates.delete(key)
    store.sweep(); provider.sweep?.()
  }
  const housekeeping = setInterval(sweep, 60000)
  housekeeping.unref()
  function dropFlows(token) {
    for (const [key, flow] of flows) if (flow.sessionHash === digest(token)) flows.delete(key)
  }
  function session(request, response, create = false) {
    let token = cookieToken(request, cookieName), row = store.session(token)
    if (!row && create) {
      const fresh = store.newSession()
      token = fresh.token; row = fresh
      response.setHeader('Set-Cookie', sessionCookie(cookieName, token, config.secure))
    }
    return row ? { ...row, token } : null
  }
  function mutation(request, response) {
    if (request.headers.origin !== config.origin) throw new HttpError(403, 'origin_mismatch')
    const current = session(request, response)
    if (!current || !sameToken(request.headers['x-csrf-token'], current.csrf)) throw new HttpError(403, 'csrf')
    return current
  }
  function refresh(profile) {
    const previous = cache.get(profile.id), now = Date.now()
    if (closed || previous?.busy || (previous && previous.next > now) || activeJobs >= 3) return
    const entry = { value: previous?.value || null, busy: true, next: now + REFRESH_MS, error: null }
    cache.set(profile.id, entry); activeJobs++
    void Promise.resolve().then(() => provider.fetchSnapshot(profile)).then(value => {
      if (closed) return
      const current = store.profile(profile.id)
      if (current?.consented_at === profile.consented_at && cache.get(profile.id) === entry) entry.value = value
    }).catch(error => {
      entry.error = 'provider_unavailable'
      const retry = Number(error?.retryAfter)
      entry.next = Date.now() + (Number.isFinite(retry) ? Math.max(60, Math.min(3600, retry)) : 60) * 1000
    }).finally(() => {
      entry.busy = false; activeJobs--
      if (!closed && !store.profile(profile.id)) cache.delete(profile.id)
    })
  }
  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    securityHeaders(response, config.secure)
    try {
      rate(request, 'all', 180, 60000)
      const url = new URL(request.url, config.origin)
      const path = url.pathname, method = request.method
      if (url.origin !== config.origin) throw new HttpError(400, 'invalid_url')
      if (path === '/healthz' && method === 'GET') { send(response, 200, { ok: true, connectionEnabled: config.approved }); return }
      if (path === '/api/info' && method === 'GET') {
        send(response, 200, { operator: config.operator, contact: config.contact, privacyUrl: config.privacyUrl, termsUrl: config.termsUrl }); return
      }
      if (path === '/api/session' && method === 'GET') {
        const current = session(request, response, true), profile = current.profile_id && store.ownedProfile(current.profile_id)
        send(response, 200, { approved: config.approved, consentVersion: CONSENT_VERSION, csrf: current.csrf,
          operator: config.operator, contact: config.contact, privacyUrl: config.privacyUrl, termsUrl: config.termsUrl,
          profile: profile ? { id: profile.id, displayName: profile.display_name, url: `${config.origin}/p/${profile.id}`,
            active: config.approved && Boolean(store.profile(profile.id)) } : null })
        return
      }
      if (path === '/api/connect' && method === 'POST') {
        const current = mutation(request, response)
        if (!config.approved) throw new HttpError(503, 'approval_required')
        rate(request, 'connect', 5, FLOW_MS)
        const body = await readJson(request), connection = provider.validateConnection(body.connection)
        if (body.accepted !== true || body.consentVersion !== CONSENT_VERSION || !connection) throw new HttpError(400, 'consent_required')
        dropFlows(current.token)
        if (flows.size >= 200) throw new HttpError(503, 'busy')
        const flow = provider.authorization()
        flows.set(flow.state, { ...flow, connection, sessionHash: digest(current.token), until: Date.now() + FLOW_MS })
        send(response, 200, { url: flow.url }); return
      }
      if (path === '/oauth/callback' && method === 'GET') {
        const state = url.searchParams.get('state'), flow = flows.get(state), current = session(request, response)
        flows.delete(state)
        const code = url.searchParams.get('code'), issuer = url.searchParams.get('iss')
        if (!config.approved || !flow || flow.until <= Date.now() || !current || !sameToken(flow.sessionHash, digest(current.token))
          || (issuer && issuer !== provider.issuer) || !code || code.length > 2048 || url.searchParams.has('error')) throw new HttpError(400, 'connection_failed')
        const account = await provider.identity(code, flow)
        // A withdrawal/logout while the exchange is running invalidates the original session.
        if (closed || !store.session(current.token)) throw new HttpError(400, 'connection_failed')
        const id = store.grant(account, config.maxProfiles)
        cache.delete(id); provider.forget?.(id)
        store.dropSession(current.token); dropFlows(current.token)
        const fresh = store.newSession(id)
        response.setHeader('Set-Cookie', sessionCookie(cookieName, fresh.token, config.secure))
        response.writeHead(303, { Location: '/' }); response.end(); return
      }
      if (path === '/api/connection' && method === 'DELETE') {
        const current = mutation(request, response)
        if (current.profile_id) { store.revoke(current.profile_id); cache.delete(current.profile_id); provider.forget?.(current.profile_id) }
        store.dropSession(current.token); dropFlows(current.token)
        const fresh = store.newSession()
        response.setHeader('Set-Cookie', sessionCookie(cookieName, fresh.token, config.secure))
        send(response, 200, { revoked: true }); return
      }
      const apiId = path.startsWith('/api/profiles/') ? path.slice('/api/profiles/'.length) : ''
      if (PROFILE_ID.test(apiId) && method === 'GET') {
        response.setHeader('Access-Control-Allow-Origin', '*')
        const profile = store.profile(apiId)
        if (!profile) throw new HttpError(404, 'profile_unavailable')
        if (!config.approved) throw new HttpError(503, 'approval_required')
        refresh(profile)
        const entry = cache.get(apiId)
        if (entry?.error && !entry.value) throw new HttpError(503, entry.error)
        const value = entry?.value && entry.value.expiresAtMs > Date.now() ? entry.value : null
        if (value) send(response, 200, value)
        else {
          const fallback = provider.emptySnapshot(profile)
          send(response, 200, entry?.error ? { ...fallback, state: 'error' } : fallback)
        }
        return
      }
      const pageId = path.startsWith('/p/') ? path.slice(3) : ''
      const file = files.get(PROFILE_ID.test(pageId) ? '/' : path)
      if (method === 'GET' && file) { send(response, 200, file.bytes, file.type); return }
      throw new HttpError(404, 'not_found')
    } catch (error) {
      if (response.headersSent) { response.destroy(); return }
      if (request.url?.startsWith('/oauth/callback')) {
        response.writeHead(303, { Location: '/?connection=failed' }); response.end(); return
      }
      const status = error instanceof HttpError ? error.status : 503
      const code = error instanceof HttpError ? error.code : 'service_unavailable'
      if (status === 429 || status === 503) response.setHeader('Retry-After', '60')
      response.setHeader('Connection', 'close')
      send(response, status, { error: code })
    }
  })
  server.headersTimeout = 10000
  server.requestTimeout = 10000
  server.keepAliveTimeout = 5000
  return {
    server,
    async close() {
      closed = true; clearInterval(housekeeping); flows.clear(); cache.clear(); rates.clear()
      provider.close?.()
      const forced = setTimeout(() => server.closeAllConnections(), 3000)
      forced.unref()
      await new Promise(resolve => server.close(resolve))
      clearTimeout(forced)
      // Pending refreshes are allowed to finish; they cannot write after closure.
      store.close()
    },
  }
}
