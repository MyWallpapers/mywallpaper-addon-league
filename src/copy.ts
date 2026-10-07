import type { Layout, SnapshotState, RankedInfo } from './contract'
import type { Settings } from './settings'

export interface Copy {
  layouts: Record<Layout, string>
  states: Record<SnapshotState, string>
  stateDetails: Partial<Record<SnapshotState, string>>
  rankUnavailable: string
  unranked: string
  noDivision: string
  lp: string
  lastLpChange: string
  recentRanked(matches: number): string
  historySummary(visible: number, total: number): string
  winRate: string
  activeChampion: string
  currentCs: string
  averageKda: string
  matches: string
  sessionUnavailable: string
  noActiveGame: string
  statusUnavailable: string
  inGame: string
  championUnavailable: string
  accountLevel: string
  matchLevel: string
  cs: string
  gold: string
  items: string
  started: string
  queueSolo: string
  queueFlex: string
  currentMatch: string
  spectatorCaption: string
  partialLiveCaption: string
  noRecentMatches: string
  noHistory: string
  victory: string
  defeat: string
  justNow: string
  demo: string
  stale: string
  notice: string
  retryHint: string
  unavailable: string
  noItems: string
  compactKda: string
  currentRank: string
  profile: string
  history: string
}

const en: Copy = {
  layouts: {
    rank: 'Rank and profile',
    overview: 'Rank overview',
    session: 'Current session',
    rings: 'Ranked snapshot',
    history: 'Recent ranked games',
  },
  states: {
    unlinked: 'Connect a Riot profile',
    loading: 'Loading ranked profile…',
    ready: 'Profile unavailable',
    offline: 'Profile service unavailable',
    error: 'Could not read profile data',
  },
  stateDetails: {
    unlinked: 'Add the public profile link in this add-on’s settings.',
    loading: 'Waiting for the latest ranked snapshot.',
    offline: 'Reconnect through this add-on’s settings to try again.',
    error: 'Check the public profile link, then reconnect in the add-on settings.',
  },
  rankUnavailable: 'Rank unavailable',
  unranked: 'Unranked',
  noDivision: 'No division',
  lp: 'LP',
  lastLpChange: 'Last LP change',
  recentRanked: matches => matches === 0
    ? 'No recent ranked matches'
    : 'Recent ranked only · ' + matches + (matches === 1 ? ' match' : ' matches') + ' · up to 10',
  historySummary: (visible, total) => 'Showing ' + visible + ' of ' + total + ' recent ranked ' + (total === 1 ? 'game' : 'games') + ' · up to 10',
  winRate: 'Win rate',
  activeChampion: 'Active champion',
  currentCs: 'Current CS',
  averageKda: 'Average K / D / A',
  matches: 'Matches',
  sessionUnavailable: 'Session details unavailable',
  noActiveGame: 'No active game',
  statusUnavailable: 'Status unavailable',
  inGame: 'In a match',
  championUnavailable: 'Champion unavailable',
  accountLevel: 'Account level',
  matchLevel: 'In-game level',
  cs: 'CS',
  gold: 'Gold',
  items: 'Items',
  started: 'Elapsed',
  queueSolo: 'Ranked Solo/Duo',
  queueFlex: 'Ranked Flex',
  currentMatch: 'Current match',
  spectatorCaption: 'Spectator data provides the champion and start time; live stats, level and items are unavailable.',
  partialLiveCaption: 'Some live match details are unavailable from the spectator data.',
  noRecentMatches: 'No recent ranked matches',
  noHistory: 'No completed ranked games in this snapshot.',
  victory: 'Victory',
  defeat: 'Defeat',
  justNow: 'Just now',
  demo: 'Fictional sample · thumbnail preview',
  stale: 'Last known data',
  notice: 'Independent widget · Not endorsed by Riot Games',
  retryHint: 'Check the profile link or reconnect in the add-on settings.',
  unavailable: 'Unavailable',
  noItems: 'No items recorded',
  compactKda: 'K / D / A',
  currentRank: 'Current rank',
  profile: 'Player profile',
  history: 'Match history',
}

