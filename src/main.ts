import type { CanvasAddonMountContext, ServiceConnection } from '../generated/mywallpaper-runtime'
import { parseSnapshot, type PlayerSnapshot, type SnapshotState } from './contract'
import { applySettings, readSettings } from './settings'
import { illustration } from './illustration'
import { render, updateClocks } from './view'
import { profileEndpoint, watchProfile } from './profile'
import './style.css'

export function mount({ layer, runtime, services }: CanvasAddonMountContext): () => void {
  const root = document.createElement('div')
  root.className = 'mwp-league'
  layer.root.replaceChildren(root)
  let settings = readSettings(layer.settings.get())
  const readProfile = () => String(layer.deviceSettings.get().profileUrl || '').trim()
  let profileUrl = readProfile()
  const illustrative = runtime.mode === 'thumbnail'
  let data: PlayerSnapshot | null = illustrative ? illustration() : null
  let state: SnapshotState = illustrative ? 'ready' : 'loading'
  let expired = false, disposed = false
  let connection: ServiceConnection | undefined
  let unsubscribe = () => {}, stopDispose = () => {}, stopProfile = () => {}
  let timer: ReturnType<typeof setInterval> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let abort = new AbortController()
  function show(): void {
    if (disposed) return
    applySettings(root, settings)
    render(root, data, settings, state, illustrative)
    expired = data !== null && Date.now() > data.expiresAtMs
    schedule()
  }
  function tick(): void {
    if (disposed || document.hidden) return
    if ((data !== null && Date.now() > data.expiresAtMs) !== expired) show()
    else updateClocks(root, data, settings)
  }
  function schedule(): void {
    clearInterval(timer)
    if (disposed || document.hidden || state !== 'ready' || !data || expired || illustrative) return
    const clock = (settings.layout === 'session' || settings.layout === 'rings') && data.session && data.session.startedAtMs !== null
    timer = setInterval(tick, clock ? 1000 : 30000)
  }
  function fail(next: SnapshotState): void { data = null; state = next; show() }
  async function connect(): Promise<void> {
    abort.abort()
    abort = new AbortController()
    const attempt = abort
    clearTimeout(deadline)
    unsubscribe()
    stopProfile()
    connection?.close()
    connection = undefined
    data = null
    state = 'loading'
    show()
    try {
      if (profileUrl) {
        stopProfile = watchProfile(profileEndpoint(profileUrl), attempt.signal, (next, nextState) => {
          if (disposed || attempt.signal.aborted) return
          data = next; state = nextState
          if (!document.hidden) show()
        })
        return
      }
      const channel = await services.connect('league', { signal: attempt.signal, timeoutMs: 8000 })
      if (disposed || attempt.signal.aborted) { channel.close(); return }
      connection = channel
      deadline = setTimeout(() => { if (!disposed && !attempt.signal.aborted) fail('offline') }, 8000)
      unsubscribe = channel.subscribe('player', event => {
        if (disposed || attempt.signal.aborted) return
        clearTimeout(deadline)
        const next = parseSnapshot(event.value)
        if (!next) { fail('error'); return }
        data = next
        state = next.state
        if (!document.hidden) show()
      }, () => { if (!disposed && !attempt.signal.aborted) { clearTimeout(deadline); fail('offline') } })
    } catch {
      if (!disposed && !attempt.signal.aborted) fail(profileUrl ? 'error' : 'unlinked')
    }
  }
  show()
  const stopSettings = layer.settings.subscribe(values => { settings = readSettings(values); show() })
  const stopDeviceSettings = layer.deviceSettings.subscribe(() => {
    const next = readProfile()
    if (next !== profileUrl) { profileUrl = next; if (!illustrative) void connect() }
  })
  const stopRetry = layer.actions.on('reconnect', () => { if (!illustrative) void connect() })
  const visibility = () => { if (document.hidden) clearInterval(timer); else show() }
  document.addEventListener('visibilitychange', visibility)
  if (!illustrative) void connect()
  function dispose(): void {
    if (disposed) return
    disposed = true
    abort.abort()
    clearInterval(timer)
    clearTimeout(deadline)
    unsubscribe()
    stopProfile()
    connection?.close()
    stopSettings()
    stopDeviceSettings()
    stopRetry()
    document.removeEventListener('visibilitychange', visibility)
    stopDispose()
    root.remove()
  }
  stopDispose = layer.lifecycle.onDispose(dispose)
  return dispose
}
