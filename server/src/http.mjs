import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
export function clientAddress(request, config) {
  const remote = request.socket.remoteAddress || ''
  const normalized = remote.startsWith('::ffff:') && isIP(remote.slice(7)) === 4 ? remote.slice(7) : remote
  const forwarded = request.headers[config.proxyIpHeader]
  return config.trustedProxy && normalized === config.trustedProxy && typeof forwarded === 'string' && isIP(forwarded)
    ? forwarded : normalized
}
export function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
export function cookieToken(request, name) {
  const match = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))
  return match?.slice(name.length + 1)
}
export function sessionCookie(name, token, secure) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? '; Secure' : ''}`
}
export function securityHeaders(response, secure) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (secure) response.setHeader('Strict-Transport-Security', 'max-age=31536000')
}
export function send(response, status, value, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type })
  response.end(type.startsWith('application/json') ? JSON.stringify(value) : value)
}
export function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'json_required')
  return new Promise((resolve, reject) => {
    let chunks = [], length = 0
    const fail = error => { request.removeListener('data', data); request.removeListener('end', end); request.resume(); reject(error) }
    const data = chunk => {
      length += chunk.length
      if (length > 4096) { fail(new HttpError(413, 'body_too_large')); return }
      chunks.push(chunk)
    }
    const end = () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
        resolve(value)
      } catch { reject(new HttpError(400, 'invalid_json')) }
    }
    request.on('data', data).once('end', end).once('error', reject)
  })
}
