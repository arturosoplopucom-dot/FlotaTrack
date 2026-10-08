import { useState, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, TrendingUp, DollarSign, Wrench, Hash, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { useEquipmentProfitability } from '../hooks/useReports'
import type { ReportPeriod, EquipmentProfitabilityItem } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtP = (n: number) => n.toFixed(1) + '%'

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: '1m', label: 'Último mes' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '1y', label: 'Último año' },
  { value: 'all', label: 'Histórico' },
]

const TYPE_LABELS: Record<string, string> = {
  CRANE: 'Grúa', EXCAVATOR: 'Excavadora', TRUCK: 'Camión',
  TRAILER: 'Tráiler', FORKLIFT: 'Montacargas', OTHER: 'Otro',
}

const CATEGORY_LABELS: Record<string, string> = {
  FUEL: 'Combustible', TOLL: 'Peaje', ALLOWANCE: 'Viáticos',
  MAINTENANCE: 'Mantenimiento Op.', OTHER: 'Otros',
}

const selStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none', cursor: 'pointer',
}

function MarginBar({ pct }: { pct: number }) {
  const clamp = Math.min(Math.max(pct, 0), 100)
  const color = pct >= 30 ? 'var(--clr-success)' : pct >= 10 ? '#d97706' : 'var(--clr-danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--clr-border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${clamp}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>
        {fmtP(pct)}
      </span>
    </div>
  )
}

function MarginBadge({ pct }: { pct: number }) {
  const color = pct >= 30 ? 'var(--clr-success)'    : pct >= 10 ? '#d97706' : 'var(--clr-danger)'
  const bg    = pct >= 30 ? 'var(--clr-success-bg)' : pct >= 10 ? 'rgba(217,119,6,0.10)' : 'var(--clr-danger-bg)'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: bg, color }}>
      {fmtP(pct)}
    </span>
  )
}

