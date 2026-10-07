const paths = {
  shield: '<path d="M12 3 19 6v5c0 4.8-3.2 8.2-7 10-3.8-1.8-7-5.2-7-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  user: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  swords: '<path d="m5 4 5 5m9-5-5 5M6 5l6 6m6-6-6 6"/><path d="m8 13 3 3m5-3-3 3m-5 2-2 2m10-2 2 2"/>',
  game: '<path d="M7 8h10a4 4 0 0 1 3.8 5l-1.2 4a2.4 2.4 0 0 1-4.1 1l-1.1-1.2h-4.8l-1.1 1.2a2.4 2.4 0 0 1-4.1-1l-1.2-4A4 4 0 0 1 7 8Z"/><path d="M8 11v4m-2-2h4m7-1h.01M18 14h.01"/>',
  link: '<path d="m10 13 4-4"/><path d="m8.5 15.5-1 1a4 4 0 0 1-5.7-5.7l4-4a4 4 0 0 1 5.7 0m4.5 1.7 1-1a4 4 0 0 1 5.7 5.7l-4 4a4 4 0 0 1-5.7 0"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9Z"/><path d="M8 22h8"/>',
} as const

export type IconName = keyof typeof paths

export function icon(name: IconName): string {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>'
}