const fr: Copy = {
  layouts: {
    rank: 'Rang et profil',
    overview: 'Aperçu du rang',
    session: 'Partie en cours',
    rings: 'Résumé classé',
    history: 'Parties classées récentes',
  },
  states: {
    unlinked: 'Connecter un profil Riot',
    loading: 'Chargement du profil classé…',
    ready: 'Profil indisponible',
    offline: 'Service de profil indisponible',
    error: 'Lecture des données impossible',
  },
  stateDetails: {
    unlinked: 'Ajoutez le lien de profil public dans les réglages de cet add-on.',
    loading: 'En attente du dernier relevé de classement.',
    offline: 'Relancez la connexion depuis les réglages de cet add-on.',
    error: 'Vérifiez le lien du profil public, puis relancez la connexion dans les réglages.',
  },
  rankUnavailable: 'Rang indisponible',
  unranked: 'Non classé',
  noDivision: 'Sans division',
  lp: 'LP',
  lastLpChange: 'Dernière variation de LP',
  recentRanked: matches => matches === 0
    ? 'Aucune partie classée récente'
    : 'Parties classées récentes · ' + matches + (matches === 1 ? ' partie' : ' parties') + ' · 10 max.',
  historySummary: (visible, total) => 'Affichage de ' + visible + ' sur ' + total + ' parties classées récentes · 10 max.',
  winRate: 'Victoires',
  activeChampion: 'Champion en partie',
  currentCs: 'Sbires actuels',
  averageKda: 'K / D / A moyen',
  matches: 'Parties',
  sessionUnavailable: 'Détails de partie indisponibles',
  noActiveGame: 'Aucune partie en cours',
  statusUnavailable: 'Statut indisponible',
  inGame: 'En partie',
  championUnavailable: 'Champion indisponible',
  accountLevel: 'Niveau de compte',
  matchLevel: 'Niveau en partie',
  cs: 'Sbires',
  gold: 'Or',
  items: 'Objets',
  started: 'Durée',
  queueSolo: 'Classée solo/duo',
  queueFlex: 'Classée flexible',
  currentMatch: 'Partie en cours',
  spectatorCaption: 'Le mode spectateur fournit le champion et le début de partie ; les statistiques, le niveau et les objets en direct sont indisponibles.',
  partialLiveCaption: 'Certaines données de partie restent indisponibles avec le mode spectateur.',
  noRecentMatches: 'Aucune partie classée récente',
  noHistory: 'Aucune partie classée terminée dans ce relevé.',
  victory: 'Victoire',
  defeat: 'Défaite',
  justNow: 'À l’instant',
  demo: 'Exemple fictif · aperçu de miniature',
  stale: 'Dernières données connues',
  notice: 'Widget indépendant · Non approuvé par Riot Games',
  retryHint: 'Vérifiez le lien du profil ou relancez la connexion dans les réglages.',
  unavailable: 'Indisponible',
  noItems: 'Aucun objet enregistré',
  compactKda: 'K / D / A',
  currentRank: 'Rang actuel',
  profile: 'Profil du joueur',
  history: 'Historique des parties',
}

export function language(settings: Settings): 'fr' | 'en' {
  if (settings.language !== 'auto') return settings.language
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function copyFor(settings: Settings): Copy {
  return language(settings) === 'fr' ? fr : en
}

const tierNames: Record<'fr' | 'en', Record<Exclude<RankedInfo['tier'], 'UNRANKED'>, string>> = {
  en: {
    IRON: 'Iron',
    BRONZE: 'Bronze',
    SILVER: 'Silver',
    GOLD: 'Gold',
    PLATINUM: 'Platinum',
    EMERALD: 'Emerald',
    DIAMOND: 'Diamond',
    MASTER: 'Master',
    GRANDMASTER: 'Grandmaster',
    CHALLENGER: 'Challenger',
  },
  fr: {
    IRON: 'Fer',
    BRONZE: 'Bronze',
    SILVER: 'Argent',
    GOLD: 'Or',
    PLATINUM: 'Platine',
    EMERALD: 'Émeraude',
    DIAMOND: 'Diamant',
    MASTER: 'Maître',
    GRANDMASTER: 'Grand maître',
    CHALLENGER: 'Challenger',
  },
}

export function rankName(rank: RankedInfo, locale: 'fr' | 'en', copy: Copy): string {
  if (rank.tier === 'UNRANKED') return copy.unranked
  const tier = tierNames[locale][rank.tier]
  return rank.division ? tier + ' ' + rank.division : tier
}

export function queueName(queueId: number, copy: Copy): string {
  if (queueId === 420) return copy.queueSolo
  if (queueId === 440) return copy.queueFlex
  return copy.currentMatch
}

export function numberFormat(value: number, locale: 'fr' | 'en'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

export function timeAgo(timestamp: number, now: number, locale: 'fr' | 'en', copy: Copy): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (elapsedSeconds < 45) return copy.justNow
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (elapsedSeconds < 3600) return formatter.format(-Math.max(1, Math.floor(elapsedSeconds / 60)), 'minute')
  if (elapsedSeconds < 86400) return formatter.format(-Math.floor(elapsedSeconds / 3600), 'hour')
  if (elapsedSeconds < 604800) return formatter.format(-Math.floor(elapsedSeconds / 86400), 'day')
  if (elapsedSeconds < 31536000) return formatter.format(-Math.floor(elapsedSeconds / 604800), 'week')
  return formatter.format(-Math.floor(elapsedSeconds / 31536000), 'year')
}
