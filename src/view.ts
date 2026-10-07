import type { Layout, MatchSummary, PlayerSnapshot, RankedInfo, SnapshotState } from './contract'
import { championImage, championName, championSplash, itemImage, profileImage, rankImage } from './art'
import { copyFor, language, numberFormat, queueName, rankName, timeAgo, type Copy } from './copy'
import { icon } from './icons'
import type { Settings } from './settings'

type Player = NonNullable<PlayerSnapshot['player']>
type ImageFallback = 'user' | 'shield' | 'swords' | 'dash' | 'remove'

function escapeHtml(value: string | number): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(value).replace(/[&<>"']/gu, character => entities[character])
}

function image(
  source: string | null,
  className: string,
  alt: string,
  width: number,
  height: number,
  fallback: ImageFallback,
  fallbackLabel = '',
): string {
  if (!source) return ''
  return '<img class="' + className + '" data-ll-fallback="' + fallback + '" data-ll-fallback-label="'
    + escapeHtml(fallbackLabel) + '" src="' + escapeHtml(source) + '" alt="' + escapeHtml(alt)
    + '" referrerpolicy="no-referrer" width="' + width + '" height="' + height + '" loading="lazy" decoding="async" draggable="false">'
}

function profileArtwork(player: Player, copy: Copy): string {
  const source = profileImage(player.profileIconId)
  return source
    ? image(source, 'll-avatar', '', 64, 64, 'user', copy.unavailable)
    : '<span class="ll-avatar ll-avatar--empty" aria-hidden="true">' + icon('user') + '</span>'
}

function rankArtwork(rank: RankedInfo | null): string {
  const source = rank ? rankImage(rank.tier) : null
  return source
    ? image(source, 'll-rank-art-image', '', 128, 128, 'shield')
    : '<span class="ll-rank-placeholder" aria-hidden="true">' + icon('shield') + '</span>'
}

function championArtwork(championId: number, className: string): string {
  const source = championImage(championId)
  return source
    ? image(source, className, '', 96, 96, 'swords')
    : '<span class="' + className + ' ll-art-placeholder" aria-hidden="true">' + icon('swords') + '</span>'
}

function presenceLabel(player: Player, copy: Copy): string {
  if (player.presence === 'playing') return copy.inGame
  if (player.presence === 'not-playing') return copy.noActiveGame
  return copy.statusUnavailable
}

function identity(player: Player, copy: Copy, locale: 'fr' | 'en', stale: boolean, includeAvatar = true, includeMeta = true): string {
  const level = player.level === null ? '' : '<span class="ll-profile-level">' + escapeHtml(copy.accountLevel)
    + ' ' + escapeHtml(numberFormat(player.level, locale)) + '</span>'
  const avatar = includeAvatar ? profileArtwork(player, copy) : ''
  const meta = includeMeta
    ? '<div class="ll-profile-meta"><span>' + escapeHtml(player.platform.toUpperCase()) + '</span>' + level + '</div>'
    : ''
  const status = stale ? '' : '<span class="ll-status" data-presence="' + escapeHtml(player.presence) + '">'
    + '<span class="ll-status-dot" aria-hidden="true"></span><span>' + escapeHtml(presenceLabel(player, copy)) + '</span></span>'
  return '<div class="ll-profile' + (includeAvatar ? '' : ' ll-profile--compact') + '" role="group" aria-label="' + escapeHtml(copy.profile) + '">'
    + avatar
    + '<div class="ll-profile-copy"><div class="ll-identity-line"><strong title="' + escapeHtml(player.gameName) + '">'
    + escapeHtml(player.gameName) + '</strong><span class="ll-tag">#' + escapeHtml(player.tagLine)
    + '</span></div>' + meta + '</div>' + status + '</div>'
}

function rankTitle(rank: RankedInfo | null, copy: Copy, locale: 'fr' | 'en'): string {
  return rank ? rankName(rank, locale, copy) : copy.rankUnavailable
}

function isApex(rank: RankedInfo): boolean {
  return rank.tier === 'MASTER' || rank.tier === 'GRANDMASTER' || rank.tier === 'CHALLENGER'
}

function rankPoints(rank: RankedInfo | null, copy: Copy, locale: 'fr' | 'en'): string {
  if (!rank) return '— ' + copy.lp
  if (rank.tier === 'UNRANKED') return copy.noDivision
  if (rank.lp === null) return '— ' + copy.lp
  return numberFormat(rank.lp, locale) + ' ' + copy.lp
}

function rankProgress(rank: RankedInfo | null, copy: Copy): string {
  if (!rank || rank.tier === 'UNRANKED' || rank.lp === null || rank.division === null || isApex(rank)) return ''
  const value = Math.max(0, Math.min(100, rank.lp))
  return '<div class="ll-progress" role="meter" aria-label="' + escapeHtml(copy.currentRank + ' · ' + rank.lp + ' ' + copy.lp)
    + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + value + '"><span style="transform:scaleX('
    + value / 100 + ')"></span></div>'
}

function rankBlock(rank: RankedInfo | null, copy: Copy, locale: 'fr' | 'en'): string {
  return '<div class="ll-rank-block">'
    + '<strong class="ll-rank-name">' + escapeHtml(rankTitle(rank, copy, locale)) + '</strong>'
    + '<span class="ll-rank-points">' + escapeHtml(rankPoints(rank, copy, locale)) + '</span>'
    + rankProgress(rank, copy) + '</div>'
}

function changeBadge(rank: RankedInfo | null, settings: Settings, copy: Copy, locale: 'fr' | 'en', stale: boolean): string {
  if (!settings.showChange || stale || !rank || rank.change === null) return ''
  const change = rank.change
  const points = numberFormat(Math.abs(change), locale)
  const display = (change > 0 ? '+' : change < 0 ? '−' : '') + points + ' ' + copy.lp
  const stateClass = change < 0 ? ' ll-change--loss' : ''
  return '<span class="ll-change' + stateClass + '" aria-label="' + escapeHtml(copy.lastLpChange + ': ' + display)
    + '">' + escapeHtml(display) + '</span>'
}

function average(value: number, matches: number): string {
  return matches > 0 ? (value / matches).toFixed(1) : '—'
}

function recentStats(data: PlayerSnapshot): { winRate: string; kda: string; matches: string; count: number } {
  const stats = data.player?.stats
  if (!stats) return { winRate: '—', kda: '—', matches: '—', count: 0 }
  const count = stats.matches
  return {
    winRate: count > 0 ? Math.round(stats.wins / count * 100) + '%' : '—',
    kda: count > 0 ? [average(stats.kills, count), average(stats.deaths, count), average(stats.assists, count)].join(' / ') : '—',
    matches: String(count),
    count,
  }
}

function stat(label: string, value: string, extraClass = ''): string {
  return '<div class="ll-stat' + (extraClass ? ' ' + extraClass : '') + '"><dt>' + escapeHtml(label)
    + '</dt><dd>' + escapeHtml(value) + '</dd></div>'
}

function statsGrid(data: PlayerSnapshot, copy: Copy): string {
  const stats = recentStats(data)
  return '<dl class="ll-stats-grid">' + stat(copy.winRate, stats.winRate) + stat(copy.averageKda, stats.kda, 'll-stat--kda')
    + stat(copy.matches, stats.matches) + '</dl>'
}

function dateIso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function absoluteDate(timestamp: number, locale: 'fr' | 'en'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
}

function elapsedLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const remainder = seconds % 60
  return [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(':')
}

function queueLine(queueId: number, copy: Copy): string {
  return queueName(queueId, copy)
}

function rankLayout(data: PlayerSnapshot, settings: Settings, copy: Copy, stale: boolean): string {
  const player = data.player!
  const locale = language(settings)
  return '<section class="ll-rank-row" aria-label="' + escapeHtml(copy.currentRank) + '">'
    + '<div class="ll-rank-art">' + rankArtwork(player.rank) + '</div>'
    + '<div class="ll-rank-main">' + identity(player, copy, locale, stale, false, false)
    + rankBlock(player.rank, copy, locale) + '</div>'
    + changeBadge(player.rank, settings, copy, locale, stale) + '</section>'
}

function overviewLayout(data: PlayerSnapshot, settings: Settings, copy: Copy, stale: boolean): string {
  const player = data.player!
  const locale = language(settings)
  const splash = !stale && data.session ? championSplash(data.session.championId) : null
  const splashImage = image(splash, 'll-overview-splash', '', 720, 360, 'remove')
  const recent = recentStats(data)
  return '<section class="ll-overview">'
    + '<div class="ll-overview-art" aria-hidden="true">' + splashImage + '<span class="ll-overview-shield">' + icon('shield') + '</span></div>'
    + '<div class="ll-overview-content"><div class="ll-overview-profile">' + identity(player, copy, locale, stale, false, false) + '</div>'
    + '<div class="ll-overview-rank"><div class="ll-rank-art ll-rank-art--large">' + rankArtwork(player.rank) + '</div>'
    + rankBlock(player.rank, copy, locale) + '</div>'
    + '<p class="ll-sample-caption">' + escapeHtml(copy.recentRanked(recent.count)) + '</p>'
    + statsGrid(data, copy) + '</div></section>'
}

function itemStrip(itemIds: number[] | null, copy: Copy): string {
  if (itemIds === null) {
    return '<div class="ll-items-row"><span class="ll-items-label">' + escapeHtml(copy.items) + '</span>'
      + '<span class="ll-items-unknown">—</span></div>'
  }
  if (itemIds.length === 0) {
    return '<div class="ll-items-row"><span class="ll-items-label">' + escapeHtml(copy.items) + '</span>'
      + '<span class="ll-items-empty">' + escapeHtml(copy.noItems) + '</span></div>'
  }
  const content = itemIds.slice(0, 7).map(id => {
    const source = itemImage(id)
    const artwork = source
      ? image(source, 'll-item-image', 'Item ' + id, 40, 40, 'dash', copy.unavailable)
      : '<span class="ll-item-placeholder" aria-label="' + escapeHtml(copy.unavailable) + '">—</span>'
    return '<li class="ll-item" title="' + escapeHtml('Item ' + id) + '">' + artwork + '</li>'
  }).join('')
  return '<div class="ll-items-row"><span class="ll-items-label">' + escapeHtml(copy.items) + '</span>'
    + '<ul class="ll-items" aria-label="' + escapeHtml(copy.items) + '">' + content + '</ul></div>'
}

function sessionLayout(data: PlayerSnapshot, settings: Settings, copy: Copy, stale: boolean): string {
  const player = data.player!
  const locale = language(settings)
  if (stale) {
    return '<section class="ll-session ll-session--empty">' + identity(player, copy, locale, true)
      + emptyState(copy.sessionUnavailable, copy.stale, 'history') + '</section>'
  }
  const session = data.session
  if (!session) {
    const title = player.presence === 'not-playing' ? copy.noActiveGame : copy.statusUnavailable
    return '<section class="ll-session ll-session--empty">' + identity(player, copy, locale, false)
      + emptyState(title, '', 'game') + '</section>'
  }

  const name = championName(session.championId) || copy.championUnavailable
  const splash = image(championSplash(session.championId), 'll-session-splash', '', 480, 260, 'remove')
  const avatar = championArtwork(session.championId, 'll-champion-avatar')
  const allLiveUnknown = session.level === null && session.kda === null && session.cs === null && session.gold === null && session.items === null
  const note = allLiveUnknown ? copy.spectatorCaption : copy.partialLiveCaption
  const kda = session.kda
    ? [session.kda.kills, session.kda.deaths, session.kda.assists].map(value => numberFormat(value, locale)).join(' / ')
    : '—'
  const cs = session.cs === null ? '—' : numberFormat(session.cs, locale)
  const gold = session.gold === null ? '—' : numberFormat(session.gold, locale)
  const level = session.level === null ? '—' : numberFormat(session.level, locale)
  const started = session.startedAtMs === null ? '—' : elapsedLabel(Date.now() - session.startedAtMs)
  const clock = '<div class="ll-session-clock"><span>' + escapeHtml(copy.started) + '</span><time data-clock="elapsed">'
    + escapeHtml(started) + '</time></div>'
  return '<section class="ll-session"><div class="ll-session-hero">' + splash
    + '<div class="ll-session-champion">' + avatar + '<div class="ll-session-title"><span class="ll-session-queue">'
    + escapeHtml(queueLine(session.queueId, copy)) + '</span><strong>' + escapeHtml(name) + '</strong></div>'
    + clock + '</div></div><dl class="ll-session-metrics">'
    + stat(copy.compactKda, kda, 'll-stat--kda') + stat(copy.cs, cs) + stat(copy.gold, gold) + stat(copy.matchLevel, level)
    + '</dl>' + itemStrip(session.items, copy) + '<p class="ll-session-note">' + escapeHtml(note) + '</p></section>'
}

function ring(value: number | null, center: string, label: string, detail: string, accessible: string): string {
  const filled = value === null ? null : Math.max(0, Math.min(100, value))
  const fill = filled === null ? '' : '<circle class="ll-ring-fill" cx="50" cy="50" r="43" pathLength="100" stroke-dasharray="'
    + filled + ' 100"/>'
  return '<div class="ll-ring-cell"><div class="ll-ring" role="img" aria-label="' + escapeHtml(accessible) + '">'
    + '<svg class="ll-ring-svg" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43"/>'
    + fill + '</svg><div class="ll-ring-center">' + center + '</div></div>'
    + '<strong>' + escapeHtml(label) + '</strong>' + (detail ? '<span class="ll-ring-detail">' + escapeHtml(detail) + '</span>' : '') + '</div>'
}

function ringsLayout(data: PlayerSnapshot, settings: Settings, copy: Copy, stale: boolean): string {
  const locale = language(settings)
  const player = data.player!
  const rank = player.rank
  const recent = recentStats(data)
  const name = rankTitle(rank, copy, locale)
  const points = rankPoints(rank, copy, locale)
  const rankValue = rank && rank.tier !== 'UNRANKED' && rank.division !== null && !isApex(rank) && rank.lp !== null
    ? Math.max(0, Math.min(100, rank.lp))
    : null
  const winRateValue = recent.count > 0 && player.stats ? player.stats.wins / recent.count * 100 : null
  const rankCenter = rankArtwork(rank)
  const winCenter = '<span class="ll-ring-number">' + escapeHtml(recent.winRate) + '</span>'
  const session = stale ? null : data.session
  const activeName = session ? championName(session.championId) || copy.championUnavailable : ''
  const activeLabel = session
    ? activeName
    : stale
      ? copy.championUnavailable
      : player.presence === 'not-playing'
        ? copy.noActiveGame
        : copy.statusUnavailable
  const activeCenter = session
    ? championArtwork(session.championId, 'll-champion-avatar')
    : '<span class="ll-ring-number">—</span>'
  const kda = session?.kda
    ? [session.kda.kills, session.kda.deaths, session.kda.assists].map(value => numberFormat(value, locale)).join(' / ')
    : '—'
  const activeDetail = session
    ? copy.compactKda + '\n' + kda
    : stale
      ? copy.stale
      : ''
  const cs = session?.cs === null || session?.cs === undefined ? null : session.cs
  const csValue = cs === null ? '—' : numberFormat(cs, locale)
  const csDetail = cs !== null
    ? ''
    : stale
      ? copy.stale
      : !session
        ? player.presence === 'not-playing' ? copy.noActiveGame : copy.statusUnavailable
        : copy.unavailable
  const startedAt = session?.startedAtMs ?? null
  const elapsed = startedAt === null
    ? '<span class="ll-ring-number">—</span>'
    : '<time class="ll-ring-time" data-clock="elapsed">' + escapeHtml(elapsedLabel(Date.now() - startedAt)) + '</time>'
  const elapsedDetail = startedAt !== null
    ? ''
    : stale
      ? copy.stale
      : !session
        ? player.presence === 'not-playing' ? copy.noActiveGame : copy.statusUnavailable
        : copy.unavailable
  const summary = copy.recentRanked(recent.count)
  return '<section class="ll-rings">'
    + ring(rankValue, rankCenter, name, points, copy.currentRank + ': ' + name + ', ' + points)
    + ring(winRateValue, winCenter, copy.winRate, '',
      copy.winRate + ': ' + (recent.winRate === '—' ? copy.noRecentMatches : recent.winRate))
    + ring(null, activeCenter, activeLabel, activeDetail,
      copy.activeChampion + ': ' + (session ? activeName + ' · ' + copy.compactKda + ': ' + kda : activeLabel + (stale ? ' · ' + copy.stale : '')))
    + ring(null, '<span class="ll-ring-number">' + escapeHtml(csValue) + '</span>', copy.currentCs, csDetail,
      copy.currentCs + ': ' + csValue + (csDetail ? ' · ' + csDetail : ''))
    + ring(null, elapsed, copy.started, elapsedDetail,
      copy.started + ': ' + (startedAt === null ? '—' + (elapsedDetail ? ' · ' + elapsedDetail : '') : elapsedLabel(Date.now() - startedAt)))
    + '<p class="ll-sample-caption">' + escapeHtml(summary) + '</p></section>'
}

function matchKda(match: MatchSummary, locale: 'fr' | 'en'): string {
  return [match.kda.kills, match.kda.deaths, match.kda.assists].map(value => numberFormat(value, locale)).join(' / ')
}

function matchRow(match: MatchSummary, copy: Copy, locale: 'fr' | 'en', now: number): string {
  const name = championName(match.championId)
  const artwork = championArtwork(match.championId, 'll-history-champion')
  const outcome = match.win ? copy.victory : copy.defeat
  const age = timeAgo(match.endedAtMs, now, locale, copy)
  const title = outcome + (name ? ' · ' + name : '')
  const absolute = absoluteDate(match.endedAtMs, locale)
  return '<li class="ll-history-row"><div class="ll-history-champ">' + artwork + '</div>'
    + '<div class="ll-history-main"><strong class="' + (match.win ? 'll-victory' : 'll-defeat') + '">'
    + escapeHtml(outcome) + '</strong><span class="ll-history-meta">' + escapeHtml(name || copy.championUnavailable)
    + '</span></div>'
    + '<strong class="ll-history-kda" aria-label="' + escapeHtml(copy.compactKda + ': ' + matchKda(match, locale)) + '">'
    + escapeHtml(matchKda(match, locale)) + '</strong><time class="ll-history-time" datetime="' + escapeHtml(dateIso(match.endedAtMs))
    + '" title="' + escapeHtml(absolute) + '" aria-label="' + escapeHtml(title + ', ' + age) + '">' + escapeHtml(age) + '</time></li>'
}

function historyLayout(data: PlayerSnapshot, settings: Settings, copy: Copy): string {
  const locale = language(settings)
  const now = Date.now()
  const all = data.history.slice().sort((a, b) => b.endedAtMs - a.endedAtMs)
  const shown = all.slice(0, 4)
  if (!shown.length) {
    return '<section class="ll-history"><h2 class="ll-section-title">' + escapeHtml(copy.history) + '</h2>'
      + emptyState(copy.noRecentMatches, copy.noHistory, 'history') + '</section>'
  }
  return '<section class="ll-history"><div class="ll-history-heading"><h2 class="ll-section-title">'
    + escapeHtml(copy.history) + '</h2><span>' + escapeHtml(copy.historySummary(shown.length, all.length))
    + '</span></div><ol class="ll-history-list">' + shown.map(match => matchRow(match, copy, locale, now)).join('')
    + '</ol></section>'
}

function emptyState(title: string, detail: string, iconName: 'link' | 'game' | 'history' | 'cloud'): string {
  return '<div class="ll-empty" role="status" aria-live="polite"><span class="ll-empty-icon">' + icon(iconName)
    + '</span><div><strong>' + escapeHtml(title) + '</strong>' + (detail ? '<p>' + escapeHtml(detail) + '</p>' : '')
    + '</div></div>'
}

function body(layout: Layout, data: PlayerSnapshot, settings: Settings, copy: Copy, stale: boolean): string {
  switch (layout) {
    case 'rank': return rankLayout(data, settings, copy, stale)
    case 'overview': return overviewLayout(data, settings, copy, stale)
    case 'session': return sessionLayout(data, settings, copy, stale)
    case 'rings': return ringsLayout(data, settings, copy, stale)
    case 'history': return historyLayout(data, settings, copy)
  }
}

function stateContent(state: SnapshotState, copy: Copy): string {
  const iconName = state === 'unlinked' ? 'link' : state === 'ready' ? 'game' : 'cloud'
  const detail = copy.stateDetails[state] || copy.retryHint
  return emptyState(copy.states[state], detail, iconName)
}

function handleImageError(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  const fallback = target.dataset.llFallback
  if (!fallback || fallback === 'remove') {
    target.remove()
    return
  }
  if (fallback === 'dash') {
    const replacement = document.createElement('span')
    replacement.className = 'll-image-fallback ll-item-placeholder'
    replacement.textContent = '—'
    replacement.setAttribute('role', 'img')
    replacement.setAttribute('aria-label', target.dataset.llFallbackLabel || '')
    target.replaceWith(replacement)
    return
  }
  if (fallback === 'user' || fallback === 'shield' || fallback === 'swords') {
    const replacement = document.createElement('span')
    replacement.className = 'll-image-fallback ' + target.className + ' ll-image-fallback--' + fallback
    replacement.setAttribute('aria-hidden', 'true')
    replacement.innerHTML = icon(fallback)
    target.replaceWith(replacement)
    return
  }
  target.remove()
}

export function render(root: HTMLElement, data: PlayerSnapshot | null, settings: Settings, state: SnapshotState, illustrative: boolean): void {
  const copy = copyFor(settings)
  const locale = language(settings)
  const stale = data !== null && Date.now() > data.expiresAtMs
  const panel = document.createElement('article')
  panel.className = 'll-panel ll-layout-' + settings.layout
  panel.lang = locale
  panel.setAttribute('aria-label', 'League of Legends · ' + copy.layouts[settings.layout])
  const content = data?.player && state === 'ready' ? body(settings.layout, data, settings, copy, stale) : stateContent(state, copy)
  const footer = ['<footer class="ll-footer">']
  if (illustrative) footer.push('<span class="ll-demo">' + escapeHtml(copy.demo) + '</span>')
  if (stale) footer.push('<span class="ll-stale">' + escapeHtml(copy.stale) + '</span>')
  footer.push('<span class="ll-notice">' + escapeHtml(copy.notice) + '</span></footer>')
  panel.addEventListener('error', handleImageError, true)
  panel.innerHTML = content + footer.join('')
  root.replaceChildren(panel)
  updateClocks(root, data, settings)
}

export function updateClocks(root: HTMLElement, data: PlayerSnapshot | null, settings: Settings): void {
  const isStale = data !== null && Date.now() > data.expiresAtMs
  const startedAt = data?.session?.startedAtMs
  const now = Date.now()
  const clockLayout = settings.layout === 'session' || settings.layout === 'rings'
  const value = clockLayout && !isStale && startedAt !== null && startedAt !== undefined
    ? elapsedLabel(now - startedAt)
    : '—'
  for (const node of root.querySelectorAll<HTMLElement>('[data-clock="elapsed"]')) {
    if (node.textContent !== value) node.textContent = value
  }
}
