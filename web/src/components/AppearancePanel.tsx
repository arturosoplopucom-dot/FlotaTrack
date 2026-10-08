import { useState, useEffect } from 'react'
import { X, Check, Palette, LayoutList, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw, Lock } from 'lucide-react'
import { PRESETS, DEFAULT_PRESETS, useThemeStore } from '../store/theme.store'
import type { CustomColorKey } from '../store/theme.store'
import { NAV_META, NAV_SECTIONS, SECTION_COLOR, useMenuStore } from '../store/menu.store'

type Tab = 'color' | 'menu'

interface Props {
  open: boolean
  onClose: () => void
}

const COLOR_CONFIGS: { key: CustomColorKey; label: string; desc: string; placeholder: string }[] = [
  { key: 'primary', label: 'Color de acción',       desc: 'Botones, tabs activos, íconos y destacados', placeholder: '#2563eb' },
  { key: 'sidebar', label: 'Sidebar y barra superior', desc: 'Fondo del menú lateral y topbar',          placeholder: '#161c2a' },
  { key: 'surface', label: 'Tarjetas y paneles',    desc: 'Fondo de tarjetas, modales y formularios',    placeholder: '#1a2235' },
  { key: 'bg',      label: 'Fondo de página',       desc: 'Fondo principal de todas las pantallas',      placeholder: '#0d1117' },
]

