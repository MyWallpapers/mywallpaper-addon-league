import type { CanvasAddonMountContext, JsonValue, ServiceConnection } from '../generated/mywallpaper-runtime'
import { mount } from './main'
import { layouts, type Layout, type PlayerSnapshot } from './contract'
import { defaults } from './settings'
import { illustration } from './illustration'
import './preview.css'

// Production mount with a labelled fictional source. No Riot authentication or local bypass.
const host = document.querySelector<HTMLElement>('#preview')!
host.innerHTML = `<header class="preview-header"><div><h1>League of Legends Widgets</h1><p>Cinq présentations · Données fictives, aucun compte Riot connecté.</p></div><label>État <select id="state"><option value="reference">Référence visuelle</option><option value="remote">Données API distantes</option><option value="unlinked">Compte non lié</option><option value="missing">Données partielles</option><option value="unranked">Non classé</option><option value="apex">Master · 438 LP</option><option value="expired">Données expirées</option><option value="offline">Source indisponible</option><option value="error">Source invalide</option></select></label></header><main class="preview-grid"></main><footer class="preview-notice">Prototype · Accès Riot approuvés non configurés · Non publié</footer>`
const grid = host.querySelector<HTMLElement>('.preview-grid')!
const control = host.querySelector<HTMLSelectElement>('select')!
const titles: Record<Layout, string> = { rank: 'Rang + profil', overview: 'Grand visuel', session: 'Infos de session', rings: 'Icônes essentielles', history: 'Historique récent' }
let disposals: (() => void)[] = []
function snapshot(): PlayerSnapshot {
  const data = illustration()
  if (control.value === 'remote') {
    data.player!.rank!.change = null
    Object.assign(data.session!, { level: null, kda: null, cs: null, gold: null, items: null })
  }
  if (control.value === 'missing') {
    Object.assign(data.player!, { rank: null, stats: null, presence: 'unknown', profileIconId: null, level: null })
    data.session = null; data.history = []
  }
  if (control.value === 'unranked') data.player!.rank = { tier: 'UNRANKED', division: null, lp: null, change: null, queueId: 420, wins: 0, losses: 0 }
  if (control.value === 'apex') Object.assign(data.player!.rank!, { tier: 'MASTER', division: null, lp: 438 })
  if (control.value === 'expired') { data.capturedAtMs -= 3601000; data.expiresAtMs = Date.now() - 1000 }
  if (control.value === 'offline') return { ...data, state: 'offline', playerOptedIn: false, player: null, session: null, history: [] }
  return data
}
function context(root: HTMLElement, layout: Layout, thumbnail: boolean): CanvasAddonMountContext {
  const values = { ...defaults, language: 'fr', layout } as unknown as Record<string, JsonValue>
  const bus = { emit: () => {}, on: () => () => {} }
  const channel: ServiceConnection = {
    call: async () => { throw new Error('Preview provides retained snapshots only') },
    subscribe: (_topic, listener) => {
      let active = true
      queueMicrotask(() => { if (active) listener({ kind: 'snapshot', sequence: 0, value: control.value === 'error' ? {} : snapshot() as unknown as JsonValue }) })
      return () => { active = false }
    },
    stream: async function* () { throw new Error('Preview has no streams') }, close: () => {},
  }
  return {
    runtime: { surface: 'interface', mode: thumbnail ? 'thumbnail' : 'interactive', instance: {
      instanceId: `preview-${layout}`, displayIndex: 0, displayCount: 1, canonical: true, width: root.clientWidth, height: root.clientHeight } },
    layer: { root, layerId: `preview-${layout}`, settings: { get: () => values, set: async () => {}, subscribe: () => () => {} },
      deviceSettings: { get: () => ({}), set: async () => {}, subscribe: () => () => {} },
      actions: { on: () => () => {} }, lifecycle: { onDispose: () => () => {} }, resources: { resolve: async value => value.url }, bus,
      native: { companion: { available: false, connect: async () => { throw new Error('No native companion') } },
        hooks: { available: false, status: () => null, onStateChange: () => () => {} } } },
    bus, services: { connect: async () => { if (control.value === 'unlinked') throw new Error('No provider'); return channel },
      provide: () => { throw new Error('Visual consumer only') } },
  }
}
function display(): void {
  for (const dispose of disposals) dispose()
  disposals = []; grid.replaceChildren()
  const thumbnail = location.pathname.endsWith('/thumbnail.html')
  document.body.classList.toggle('preview-thumbnail', thumbnail)
  for (const layout of thumbnail ? ['overview'] as const : layouts) {
    const section = document.createElement('section'), title = document.createElement('h2'), root = document.createElement('div')
    title.textContent = titles[layout]; root.className = 'preview-widget'; section.dataset.layout = layout
    section.append(title, root); grid.append(section); disposals.push(mount(context(root, layout, thumbnail)))
  }
}
control.addEventListener('change', display)
display()
window.addEventListener('pagehide', () => { for (const dispose of disposals) dispose() }, { once: true })
