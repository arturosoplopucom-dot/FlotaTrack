import { create } from 'zustand'

export type ThemePreset = {
  id: string
  name: string
  mode: 'light' | 'dark'
  primary: string
  primaryDk: string
  primaryLt: string
  primaryBg: string
  primaryBorder: string
  sidebar: string
  surface: string
  surfaceHover: string
  bg: string
  border: string
  // Text colors
  text: string         // main bright text
  textMuted: string    // secondary / muted
  textSubtle: string   // placeholder / disabled
  onPrimary: string    // text ON primary-colored bg (buttons)
  waText: string       // WhatsApp button text color (adapts for light/dark bg)
}

export const DEFAULT_PRESETS: ThemePreset[] = [
  {
    // Obsidian Amber — Dark Slate Industrial
    id: 'black', name: 'Obsidian', mode: 'dark',
    primary: '#F59E0B', primaryDk: '#D97706', primaryLt: '#FBBF24',
    primaryBg: 'rgba(245,158,11,0.14)', primaryBorder: 'rgba(245,158,11,0.30)',
    sidebar: '#0F1520', surface: '#151B26', surfaceHover: '#1C2433',
    bg: '#0B0F17', border: '#252E3E',
    text: '#F1F5F9', textMuted: '#94A3B8', textSubtle: '#64748B', onPrimary: '#0B0F17',
    waText: '#25D366',
  },
  {
    // Warm Chalk & Cobalt — Light Executive SaaS
    id: 'white', name: 'Chalk', mode: 'light',
    primary: '#2563EB', primaryDk: '#1D4ED8', primaryLt: '#3B82F6',
    primaryBg: 'rgba(37,99,235,0.12)', primaryBorder: 'rgba(37,99,235,0.28)',
    sidebar: '#D6E0F0', surface: '#FAFBFD', surfaceHover: '#E4EBF5',
    bg: '#F1F3F7', border: '#C8D3E8',
    text: '#0F172A', textMuted: '#475569', textSubtle: '#64748B', onPrimary: '#FFFFFF',
    waText: '#15803D',
  },
]

export const PRESETS: ThemePreset[] = [
  {
    id: 'blue', name: 'Azul', mode: 'dark',
    primary: '#2563eb', primaryDk: '#1d4ed8', primaryLt: '#60a5fa',
    primaryBg: 'rgba(37,99,235,0.14)', primaryBorder: 'rgba(37,99,235,0.35)',
    sidebar: '#161c2a', surface: '#1a2235', surfaceHover: '#253047',
    bg: '#0d1117', border: '#253047',
    text: '#e2e8f0', textMuted: '#94a3b8', textSubtle: '#475569', onPrimary: '#ffffff',
    waText: '#4ade80',
  },
  {
    id: 'green', name: 'Verde', mode: 'dark',
    primary: '#059669', primaryDk: '#047857', primaryLt: '#34d399',
    primaryBg: 'rgba(5,150,105,0.14)', primaryBorder: 'rgba(5,150,105,0.35)',
    sidebar: '#0b1e18', surface: '#102620', surfaceHover: '#1a3d2e',
    bg: '#060f0c', border: '#1a3d2e',
    text: '#e2e8f0', textMuted: '#94a3b8', textSubtle: '#475569', onPrimary: '#ffffff',
    waText: '#4ade80',
  },
  {
    id: 'violet', name: 'Violeta', mode: 'dark',
    primary: '#7c3aed', primaryDk: '#6d28d9', primaryLt: '#a78bfa',
    primaryBg: 'rgba(124,58,237,0.14)', primaryBorder: 'rgba(124,58,237,0.35)',
    sidebar: '#13102a', surface: '#1a1635', surfaceHover: '#2a2045',
    bg: '#0c0b14', border: '#2a2045',
    text: '#e2e8f0', textMuted: '#94a3b8', textSubtle: '#475569', onPrimary: '#ffffff',
    waText: '#4ade80',
  },
  {
    id: 'orange', name: 'Naranja', mode: 'dark',
    primary: '#ea580c', primaryDk: '#c2410c', primaryLt: '#fb923c',
    primaryBg: 'rgba(234,88,12,0.14)', primaryBorder: 'rgba(234,88,12,0.35)',
    sidebar: '#1c1008', surface: '#271608', surfaceHover: '#3d2510',
    bg: '#100904', border: '#3d2510',
    text: '#e2e8f0', textMuted: '#94a3b8', textSubtle: '#475569', onPrimary: '#ffffff',
    waText: '#4ade80',
  },
  {
    id: 'teal', name: 'Teal', mode: 'dark',
    primary: '#0891b2', primaryDk: '#0e7490', primaryLt: '#22d3ee',
    primaryBg: 'rgba(8,145,178,0.14)', primaryBorder: 'rgba(8,145,178,0.35)',
    sidebar: '#0a1820', surface: '#0f2530', surfaceHover: '#1a3a4a',
    bg: '#060f14', border: '#1a3a4a',
    text: '#e2e8f0', textMuted: '#94a3b8', textSubtle: '#475569', onPrimary: '#ffffff',
    waText: '#4ade80',
  },
  {
    id: 'rose', name: 'Rosa', mode: 'dark',
    primary: '#e11d48', primaryDk: '#be123c', primaryLt: '#fb7185',
    primaryBg: 'rgba(225,29,72,0.14)', primaryBorder: 'rgba(225,29,72,0.35)',
    sidebar: '#1c0912', surface: '#271020', surfaceHover: '#3d1a2e',
    bg: '#100408', border: '#3d1a2e',
    text: '#e2e8f0', textMuted: '#94a3b8', textSubtle: '#475569', onPrimary: '#ffffff',
    waText: '#4ade80',
  },
]

export type CustomColorKey = 'primary' | 'sidebar' | 'surface' | 'bg'
export type CustomColors = Partial<Record<CustomColorKey, string>>

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function darkenHex(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function lightenHex(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount)
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount)
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function loadCustomColors(): CustomColors {
  try {
    const raw = localStorage.getItem('ft_theme_custom_colors')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persistCustomColors(colors: CustomColors) {
  localStorage.setItem('ft_theme_custom_colors', JSON.stringify(colors))
}

const savedId = localStorage.getItem('ft_theme') ?? 'blue'

type ThemeState = {
  activeId: string
  customColors: CustomColors
  setTheme: (id: string) => void
  setCustomColor: (key: CustomColorKey, value: string | null) => void
  resetCustomColors: () => void
  getActivePreset: () => ThemePreset
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeId: savedId,
  customColors: loadCustomColors(),

  setTheme: (id) => {
    localStorage.setItem('ft_theme', id)
    persistCustomColors({})
    set({ activeId: id, customColors: {} })
  },

  setCustomColor: (key, value) => {
    const current = get().customColors
    let next: CustomColors
    if (value === null) {
      next = { ...current }
      delete next[key]
    } else {
      next = { ...current, [key]: value }
    }
    persistCustomColors(next)
    set({ customColors: next })
  },

  resetCustomColors: () => {
    persistCustomColors({})
    set({ customColors: {} })
  },

  getActivePreset: () => {
    const { activeId } = get()
    return [...DEFAULT_PRESETS, ...PRESETS].find((p) => p.id === activeId) ?? PRESETS[0]
  },
}))
