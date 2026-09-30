import type { ZodiacKey } from './types'

export type ZodiacOption = {
  key: ZodiacKey
  label: string
  animal: string
  glyph: string
  tone: 'rose' | 'sage' | 'peach' | 'lilac' | 'sky' | 'sand'
}

export const ZODIAC_OPTIONS: ZodiacOption[] = [
  { key: 'rat', label: 'Tý', animal: 'Chuột', glyph: '🐭', tone: 'sky' },
  { key: 'buffalo', label: 'Sửu', animal: 'Trâu', glyph: '🐃', tone: 'sand' },
  { key: 'tiger', label: 'Dần', animal: 'Hổ', glyph: '🐯', tone: 'peach' },
  { key: 'cat', label: 'Mão', animal: 'Mèo', glyph: '🐱', tone: 'rose' },
  { key: 'dragon', label: 'Thìn', animal: 'Rồng', glyph: '🐉', tone: 'sage' },
  { key: 'snake', label: 'Tỵ', animal: 'Rắn', glyph: '🐍', tone: 'lilac' },
  { key: 'horse', label: 'Ngọ', animal: 'Ngựa', glyph: '🐴', tone: 'sand' },
  { key: 'goat', label: 'Mùi', animal: 'Dê', glyph: '🐐', tone: 'sage' },
  { key: 'monkey', label: 'Thân', animal: 'Khỉ', glyph: '🐵', tone: 'peach' },
  { key: 'rooster', label: 'Dậu', animal: 'Gà', glyph: '🐓', tone: 'rose' },
  { key: 'dog', label: 'Tuất', animal: 'Chó', glyph: '🐶', tone: 'sky' },
  { key: 'pig', label: 'Hợi', animal: 'Heo', glyph: '🐷', tone: 'lilac' },
]

export const zodiacByKey = (key?: ZodiacKey) => ZODIAC_OPTIONS.find(option => option.key === key)
