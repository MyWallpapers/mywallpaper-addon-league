import { parseSnapshot, type PlayerSnapshot, type SnapshotState } from './contract'

/** A public profile link, never a cookie, API key or bearer token. */
export function profileEndpoint(value: string): string {
  const url = new URL(value)
  const loopback = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const match = /^\/p\/([A-Za-z0-9_-]{24})$/u.exec(url.pathname)
  if (value.length > 2048 || (!loopback && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || !match) throw new Error('Invalid public profile URL')
  return `${url.origin}/api/profiles/${match[1]}`
}

export function watchProfile(endpoint: string, signal: AbortSignal, receive: (snapshot: PlayerSnapshot | null, state: SnapshotState) => void): () => void {
  let stopped = false, request: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  async function poll(): Promise<void> {
    if (stopped || signal.aborted || document.hidden || request) return
    const attempt = new AbortController()
    request = attempt
    try {
      const response = await fetch(endpoint, { credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        signal: AbortSignal.any([signal, attempt.signal, AbortSignal.timeout(8000)]) })
      if (!response.ok) { await response.body?.cancel(); receive(null, response.status === 404 ? 'unlinked' : 'offline'); return }
      const reader = response.body!.getReader(), chunks: Uint8Array[] = []
      let length = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > 16384) throw new Error('Oversized snapshot')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      const next = parseSnapshot(JSON.parse(new TextDecoder().decode(bytes)))
      if (!stopped && !signal.aborted && !attempt.signal.aborted) receive(next, next?.state || 'error')
    } catch {
      if (!stopped && !signal.aborted && !attempt.signal.aborted) receive(null, 'offline')
    } finally {
      request = undefined
      if (!stopped && !signal.aborted && !document.hidden) timer = setTimeout(poll, attempt.signal.aborted ? 0 : 30000)
    }
  }
  function visibility(): void {
    clearTimeout(timer)
    if (document.hidden) request?.abort()
    else if (!request) void poll()
  }
  function stop(): void {
    stopped = true; clearTimeout(timer); request?.abort()
    document.removeEventListener('visibilitychange', visibility)
    signal.removeEventListener('abort', stop)
  }
  document.addEventListener('visibilitychange', visibility)
  signal.addEventListener('abort', stop, { once: true })
  if (!signal.aborted) void poll()
  return stop
}
