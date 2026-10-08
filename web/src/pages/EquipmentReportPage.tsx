import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, ChevronLeft, TrendingUp, Wrench } from 'lucide-react'
import { useEquipmentReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt    = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK   = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const TYPE_LABEL: Record<string, string> = { CRANE: 'Grúa', PLATFORM: 'Plataforma', FORKLIFT: 'Montacarga', EXCAVATOR: 'Excavadora', OTHER: 'Otro' }
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  AVAILABLE:   { label: 'Disponible',  color: 'var(--clr-success)', bg: 'var(--clr-success-bg)' },
  IN_USE:      { label: 'En uso',      color: 'var(--clr-primary)', bg: 'var(--clr-primary-bg)' },
  MAINTENANCE: { label: 'Mantenimiento', color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  RETIRED:     { label: 'Retirado',    color: 'var(--clr-text-subtle)', bg: 'rgba(100,116,139,0.15)' },
}

const inpStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none',
}
const labelSt: React.CSSProperties = { fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function EquipmentReportPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [statusFilter, setStatus] = useState('')

  const { data = [], isLoading } = useEquipmentReport({
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
  })

  const totalRevenue  = data.reduce((s, e) => s + e.revenue, 0)
  const totalMaint    = data.reduce((s, e) => s + e.maintCost, 0)
  const available     = data.filter((e) => e.status === 'AVAILABLE').length
  const inUse         = data.filter((e) => e.status === 'IN_USE').length
  const maintenance   = data.filter((e) => e.status === 'MAINTENANCE').length
  const maxRev        = Math.max(...data.map((e) => e.revenue), 1)

  return (
    <AppShell active="reports" title="Reporte de Equipos">
      <div style={{ maxWidth: 1400, padding: '24px 28px 56px' }}>

        {/* Back + Header */}
        <button onClick={() => navigate('/reports')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 12, padding: 0, marginBottom: 10 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}>
          <ChevronLeft size={14} /> Centro de Reportes
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Truck size={20} style={{ color: '#f59e0b' }} /> Reporte de Equipos
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Flota activa, utilización e ingresos generados</p>
          </div>
          <ExportMenu
            title="Reporte de Equipos — FlotaTrack"
            filename="equipos"
            csvRows={data.map((eq) => ({
              'Equipo': eq.name, 'Tipo': TYPE_LABEL[eq.type] ?? eq.type,
              'Marca': eq.brand || '—', 'Modelo': eq.model || '—',
              'Capacidad': eq.capacity || '—', 'Horómetro (h)': eq.currentHours,
              'Estado': STATUS_CFG[eq.status]?.label ?? eq.status,
              'OTs': eq.otCount, 'Horas facturadas': eq.hours.toFixed(1),
              'Ingresos (S/)': eq.revenue.toFixed(2), 'Costo mant. (S/)': eq.maintCost.toFixed(2),
            }))}
          />
        </div>

        {/* Filters */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label style={labelSt}>Fecha inicio</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={labelSt}>Fecha fin</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={labelSt}>Estado</label>
            <select value={statusFilter} onChange={(e) => setStatus(e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>
              <option value="">Todos</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <button onClick={() => { setDateFrom(''); setDateTo(''); setStatus('') }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>

        {/* KPI chips */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { icon: Truck,      label: 'Total equipos',    value: data.length,   color: 'var(--clr-text)', bg: 'rgba(226,232,240,0.08)' },
            { icon: Truck,      label: 'Disponibles',      value: available,     color: 'var(--clr-success)', bg: 'var(--clr-success-bg)' },
            { icon: Truck,      label: 'En uso',           value: inUse,         color: 'var(--clr-primary)', bg: 'var(--clr-primary-bg)' },
            { icon: Wrench,     label: 'Mantenimiento',    value: maintenance,   color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
            { icon: TrendingUp, label: 'Ingresos (OTs)',   value: fmtK(totalRevenue), color: 'var(--clr-success)', bg: 'var(--clr-success-bg)', isStr: true },
          ].map(({ icon: Icon, label, value, color, bg, isStr }) => (
            <div key={label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <div style={{ padding: 5, borderRadius: 6, background: bg }}>
                  <Icon size={12} style={{ color, display: 'block' }} />
                </div>
              </div>
              <div style={{ fontSize: isStr ? 15 : 22, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 24 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="animate-pulse" style={{ height: 44, background: 'var(--clr-surface-hover)', borderRadius: 6, marginBottom: 8 }} />
                ))}
              </div>
            ) : !data.length ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>
                Sin equipos en los filtros seleccionados
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    {['Equipo', 'Tipo', 'Marca / Modelo', 'Capacidad', 'Horómetro', 'Estado', 'OTs', 'Horas', 'Ingresos', 'Costo Mant.'].map((h, i) => {
                      const rightAlign = i === 4 || i >= 6
                      return <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: rightAlign ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.map((eq, i) => {
                    const sc = STATUS_CFG[eq.status] ?? STATUS_CFG.AVAILABLE
                    return (
                      <tr key={eq.id} style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--clr-text)', fontWeight: 500, whiteSpace: 'nowrap' }}>{eq.name}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--clr-text-muted)' }}>{TYPE_LABEL[eq.type] ?? eq.type}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--clr-text-subtle)', whiteSpace: 'nowrap' }}>
                          {[eq.brand, eq.model].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--clr-text-subtle)' }}>{eq.capacity ?? '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--clr-text-muted)', textAlign: 'right' }}>
                          {eq.currentHours > 0 ? `${eq.currentHours.toLocaleString('es-PE')}h` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: sc.bg, color: sc.color }}>
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{eq.otCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-text-subtle)' }}>{eq.hours > 0 ? `${eq.hours.toFixed(0)}h` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {eq.revenue > 0 ? (
                            <div>
                              <div style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{fmtK(eq.revenue)}</div>
                              <div style={{ height: 3, background: 'var(--clr-surface-hover)', borderRadius: 2, marginTop: 3 }}>
                                <div style={{ height: '100%', borderRadius: 2, width: `${(eq.revenue / maxRev) * 100}%`, background: '#f59e0b' }} />
                              </div>
                            </div>
                          ) : <span style={{ color: 'var(--clr-text-subtle)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: eq.maintCost > 0 ? '#ea580c' : 'var(--clr-text-subtle)' }}>
                          {eq.maintCost > 0 ? fmtK(eq.maintCost) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    <td colSpan={6} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>Total — {data.length} equipos</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-text)', fontWeight: 700 }}>{data.reduce((s, e) => s + e.otCount, 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-text)', fontWeight: 700 }}>{data.reduce((s, e) => s + e.hours, 0).toFixed(0)}h</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-success)', fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ea580c', fontWeight: 700 }}>{fmt(totalMaint)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

