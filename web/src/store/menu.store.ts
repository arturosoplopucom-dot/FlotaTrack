import { create } from 'zustand'

export type NavMeta = {
  key: string
  label: string
  section: string
  locked?: boolean  // cannot be hidden
}

export const NAV_META: NavMeta[] = [
  { key: 'dashboard',   label: 'Dashboard',          section: 'GENERAL',     locked: true },
  { key: 'equipment',   label: 'Equipos',             section: 'OPERACIONES' },
  { key: 'quotes',      label: 'Cotizaciones',        section: 'OPERACIONES' },
  { key: 'operators',   label: 'Operarios',           section: 'OPERACIONES' },
  { key: 'maintenance', label: 'Mantenimiento',       section: 'OPERACIONES' },
  { key: 'workorders',  label: 'Órdenes de Trabajo',  section: 'OPERACIONES' },
  { key: 'clients',     label: 'Clientes',            section: 'COMERCIAL'   },
  { key: 'cxc',         label: 'Cobranza',            section: 'COMERCIAL'   },
  { key: 'aging',       label: 'Antigüedad CxC',      section: 'COMERCIAL'   },
  { key: 'payments',    label: 'Pagos',               section: 'COMERCIAL'   },
  { key: 'reports',     label: 'Reportes',            section: 'ANÁLISIS'    },
  { key: 'profile',     label: 'Empresa',             section: 'SISTEMA',    locked: true },
]

export const NAV_SECTIONS = ['GENERAL', 'OPERACIONES', 'COMERCIAL', 'ANÁLISIS', 'SISTEMA'] as const

export const SECTION_COLOR: Record<string, { bg: string; color: string }> = {
  GENERAL:     { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  OPERACIONES: { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
  COMERCIAL:   { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
  ANÁLISIS:    { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
  SISTEMA:     { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
}

function buildDefaultOrder(): Record<string, string[]> {
  return Object.fromEntries(
    NAV_SECTIONS.map((s) => [
      s,
      NAV_META.filter((n) => n.section === s).map((n) => n.key),
    ])
  )
}

function loadOrder(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem('ft_menu_order')
    return raw ? JSON.parse(raw) : buildDefaultOrder()
  } catch {
    return buildDefaultOrder()
  }
}

function loadHidden(): string[] {
  try {
    const raw = localStorage.getItem('ft_menu_hidden')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

type MenuState = {
  sectionOrder: Record<string, string[]>
  hidden: string[]
  toggleHidden: (key: string) => void
  moveUp: (section: string, key: string) => void
  moveDown: (section: string, key: string) => void
  reset: () => void
}

function persist(order: Record<string, string[]>, hidden: string[]) {
  localStorage.setItem('ft_menu_order', JSON.stringify(order))
  localStorage.setItem('ft_menu_hidden', JSON.stringify(hidden))
}

export const useMenuStore = create<MenuState>((set, get) => ({
  sectionOrder: loadOrder(),
  hidden: loadHidden(),

  toggleHidden: (key) => {
    const meta = NAV_META.find((n) => n.key === key)
    if (meta?.locked) return
    const { hidden, sectionOrder } = get()
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
    persist(sectionOrder, next)
    set({ hidden: next })
  },

  moveUp: (section, key) => {
    const { sectionOrder, hidden } = get()
    const order = [...(sectionOrder[section] ?? [])]
    const idx = order.indexOf(key)
    if (idx <= 0) return
    ;[order[idx - 1], order[idx]] = [order[idx], order[idx - 1]]
    const next = { ...sectionOrder, [section]: order }
    persist(next, hidden)
    set({ sectionOrder: next })
  },

  moveDown: (section, key) => {
    const { sectionOrder, hidden } = get()
    const order = [...(sectionOrder[section] ?? [])]
    const idx = order.indexOf(key)
    if (idx < 0 || idx >= order.length - 1) return
    ;[order[idx], order[idx + 1]] = [order[idx + 1], order[idx]]
    const next = { ...sectionOrder, [section]: order }
    persist(next, hidden)
    set({ sectionOrder: next })
  },

  reset: () => {
    const defaults = buildDefaultOrder()
    persist(defaults, [])
    set({ sectionOrder: defaults, hidden: [] })
  },
}))
