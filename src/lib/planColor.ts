import type { CSSProperties } from 'react'

// Each plan gets a stable colour derived from its id, so the same plan looks
// the same on the plan list, the week grid and the day agenda.
const palette = [
  { bg: '#f7c9cf', bd: '#e08a97', ink: '#6d2a35', bar: '#e57a8b' },
  { bg: '#fbd9b5', bd: '#e5a25f', ink: '#6b3e12', bar: '#ee9a45' },
  { bg: '#f6e7a6', bd: '#d2b94e', ink: '#5c4d0c', bar: '#d8b72e' },
  { bg: '#c9e6c1', bd: '#82b87a', ink: '#27501f', bar: '#5faa56' },
  { bg: '#bfe6e3', bd: '#6fb9b4', ink: '#17514d', bar: '#3fa8a1' },
  { bg: '#c6dcf6', bd: '#7fa7d8', ink: '#1f4575', bar: '#4d86cc' },
  { bg: '#d8cdf4', bd: '#9b87d2', ink: '#3b2c6e', bar: '#7a62cc' },
  { bg: '#f1c8ea', bd: '#cf88c4', ink: '#6a2a60', bar: '#c25fb3' },
  { bg: '#fcc9b6', bd: '#e28d6f', ink: '#6e2f18', bar: '#e5724b' },
  { bg: '#dbeaa7', bd: '#a3bf4f', ink: '#3f5210', bar: '#8db228' },
  { bg: '#b9e2f2', bd: '#68b4d6', ink: '#17506b', bar: '#35a0cf' },
  { bg: '#e6d0c0', bd: '#b98f74', ink: '#573823', bar: '#a8704d' },
]

export function planTint(id: string): CSSProperties {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h = (h ^ (h >>> 16)) >>> 0
  const c = palette[h % palette.length]
  return { '--pc-bg': c.bg, '--pc-bd': c.bd, '--pc-ink': c.ink, '--pc-bar': c.bar } as CSSProperties
}
