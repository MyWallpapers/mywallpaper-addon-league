import { isIP } from 'node:net'

function number(value, fallback, min, max) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error('Invalid numeric configuration')
  return parsed
}
function httpsUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('An HTTPS URL is required')
  return url.href
}
export const CONSENT_VERSION = 'league-2026-10-07.1'
export function loadConfig(env = process.env, approved = false) {
  const origin = new URL(env.PUBLIC_ORIGIN || 'http://127.0.0.1:5207')
  const local = origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  if ((!local && origin.protocol !== 'https:') || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin, or HTTP loopback for local preparation')
  }
  const config = {
    origin: origin.origin, secure: !local, approved,
    host: env.HOST || '127.0.0.1', port: number(env.PORT, 5207, 1, 65535),
    trustedProxy: env.TRUSTED_PROXY_IP || '', proxyIpHeader: env.PROXY_CLIENT_IP_HEADER || 'x-real-ip',
    databasePath: env.DATABASE_PATH || './data/league.sqlite',
    maxProfiles: number(env.MAX_PROFILES, 1000, 1, 100000),
    operator: env.OPERATOR_NAME || '', contact: env.OPERATOR_CONTACT || '',
    privacyUrl: env.PRIVACY_URL ? httpsUrl(env.PRIVACY_URL) : '', termsUrl: env.TERMS_URL ? httpsUrl(env.TERMS_URL) : '',
  }
  if ([config.operator, config.contact].some(value => value.length > 256 || /[\u0000-\u001f]/u.test(value))) throw new Error('Invalid configuration text')
  if ((config.trustedProxy && !isIP(config.trustedProxy)) || !['x-real-ip', 'cf-connecting-ip'].includes(config.proxyIpHeader)) throw new Error('Invalid trusted proxy configuration')
  if (approved && (!config.secure || !config.operator || !config.contact || !config.privacyUrl || !config.termsUrl)) {
    throw new Error('An enabled service requires HTTPS and complete operator/legal configuration')
  }
  return Object.freeze(config)
}