function CostBreakdown({ item }: { item: EquipmentProfitabilityItem }) {
  const cats = Object.entries(item.costsByCategory).filter(([, v]) => v > 0)
  return (
    <tr>
      <td colSpan={9} style={{ padding: 0, background: 'var(--clr-bg)' }}>
        <div style={{ padding: '10px 14px 10px 38px', display: 'flex', gap: 32, flexWrap: 'wrap', borderBottom: '1px solid var(--clr-border)' }}>
          {/* Costos operativos por categoría */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Costos Operativos
            </div>
            {cats.length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>Sin costos registrados</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {cats.map(([cat, amt]) => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 11 }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
                      fontSize: 10, fontWeight: 600, background: 'var(--clr-surface)',
                      border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)',
                      minWidth: 110,
                    }}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(amt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Costos de mantenimiento */}
          {item.maintCost > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Mantenimiento Preventivo
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(item.maintCost)}
              </div>
            </div>
          )}

          {/* Resumen rápido */}
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Resumen
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ color: 'var(--clr-text-subtle)', minWidth: 80 }}>Ingresos</span>
                <span style={{ fontWeight: 600, color: 'var(--clr-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(item.revenue)}</span>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ color: 'var(--clr-text-subtle)', minWidth: 80 }}>Costo total</span>
                <span style={{ fontWeight: 600, color: 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>{fmt(item.totalCost)}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--clr-border)', paddingTop: 3, marginTop: 1 }}>
                <span style={{ color: 'var(--clr-text-muted)', minWidth: 80, fontWeight: 600 }}>Margen neto</span>
                <span style={{ fontWeight: 700, color: item.margin >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>{fmt(item.margin)}</span>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

type TabView = 'general' | 'detalle'

export default function EquipmentProfitabilityPage() {
  const navigate = useNavigate()
  const [period,     setPeriod]     = useState<ReportPeriod>('all')
  const [filterEq,   setFilterEq]   = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tab,        setTab]        = useState<TabView>('general')

  const { data, isLoading } = useEquipmentProfitability({ period })

  const allItems = data?.items ?? []

  // Filtro por equipo (client-side)
  const items = useMemo(
    () => filterEq === 'all' ? allItems : allItems.filter((it) => it.id === filterEq),
    [allItems, filterEq],
  )

  // Totales recalculados sobre los items filtrados
  const totals = useMemo(() => {
    if (items.length === 0) return null
    const t = items.reduce(
      (s, it) => ({
        revenue:   s.revenue   + it.revenue,
        opCosts:   s.opCosts   + it.opCosts,
        maintCost: s.maintCost + it.maintCost,
        totalCost: s.totalCost + it.totalCost,
        margin:    s.margin    + it.margin,
        otCount:   s.otCount   + it.otCount,
        hours:     s.hours     + it.hours,
      }),
      { revenue: 0, opCosts: 0, maintCost: 0, totalCost: 0, margin: 0, otCount: 0, hours: 0 },
    )
    return { ...t, marginPct: t.revenue > 0 ? (t.margin / t.revenue) * 100 : 0 }
  }, [items])

  const exportRows = items.map((it) => ({
    'Equipo':              it.name,
    'Marca/Modelo':        [it.brand, it.model].filter(Boolean).join(' ') || '',
    'Tipo':                TYPE_LABELS[it.type] ?? it.type,
    'Estado':              it.status,
    'OTs':                 it.otCount,
    'Horas':               it.hours,
    'Ingresos':            it.revenue,
    // Desglose de costos operativos por categoría
    'Combustible':         it.costsByCategory['FUEL']        ?? 0,
    'Peaje':               it.costsByCategory['TOLL']        ?? 0,
    'Viáticos':            it.costsByCategory['ALLOWANCE']   ?? 0,
    'Mant. Operativo':     it.costsByCategory['MAINTENANCE'] ?? 0,
    'Otros Costos':        it.costsByCategory['OTHER']       ?? 0,
    // Totales
    'Costos Op. Total':    it.opCosts,
    'Costos Mant. Prev.':  it.maintCost,
    'Costo Total':         it.totalCost,
    'Margen':              it.margin,
    'Margen %':            fmtP(it.marginPct),
  }))

  return (
    <AppShell active="reports" title="Rentabilidad por Equipo">
      <div style={{ padding: '24px 28px', maxWidth: 1400 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navigate('/reports')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <ChevronLeft size={16} /> Reportes
          </button>
          <span style={{ color: 'var(--clr-border)' }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--clr-text-muted)', fontWeight: 600 }}>Rentabilidad por Equipo</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Filtro por equipo */}
            <select
              value={filterEq}
              onChange={(e) => { setFilterEq(e.target.value); setExpandedId(null) }}
              style={{ ...selStyle, minWidth: 180 }}
            >
              <option value="all">Todos los equipos</option>
              {allItems.map((it) => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
            {/* Filtro por período */}
            <select value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)} style={selStyle}>
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ExportMenu title="Rentabilidad por Equipo" csvRows={exportRows} filename="RentabilidadEquipos" />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--clr-border)' }}>
          {([
            { key: 'general', label: 'General' },
            { key: 'detalle', label: 'Detalle por Equipo' },
          ] as { key: TabView; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 16px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
                color: tab === t.key ? 'var(--clr-primary)' : 'var(--clr-text-subtle)',
                borderBottom: tab === t.key ? '2px solid var(--clr-primary)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* KPIs — siempre visibles en ambos tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: DollarSign, label: 'Ingresos Totales', value: totals ? fmt(totals.revenue)   : '—', color: 'var(--clr-primary)' },
            { icon: Wrench,     label: 'Costos Totales',   value: totals ? fmt(totals.totalCost)  : '—', color: 'var(--clr-danger)'  },
            { icon: TrendingUp, label: 'Margen Bruto',     value: totals ? fmt(totals.margin)     : '—', color: 'var(--clr-success)' },
            { icon: Hash,       label: 'Margen Promedio',  value: totals ? fmtP(totals.marginPct) : '—', color: '#d97706' },
          ].map((k) => (
            <div key={k.label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderLeft: `4px solid ${k.color}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <k.icon size={14} style={{ color: k.color }} />
                <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabla General (plana, sin expansión) */}
        {tab === 'general' &&
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resumen por Equipo</span>
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>
              {items.length} equipo{items.length !== 1 ? 's' : ''}{filterEq !== 'all' ? ' (filtrado)' : ''}
            </span>
          </div>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Cargando…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin equipos con actividad en el período</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--clr-bg)' }}>
                    {['Equipo', 'Tipo', 'OTs', 'Horas', 'Ingresos', 'Costos Op.', 'Costos Mant.', 'Margen', 'Margen %'].map((h) => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: ['OTs','Horas','Ingresos','Costos Op.','Costos Mant.','Margen','Margen %'].includes(h) ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((eq, i) => (
                    <tr key={eq.id} style={{ borderTop: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--clr-text)' }}>{eq.name}</div>
                        {(eq.brand || eq.model) && (
                          <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{[eq.brand, eq.model].filter(Boolean).join(' ')}</div>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--clr-text-muted)' }}>{TYPE_LABELS[eq.type] ?? eq.type}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{eq.otCount}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{eq.hours > 0 ? eq.hours.toFixed(0) + 'h' : '—'}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--clr-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.revenue)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.opCosts)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.maintCost)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: eq.margin >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.margin)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}><MarginBadge pct={eq.marginPct} /></td>
                    </tr>
                  ))}
                </tbody>
                {totals && items.length > 1 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                      <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase' }}>Total</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)' }}>{totals.otCount}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)' }}>{totals.hours > 0 ? totals.hours.toFixed(0) + 'h' : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: 'var(--clr-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.revenue)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.opCosts)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.maintCost)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: totals.margin >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.margin)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}><MarginBadge pct={totals.marginPct} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>}

        {/* Tabla Detalle (expandible con desglose de costos) */}
        {tab === 'detalle' &&
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detalle por Equipo</span>
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>
              {items.length} equipo{items.length !== 1 ? 's' : ''}{filterEq !== 'all' ? ' (filtrado)' : ''} · haz clic en una fila para ver desglose
            </span>
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Cargando…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin equipos con actividad en el período</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--clr-bg)' }}>
                    <th style={{ width: 28 }} />
                    {['Equipo', 'Tipo', 'OTs', 'Horas', 'Ingresos', 'Costos Op.', 'Costos Mant.', 'Margen', 'Margen %'].map((h) => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: ['OTs','Horas','Ingresos','Costos Op.','Costos Mant.','Margen','Margen %'].includes(h) ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((eq, i) => {
                    const isExpanded = expandedId === eq.id
                    return (
                      <Fragment key={eq.id}>
                        <tr
                          key={eq.id}
                          onClick={() => setExpandedId(isExpanded ? null : eq.id)}
                          style={{
                            borderTop: '1px solid var(--clr-border)',
                            background: isExpanded ? 'var(--clr-primary-bg)' : i % 2 === 0 ? 'transparent' : 'var(--clr-bg)',
                            cursor: 'pointer',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--clr-surface-hover)' }}
                          onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}
                        >
                          <td style={{ padding: '9px 0 9px 14px', width: 24 }}>
                            {isExpanded
                              ? <ChevronDown size={13} style={{ color: 'var(--clr-primary)', display: 'block' }} />
                              : <ChevronRightIcon size={13} style={{ color: 'var(--clr-text-subtle)', display: 'block' }} />
                            }
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--clr-text)' }}>{eq.name}</div>
                            {(eq.brand || eq.model) && (
                              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{[eq.brand, eq.model].filter(Boolean).join(' ')}</div>
                            )}
                          </td>
                          <td style={{ padding: '9px 14px', color: 'var(--clr-text-muted)' }}>{TYPE_LABELS[eq.type] ?? eq.type}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{eq.otCount}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{eq.hours > 0 ? eq.hours.toFixed(0) + 'h' : '—'}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--clr-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.revenue)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.opCosts)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.maintCost)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: eq.margin >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>{fmt(eq.margin)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right' }}><MarginBadge pct={eq.marginPct} /></td>
                        </tr>
                        {isExpanded && <CostBreakdown item={eq} />}
                      </Fragment>
                    )
                  })}
                </tbody>
                {totals && items.length > 1 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                      <td />
                      <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase' }}>Total</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)' }}>{totals.otCount}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)' }}>{totals.hours > 0 ? totals.hours.toFixed(0) + 'h' : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: 'var(--clr-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.revenue)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.opCosts)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--clr-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.maintCost)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: totals.margin >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.margin)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}><MarginBadge pct={totals.marginPct} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>}

      </div>
    </AppShell>
  )
}
