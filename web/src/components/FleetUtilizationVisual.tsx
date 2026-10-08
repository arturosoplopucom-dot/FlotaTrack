import { useState } from 'react'
import { useEquipment, type Equipment } from '../hooks/useFlota'

const TYPE_LABELS: Record<Equipment['type'], string> = {
  CRANE:     'Grúas',
  PLATFORM:  'Plataformas',
  FORKLIFT:  'Montacargas',
  EXCAVATOR: 'Excavadoras',
  OTHER:     'Otros Equipos',
}

interface Category {
  id: string
  label: string
  total: number
  rented: number
  available: number
  maintenance: number
  avgDailyRate: number
  currency: string
}

function buildCategories(equipment: Equipment[]): Category[] {
  const map = new Map<string, { items: Equipment[] }>()
  for (const e of equipment) {
    if (e.status === 'RETIRED') continue
    const key = e.type
    if (!map.has(key)) map.set(key, { items: [] })
    map.get(key)!.items.push(e)
  }

  return Array.from(map.entries())
    .map(([type, { items }]) => {
      const rented      = items.filter((e) => e.status === 'IN_USE').length
      const available   = items.filter((e) => e.status === 'AVAILABLE').length
      const maintenance = items.filter((e) => e.status === 'MAINTENANCE').length
      const rates       = items.map((e) => {
        const r = parseFloat(e.dailyRate) || 0
        return e.currency === 'USD' ? r * 3.75 : r
      })
      const avgDailyRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
      return {
        id: type, label: TYPE_LABELS[type as Equipment['type']] ?? type,
        total: items.length, rented, available, maintenance,
        avgDailyRate, currency: 'PEN',
      }
    })
    .sort((a, b) => b.total - a.total)
}

export default function FleetUtilizationVisual() {
  const { data: equipment, isLoading } = useEquipment()
  const [hovered, setHovered] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, height: 340 }}
        className="animate-pulse" />
    )
  }

  const eq         = equipment ?? []
  const categories = buildCategories(eq)

  const totalEq    = categories.reduce((s, c) => s + c.total, 0)
  const totalRented= categories.reduce((s, c) => s + c.rented, 0)
  const totalAvail = categories.reduce((s, c) => s + c.available, 0)
  const totalMaint = categories.reduce((s, c) => s + c.maintenance, 0)
  const overallPct = totalEq > 0 ? (totalRented / totalEq) * 100 : 0

  if (categories.length === 0) {
    return (
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--clr-text-subtle)', fontSize: 13 }}>
        Sin equipos registrados
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)', width: '100%', boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--clr-border)', paddingBottom: 14,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)', margin: 0, letterSpacing: '-0.01em' }}>
              Utilización por Familia de Equipo
            </h3>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-success)', fontVariantNumeric: 'tabular-nums' }}>
              {overallPct.toFixed(1)}% Activa
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
            Disponibilidad operativa por línea de maquinaria
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
          {[
            { color: '#10b981', label: `Alquilados (${totalRented})` },
            { color: 'var(--clr-primary)', label: `Disponibles (${totalAvail})` },
            { color: '#f59e0b', label: `Mantenimiento (${totalMaint})` },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
              <span style={{ color: 'var(--clr-text-muted)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {categories.map((cat) => {
          const rentedPct = cat.total > 0 ? (cat.rented / cat.total) * 100 : 0
          const availPct  = cat.total > 0 ? (cat.available / cat.total) * 100 : 0
          const maintPct  = cat.total > 0 ? (cat.maintenance / cat.total) * 100 : 0
          const isHov     = hovered === cat.id

          return (
            <div
              key={cat.id}
              onMouseEnter={() => setHovered(cat.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '10px 12px', borderRadius: 6,
                background: isHov ? 'var(--clr-surface-hover)' : 'transparent',
                border: isHov ? '1px solid var(--clr-border)' : '1px solid transparent',
                transition: 'background-color 0.15s ease, border-color 0.15s ease',
              }}
            >
              {/* Title row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--clr-text)' }}>{cat.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    ({cat.total} uds{cat.avgDailyRate > 0 ? ` · S/ ${Math.round(cat.avgDailyRate)}/día` : ''})
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: rentedPct >= 80 ? 'var(--clr-success)' : '#d97706', fontVariantNumeric: 'tabular-nums' }}>
                    {rentedPct.toFixed(0)}% Ocupación
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{cat.rented}/{cat.total}</span>
                </div>
              </div>

              {/* Stacked bar */}
              <div style={{
                height: 10, width: '100%', background: 'var(--clr-bg)',
                borderRadius: 5, overflow: 'hidden', display: 'flex', border: '1px solid var(--clr-border)',
              }}>
                <div title={`Alquilados: ${cat.rented} (${rentedPct.toFixed(1)}%)`}
                  style={{ width: `${rentedPct}%`, background: '#10b981', transition: 'width 0.3s ease' }} />
                <div title={`Disponibles: ${cat.available} (${availPct.toFixed(1)}%)`}
                  style={{ width: `${availPct}%`, background: 'var(--clr-primary)', transition: 'width 0.3s ease' }} />
                <div title={`Mantenimiento: ${cat.maintenance} (${maintPct.toFixed(1)}%)`}
                  style={{ width: `${maintPct}%`, background: '#f59e0b', transition: 'width 0.3s ease' }} />
              </div>

              {/* Breakdown numbers */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--clr-text-muted)' }}>
                <span>🟢 <strong style={{ color: 'var(--clr-text)' }}>{cat.rented}</strong> en obra</span>
                <span>🔵 <strong style={{ color: 'var(--clr-text)' }}>{cat.available}</strong> libres</span>
                <span>🟡 <strong style={{ color: 'var(--clr-text)' }}>{cat.maintenance}</strong> en taller</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

