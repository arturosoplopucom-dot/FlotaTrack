import { useEffect } from 'react'
import { useThemeStore, hexToRgba, darkenHex, lightenHex } from '../store/theme.store'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const activeId     = useThemeStore((s) => s.activeId)
  const customColors = useThemeStore((s) => s.customColors)
  const getPreset    = useThemeStore((s) => s.getActivePreset)

  useEffect(() => {
    const p = getPreset()
    const root = document.documentElement

    // Palette
    root.style.setProperty('--clr-primary',        p.primary)
    root.style.setProperty('--clr-primary-dk',     p.primaryDk)
    root.style.setProperty('--clr-primary-lt',     p.primaryLt)
    root.style.setProperty('--clr-primary-bg',     p.primaryBg)
    root.style.setProperty('--clr-primary-border', p.primaryBorder)
    root.style.setProperty('--clr-sidebar',        p.sidebar)
    root.style.setProperty('--clr-surface',        p.surface)
    root.style.setProperty('--clr-surface-hover',  p.surfaceHover)
    root.style.setProperty('--clr-bg',             p.bg)
    root.style.setProperty('--clr-border',         p.border)

    // Text colors
    root.style.setProperty('--clr-text',           p.text)
    root.style.setProperty('--clr-text-muted',     p.textMuted)
    root.style.setProperty('--clr-text-subtle',    p.textSubtle)
    root.style.setProperty('--clr-on-primary',     p.onPrimary)
    root.style.setProperty('--clr-wa-text',        p.waText)

    // Semantic status colors — adapt to light vs dark mode
    const dk = p.mode === 'dark'
    root.style.setProperty('--clr-success',        dk ? '#4ade80' : '#15803d')
    root.style.setProperty('--clr-success-bg',     dk ? 'rgba(74,222,128,0.14)'  : 'rgba(21,128,61,0.12)')
    root.style.setProperty('--clr-success-border', dk ? 'rgba(74,222,128,0.30)'  : 'rgba(21,128,61,0.30)')
    root.style.setProperty('--clr-danger',         dk ? '#f87171' : '#b91c1c')
    root.style.setProperty('--clr-danger-bg',      dk ? 'rgba(248,113,113,0.14)' : 'rgba(185,28,28,0.12)')
    root.style.setProperty('--clr-danger-border',  dk ? 'rgba(248,113,113,0.30)' : 'rgba(185,28,28,0.30)')
    root.style.setProperty('--clr-violet',         dk ? '#c4b5fd' : '#6d28d9')
    root.style.setProperty('--clr-violet-bg',      dk ? 'rgba(196,181,253,0.14)' : 'rgba(109,40,217,0.12)')
    root.style.setProperty('--clr-violet-border',  dk ? 'rgba(196,181,253,0.30)' : 'rgba(109,40,217,0.30)')
    root.style.setProperty('--clr-orange',         dk ? '#fb923c' : '#c2410c')
    root.style.setProperty('--clr-orange-bg',      dk ? 'rgba(251,146,60,0.14)'  : 'rgba(194,65,12,0.12)')
    root.style.setProperty('--clr-orange-border',  dk ? 'rgba(251,146,60,0.30)'  : 'rgba(194,65,12,0.30)')
    root.style.setProperty('--clr-teal',           dk ? '#2dd4bf' : '#0f766e')
    root.style.setProperty('--clr-teal-bg',        dk ? 'rgba(45,212,191,0.14)'  : 'rgba(15,118,110,0.12)')
    root.style.setProperty('--clr-fuchsia',        dk ? '#e879f9' : '#a21caf')
    root.style.setProperty('--clr-fuchsia-bg',     dk ? 'rgba(232,121,249,0.14)' : 'rgba(162,28,175,0.12)')
    // WA modal button
    root.style.setProperty('--clr-wa-btn',         dk ? '#86efac' : '#15803d')
    root.style.setProperty('--clr-wa-btn-bg',      dk ? 'rgba(20,83,45,0.30)'   : 'rgba(21,128,61,0.10)')
    root.style.setProperty('--clr-wa-btn-border',  dk ? 'rgba(22,101,52,0.60)'  : 'rgba(21,128,61,0.30)')
    root.style.setProperty('--clr-wa-btn-hover',   dk ? 'rgba(20,83,45,0.50)'   : 'rgba(21,128,61,0.18)')
    root.style.setProperty('--clr-wa-btn-sub',     dk ? '#4ade80' : '#166534')
    // Document number badge (facturas, OTs, cotizaciones)
    root.style.setProperty('--clr-doc-number',     dk ? '#7dd3fc' : '#1d4ed8')
    root.style.setProperty('--clr-doc-number-bg',  dk ? 'rgba(125,211,252,0.12)' : 'rgba(29,78,216,0.08)')
    // Email modal button
    root.style.setProperty('--clr-email-btn',      dk ? '#93c5fd' : '#1d4ed8')
    root.style.setProperty('--clr-email-btn-bg',   dk ? 'rgba(23,37,84,0.40)'   : 'rgba(37,99,235,0.09)')
    root.style.setProperty('--clr-email-btn-border',dk? 'rgba(30,64,175,0.50)'  : 'rgba(37,99,235,0.28)')
    root.style.setProperty('--clr-email-btn-hover', dk? 'rgba(23,37,84,0.60)'   : 'rgba(37,99,235,0.16)')
    root.style.setProperty('--clr-email-btn-sub',  dk ? '#60a5fa' : '#1e40af')

    // Overlay individual custom color overrides
    const { primary, sidebar, surface, bg } = customColors

    if (primary && HEX_RE.test(primary)) {
      root.style.setProperty('--clr-primary',        primary)
      root.style.setProperty('--clr-primary-dk',     darkenHex(primary, 22))
      root.style.setProperty('--clr-primary-lt',     lightenHex(primary, 55))
      root.style.setProperty('--clr-primary-bg',     hexToRgba(primary, 0.14))
      root.style.setProperty('--clr-primary-border', hexToRgba(primary, 0.35))
    }
    if (sidebar && HEX_RE.test(sidebar)) {
      root.style.setProperty('--clr-sidebar', sidebar)
    }
    if (surface && HEX_RE.test(surface)) {
      root.style.setProperty('--clr-surface',       surface)
      root.style.setProperty('--clr-surface-hover', lightenHex(surface, 16))
    }
    if (bg && HEX_RE.test(bg)) {
      root.style.setProperty('--clr-bg', bg)
    }
  }, [activeId, customColors])

  return <>{children}</>
}
