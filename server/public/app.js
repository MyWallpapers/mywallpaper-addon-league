const $ = id => document.getElementById(id)
let current, polling, inFlight
class PortalError extends Error {}
const errorMessage = error => error instanceof PortalError ? error.message : 'Les données du service sont momentanément indisponibles. Réessayez dans quelques instants.'
function status(message, error = false) { $('status').textContent = message; $('status').dataset.error = String(error) }
const messages = {
  approval_required: 'La connexion attend l’approbation Riot et la configuration du service.',
  consent_required: 'Confirmez le partage et choisissez votre serveur et votre file classée.',
  csrf: 'La session a changé. Rechargez cette page pour continuer.',
  rate_limit: 'Trop de demandes rapprochées. Réessayez dans une minute.',
  profile_unavailable: 'Ce profil n’est plus partagé ou son lien est incorrect.',
}
async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000),
    ...options, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': current?.csrf || '', ...options.headers } })
  const value = await response.json()
  if (!response.ok) throw new PortalError(messages[value.error] || 'Le service est momentanément indisponible. Réessayez plus tard.')
  return value
}
function legal(value) {
  if (value.operator) { $('operator').textContent = value.operator + (value.contact ? ' · ' + value.contact : ''); $('operator').hidden = false }
  if (value.privacyUrl && value.termsUrl) {
    $('privacy').href = value.privacyUrl; $('terms').href = value.termsUrl; $('legal-links').hidden = false
  }
}
async function loadSession() {
  current = await api('/api/session')
  legal(current)
  $('connected').hidden = !current.profile
  $('connect').hidden = Boolean(current.profile?.active)
  $('consent').checked = false
  $('connection-fields').disabled = !current.approved
  if (current.profile) {
    $('account-name').textContent = current.profile.displayName
    $('profile-url').value = current.profile.url; $('profile-link').href = current.profile.url
    status(current.profile.active ? 'Votre partage est actif.' : current.approved
      ? 'L’autorisation de partage doit être renouvelée. Confirmez-la ci-dessous, ou retirez votre ancien partage.'
      : 'Le partage est suspendu : la connexion Riot n’est pas activée.')
  } else status(current.approved ? 'Le partage ne commence qu’après votre autorisation et la connexion Riot.' : 'Connexion en attente de l’approbation Riot. Aucun compte n’est relié et aucune donnée joueur n’est récupérée.')
}
$('connect-form').addEventListener('submit', async event => {
  event.preventDefault()
  if (!current?.approved || !$('consent').checked) return
  $('connect-button').disabled = true
  status('Ouverture de la connexion Riot…')
  try {
    const value = await api('/api/connect', { method: 'POST', body: JSON.stringify({ accepted: true,
      consentVersion: current.consentVersion, connection: { platform: $('platform').value, queueId: Number($('queueId').value) } }) })
    location.assign(value.url)
  } catch (error) { status(errorMessage(error), true); $('connect-button').disabled = false }
})
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('profile-url').value); status('Lien copié. Collez-le dans les réglages de l’add-on.') }
  catch { $('profile-url').focus(); $('profile-url').select(); status('Copiez le lien sélectionné avec le raccourci de votre clavier.') }
})
$('withdraw').addEventListener('click', async () => {
  $('withdraw').disabled = true
  try { await api('/api/connection', { method: 'DELETE' }); await loadSession(); status('Partage retiré. Votre ancien lien ne fonctionne plus.') }
  catch (error) { status(errorMessage(error), true) }
  finally { $('withdraw').disabled = false }
})
const profileId = /^\/p\/([A-Za-z0-9_-]{24})$/u.exec(location.pathname)?.[1]
const queueNames = { 420: 'Classée Solo / Duo', 440: 'Classée Flex' }
function rankLabel(rank) {
  if (!rank) return 'Indisponible'
  if (rank.tier === 'UNRANKED') return 'Non classé'
  return rank.tier + (rank.division ? ' ' + rank.division : '') + ' · ' + rank.lp + ' LP'
}
function renderPresence(player, session) {
  if (player.presence === 'not-playing') return 'Aucune partie en cours détectée.'
  if (player.presence === 'playing' && session) {
    const start = session.startedAtMs ? ' · début ' + new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(session.startedAtMs) : ''
    return 'En partie · champion n° ' + session.championId + start
  }
  return 'Présence en partie inconnue.'
}
async function loadProfile() {
  if (document.hidden || inFlight) return
  inFlight = new AbortController()
  try {
    const response = await fetch('/api/profiles/' + profileId, { signal: AbortSignal.any([inFlight.signal, AbortSignal.timeout(10000)]), cache: 'no-store', credentials: 'omit' })
    const value = await response.json()
    if (!response.ok) throw new PortalError(messages[value.error] || 'Les données sont momentanément indisponibles.')
    const player = value.player, stats = player.stats
    $('public-name').textContent = player.gameName + '#' + player.tagLine
    $('queue-label').textContent = queueNames[player.rank?.queueId] || 'File classée choisie par le propriétaire'
    $('rank').textContent = rankLabel(player.rank)
    $('winrate').textContent = stats ? stats.wins + ' / ' + stats.matches + (stats.matches ? ' · ' + Math.round(stats.wins / stats.matches * 100) + ' %' : '') : '—'
    $('kda').textContent = stats ? stats.kills + ' / ' + stats.deaths + ' / ' + stats.assists : '—'
    $('matches').textContent = stats ? String(stats.matches) : '—'
    $('presence').textContent = renderPresence(player, value.session)
    status(value.state === 'error' ? 'Les données du profil sont temporairement indisponibles. Le service réessaiera plus tard.' :
      stats ? 'Données de parties classées récentes.' : 'Profil autorisé. Récupération des données récentes…')
  } catch (error) {
    if (!document.hidden) {
      $('public-name').textContent = 'Profil League of Legends'
      $('queue-label').textContent = ''
      $('presence').textContent = 'Présence en partie inconnue.'
      for (const id of ['rank', 'winrate', 'kda', 'matches']) $(id).textContent = '—'
      status(errorMessage(error), true)
    }
  } finally { inFlight = null }
}
function schedule() {
  clearInterval(polling)
  if (!document.hidden) { void loadProfile(); polling = setInterval(loadProfile, 60000) }
  else inFlight?.abort()
}
if (profileId) {
  $('heading').textContent = 'Profil partagé'
  $('intro').textContent = 'Le propriétaire a autorisé le partage de ces données de League of Legends.'
  $('public-profile').hidden = false
  fetch('/api/info', { credentials: 'omit', cache: 'no-store' }).then(r => r.json()).then(legal).catch(() => {})
  document.addEventListener('visibilitychange', schedule)
  schedule()
} else {
  loadSession().then(() => {
    if (new URLSearchParams(location.search).get('connection') === 'failed') {
      history.replaceState(null, '', '/')
      status('La connexion Riot n’a pas abouti. Votre partage n’a pas été modifié ; vous pouvez réessayer.', true)
    }
  }).catch(error => status(errorMessage(error), true))
}
addEventListener('pagehide', () => { clearInterval(polling); inFlight?.abort() })
