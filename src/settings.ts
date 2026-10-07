import type { JsonValue } from '../generated/mywallpaper-runtime'
import { layouts, type Layout } from './contract'
import manifest from '../manifest.json'
export interface Settings {
  layout: Layout
  language: 'auto' | 'fr' | 'en'
  accentColor: string
  backgroundColor: string
  textColor: string
  opacity: number
  blurAmount: number
  cornerRadius: number
  showChange: boolean
}
// Manifest settings are the single source of defaults for both host and widget.
export const defaults = Object.fromEntries(manifest.settings
  .filter(setting => setting.scope === 'layer' && 'default' in setting)
  .map(setting => [setting.id, setting.default])) as unknown as Settings
export function readSettings(values: Record<string, JsonValue>): Settings {
  const next = { ...defaults }
  if (layouts.includes(values.layout as Layout)) next.layout = values.layout as Layout
  if (['auto', 'fr', 'en'].includes(values.language as string)) next.language = values.language as Settings['language']
  for (const key of ['accentColor', 'backgroundColor', 'textColor'] as const) {
    if (typeof values[key] === 'string' && /^#[\da-f]{6}$/iu.test(values[key])) next[key] = values[key]
  }
  for (const [key, min, max] of [['opacity', 0, 1], ['blurAmount', 0, 30], ['cornerRadius', 0, 40]] as const) {
    const value = values[key]
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = Math.max(min, Math.min(max, value))
  }
  if (typeof values.showChange === 'boolean') next.showChange = values.showChange
  return next
}
export function applySettings(root: HTMLElement, settings: Settings): void {
  root.style.setProperty('--ll-accent', settings.accentColor)
  root.style.setProperty('--ll-surface', settings.backgroundColor)
  root.style.setProperty('--ll-text', settings.textColor)
  root.style.setProperty('--ll-opacity', `${settings.opacity * 100}%`)
  root.style.setProperty('--ll-blur', `${settings.blurAmount}px`)
  root.style.setProperty('--ll-radius', `${settings.cornerRadius}px`)
}
