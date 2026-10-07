import metadata from '../assets/ddragon.json'
import jinx from '../assets/jinx.jpg'
import profile from '../assets/profile.png'
const ranks = import.meta.glob('../assets/ranks/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const portraits = import.meta.glob('../assets/champions/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const items = import.meta.glob('../assets/items/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const champions = metadata.champions as Record<string, { id: string; name: string }>
const assetId = (id: number | null): id is number => id !== null && Number.isSafeInteger(id) && id >= 0 && id <= 100000
// Static game artwork is read only from Riot's fixed Data Dragon origin.
const cdn = `https://ddragon.leagueoflegends.com/cdn/${metadata.version}`
export function rankImage(tier: string): string | null { return ranks[`../assets/ranks/${tier}.png`] || null }
export function championName(id: number | null): string | null { return assetId(id) ? champions[id]?.name || null : null }
export function championImage(id: number | null): string | null {
  const champion = assetId(id) && champions[id]
  return champion ? portraits[`../assets/champions/${champion.id}.png`] || `${cdn}/img/champion/${champion.id}.png` : null
}
export function championSplash(id: number | null): string | null {
  const champion = assetId(id) && champions[id]
  return champion ? champion.id === 'Jinx' ? jinx : `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg` : null
}
export function profileImage(id: number | null): string | null {
  return assetId(id) ? id === 29 ? profile : `${cdn}/img/profileicon/${id}.png` : null
}
export function itemImage(id: number): string | null {
  return assetId(id) && id > 0 ? items[`../assets/items/${id}.png`] || `${cdn}/img/item/${id}.png` : null
}