export function AppearancePanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('color')

  const activeId       = useThemeStore((s) => s.activeId)
  const customColors   = useThemeStore((s) => s.customColors)
  const setTheme       = useThemeStore((s) => s.setTheme)
  const setCustomColor = useThemeStore((s) => s.setCustomColor)
  const resetCustom    = useThemeStore((s) => s.resetCustomColors)
  const getPreset      = useThemeStore((s) => s.getActivePreset)

  const sectionOrder = useMenuStore((s) => s.sectionOrder)
  const hidden       = useMenuStore((s) => s.hidden)
  const toggleHidden = useMenuStore((s) => s.toggleHidden)
  const moveUp       = useMenuStore((s) => s.moveUp)
  const moveDown     = useMenuStore((s) => s.moveDown)
  const resetMenu    = useMenuStore((s) => s.reset)

  // Local hex input state — syncs when customColors clears (e.g. on preset change)
  const [localColors, setLocalColors] = useState<Record<CustomColorKey, string>>({
    primary: customColors.primary ?? '',
    sidebar: customColors.sidebar ?? '',
    surface: customColors.surface ?? '',
    bg:      customColors.bg      ?? '',
  })

  // Sync local inputs when custom colors are externally reset (e.g. preset selected)
  useEffect(() => {
    setLocalColors({
      primary: customColors.primary ?? '',
      sidebar: customColors.sidebar ?? '',
      surface: customColors.surface ?? '',
      bg:      customColors.bg      ?? '',
    })
  }, [customColors.primary, customColors.sidebar, customColors.surface, customColors.bg])

  if (!open) return null

  const preset = getPreset()
  const hasAnyCustom = Object.keys(customColors).length > 0

  const PRESET_COLOR: Record<CustomColorKey, string> = {
    primary: preset.primary,
    sidebar: preset.sidebar,
    surface: preset.surface,
    bg:      preset.bg,
  }

  const handleColorChange = (key: CustomColorKey, val: string) => {
    setLocalColors((prev) => ({ ...prev, [key]: val }))
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setCustomColor(key, val)
  }

  const clearColor = (key: CustomColorKey) => {
    setLocalColors((prev) => ({ ...prev, [key]: '' }))
    setCustomColor(key, null)
  }

  const hiddenCount = hidden.length

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(0,0,0,0.45)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 999,
        width: 300,
        background: 'var(--clr-sidebar)',
        borderLeft: '1px solid var(--clr-border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--clr-border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Palette size={15} style={{ color: 'var(--clr-primary)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--clr-text)' }}>Apariencia</div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1 }}>Personaliza el sistema</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', padding: 4, borderRadius: 6, display: 'flex' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--clr-surface)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: 0,
          padding: '8px 14px',
          borderBottom: '1px solid var(--clr-border)',
        }}>
          {([['color', 'Color', Palette], ['menu', 'Menú', LayoutList]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: tab === key ? 'var(--clr-primary-bg)' : 'transparent',
                color: tab === key ? 'var(--clr-primary)' : 'var(--clr-text-subtle)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Icon size={13} />
              {label}
              {key === 'menu' && hiddenCount > 0 && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--clr-primary)', color: 'var(--clr-on-primary)', fontWeight: 700 }}>
                  {hiddenCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* ── COLOR TAB ── */}
          {tab === 'color' && (
            <>
              {/* Default color: Blanco / Negro */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--clr-text-subtle)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Restablecer color predeterminado
                </div>
                <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 10 }}>
                  Restablece todos los colores personalizados a un esquema neutro
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {DEFAULT_PRESETS.map((p) => {
                    const isActive = activeId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setTheme(p.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px',
                          background: p.bg,
                          border: `1.5px solid ${isActive ? p.primary : p.border}`,
                          borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = p.primaryBorder }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = isActive ? p.primary : p.border }}
                      >
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          background: p.primary,
                          border: `2px solid ${p.primaryBorder}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isActive && <Check size={13} color={p.onPrimary} strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: p.text }}>{p.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--clr-border)', marginBottom: 18 }} />

              {/* Presets */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--clr-text-subtle)', textTransform: 'uppercase', marginBottom: 10 }}>
                Paletas de color
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {PRESETS.map((p) => {
                  const isActive = activeId === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setTheme(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px',
                        background: 'var(--clr-surface)',
                        border: `1.5px solid ${isActive ? p.primary : 'var(--clr-border)'}`,
                        borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = p.primary + '88' }}
                      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--clr-border)' }}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: p.primary, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isActive && <Check size={13} color="white" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--clr-text)' : 'var(--clr-text-subtle)' }}>{p.name}</span>
                    </button>
                  )
                })}
              </div>

              {/* Custom colors */}
              <div style={{ marginTop: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--clr-text-subtle)', textTransform: 'uppercase' }}>
                    Colores personalizados
                  </div>
                  {hasAnyCustom && (
                    <button
                      onClick={resetCustom}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--clr-text-subtle)', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--clr-text)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--clr-text-subtle)' }}
                    >
                      <RotateCcw size={10} />
                      Restablecer
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {COLOR_CONFIGS.map((cfg) => {
                    const localVal = localColors[cfg.key]
                    const storeVal = customColors[cfg.key]
                    const swatchColor = (localVal && /^#[0-9a-fA-F]{6}$/.test(localVal))
                      ? localVal
                      : PRESET_COLOR[cfg.key]
                    const isCustomized = !!storeVal

                    return (
                      <div key={cfg.key} style={{
                        background: 'var(--clr-surface)',
                        border: `1px solid ${isCustomized ? 'var(--clr-primary-border)' : 'var(--clr-border)'}`,
                        borderRadius: 10,
                        padding: '10px 12px',
                        transition: 'border-color 0.15s',
                      }}>
                        {/* Label + desc */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)' }}>{cfg.label}</span>
                            {isCustomized && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--clr-primary-bg)', color: 'var(--clr-primary)' }}>
                                ACTIVO
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{cfg.desc}</div>
                        </div>

                        {/* Picker row */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {/* Color swatch + native picker */}
                          <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                            <div style={{
                              width: 34, height: 34, borderRadius: 8,
                              background: swatchColor,
                              border: '2px solid var(--clr-border)',
                              overflow: 'hidden',
                            }}>
                              <input
                                type="color"
                                value={localVal && /^#[0-9a-fA-F]{6}$/.test(localVal) ? localVal : PRESET_COLOR[cfg.key]}
                                onChange={(e) => handleColorChange(cfg.key, e.target.value)}
                                style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                              />
                            </div>
                          </label>

                          {/* Hex text input */}
                          <input
                            type="text"
                            value={localVal}
                            onChange={(e) => handleColorChange(cfg.key, e.target.value)}
                            maxLength={7}
                            placeholder={cfg.placeholder}
                            style={{
                              flex: 1, padding: '7px 10px',
                              background: 'var(--clr-bg)',
                              border: `1px solid ${localVal && !/^#[0-9a-fA-F]{6}$/.test(localVal) ? 'var(--clr-danger)' : 'var(--clr-border)'}`,
                              borderRadius: 7, color: 'var(--clr-text)', fontSize: 12,
                              fontFamily: 'monospace', outline: 'none',
                              transition: 'border-color 0.15s',
                            }}
                          />

                          {/* Clear button */}
                          <button
                            onClick={() => clearColor(cfg.key)}
                            disabled={!isCustomized}
                            title={isCustomized ? 'Restablecer al preset' : 'Sin personalización'}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 28, height: 28, borderRadius: 6,
                              background: isCustomized ? 'var(--clr-danger-bg)' : 'transparent',
                              border: `1px solid ${isCustomized ? 'var(--clr-danger-border)' : 'transparent'}`,
                              cursor: isCustomized ? 'pointer' : 'default',
                              color: isCustomized ? 'var(--clr-danger)' : 'var(--clr-text-subtle)',
                              transition: 'all 0.15s', flexShrink: 0,
                            }}
                            onMouseEnter={(e) => { if (isCustomized) (e.currentTarget as HTMLElement).style.background = 'var(--clr-danger-bg)' }}
                            onMouseLeave={(e) => { if (isCustomized) (e.currentTarget as HTMLElement).style.background = 'var(--clr-danger-bg)' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Live preview */}
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--clr-text-subtle)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Vista previa
                </div>
                <div style={{ background: 'var(--clr-surface)', borderRadius: 10, padding: 14, border: '1px solid var(--clr-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'var(--clr-primary-bg)', position: 'relative', marginBottom: 4 }}>
                    <div style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: 3, borderRadius: 2, background: 'var(--clr-primary)' }} />
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--clr-primary)', marginLeft: 4 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-primary)' }}>Dashboard</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--clr-danger)', color: 'white' }}>3</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, marginBottom: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--clr-text-subtle)' }} />
                    <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>Equipos</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ padding: '5px 14px', borderRadius: 6, background: 'var(--clr-primary)', fontSize: 11, fontWeight: 600, color: 'var(--clr-on-primary)' }}>Guardar</div>
                    <div style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--clr-border)', fontSize: 11, color: 'var(--clr-text-muted)' }}>Cancelar</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── MENU TAB ── */}
          {tab === 'menu' && (
            <>
              {NAV_SECTIONS.map((section) => {
                const order = sectionOrder[section] ?? NAV_META.filter((n) => n.section === section).map((n) => n.key)
                const items = order.map((key) => NAV_META.find((n) => n.key === key)).filter(Boolean) as typeof NAV_META

                return (
                  <div key={section} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                        padding: '2px 7px', borderRadius: 4,
                        background: SECTION_COLOR[section]?.bg ?? 'rgba(148,163,184,0.15)',
                        color: SECTION_COLOR[section]?.color ?? 'var(--clr-text-muted)',
                        textTransform: 'uppercase',
                      }}>
                        {section}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {items.map((item, idx) => {
                        const isHidden = hidden.includes(item.key)
                        const isFirst  = idx === 0
                        const isLast   = idx === items.length - 1

                        return (
                          <div
                            key={item.key}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '8px 10px', borderRadius: 8,
                              background: 'var(--clr-surface)',
                              border: '1px solid var(--clr-border)',
                              opacity: isHidden ? 0.45 : 1,
                              transition: 'opacity 0.15s',
                            }}
                          >
                            {/* Drag handle (visual) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, cursor: 'grab', flexShrink: 0, opacity: 0.3 }}>
                              <div style={{ width: 12, height: 1.5, background: 'var(--clr-text-subtle)', borderRadius: 1 }} />
                              <div style={{ width: 12, height: 1.5, background: 'var(--clr-text-subtle)', borderRadius: 1 }} />
                              <div style={{ width: 12, height: 1.5, background: 'var(--clr-text-subtle)', borderRadius: 1 }} />
                            </div>

                            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: isHidden ? 'var(--clr-text-subtle)' : 'var(--clr-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.label}
                            </span>

                            {item.locked && (
                              <Lock size={11} style={{ color: 'var(--clr-text-subtle)', flexShrink: 0 }} title="No se puede ocultar" />
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                              <button
                                onClick={() => moveUp(section, item.key)}
                                disabled={isFirst}
                                title="Subir"
                                style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: isFirst ? 'default' : 'pointer', color: isFirst ? 'var(--clr-border)' : 'var(--clr-text-subtle)', display: 'flex', borderRadius: 3 }}
                                onMouseEnter={(e) => { if (!isFirst) (e.currentTarget as HTMLElement).style.color = 'var(--clr-primary)' }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = isFirst ? 'var(--clr-border)' : 'var(--clr-text-subtle)' }}
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                onClick={() => moveDown(section, item.key)}
                                disabled={isLast}
                                title="Bajar"
                                style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: isLast ? 'default' : 'pointer', color: isLast ? 'var(--clr-border)' : 'var(--clr-text-subtle)', display: 'flex', borderRadius: 3 }}
                                onMouseEnter={(e) => { if (!isLast) (e.currentTarget as HTMLElement).style.color = 'var(--clr-primary)' }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = isLast ? 'var(--clr-border)' : 'var(--clr-text-subtle)' }}
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>

                            <button
                              onClick={() => toggleHidden(item.key)}
                              disabled={!!item.locked}
                              title={item.locked ? 'No se puede ocultar' : isHidden ? 'Mostrar' : 'Ocultar'}
                              style={{
                                background: 'none', border: 'none', cursor: item.locked ? 'default' : 'pointer',
                                color: isHidden ? 'var(--clr-text-subtle)' : 'var(--clr-text-muted)',
                                display: 'flex', padding: '2px', borderRadius: 4, flexShrink: 0,
                              }}
                              onMouseEnter={(e) => { if (!item.locked) (e.currentTarget as HTMLElement).style.color = isHidden ? 'var(--clr-primary-lt)' : 'var(--clr-text)' }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = isHidden ? 'var(--clr-text-subtle)' : 'var(--clr-text-muted)' }}
                            >
                              {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <button
                onClick={resetMenu}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', marginTop: 8, padding: '9px 0',
                  background: 'transparent', border: '1px solid var(--clr-border)',
                  borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--clr-text-subtle)',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--clr-text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--clr-text-subtle)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--clr-text-subtle)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--clr-border)' }}
              >
                <RotateCcw size={13} />
                Restablecer menú
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid var(--clr-border)',
          fontSize: 11, color: 'var(--clr-text-subtle)', textAlign: 'center',
        }}>
          Los cambios se guardan automáticamente
        </div>
      </div>
    </>
  )
}
