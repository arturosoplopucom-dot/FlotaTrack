import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Wrench, ChevronLeft, AlertCircle, Clock } from 'lucide-react'
import { useMaintenanceReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const fmtD = (d: string | null) => d ? format(parseISO(d), 'dd/MM/yyyy') : '—'

const INTERVAL_LABEL: Record<string, string> = { HOURS: 'Horas', DAYS: 'Días', MONTHS: 'Meses' }

const inpStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none',
}
const labelSt: React.CSSProperties = { fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function MaintenanceReportPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [tab, setTab]           = useState<'records' | 'upcoming'>('records')

  const { data, isLoading } = useMaintenanceReport({
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
  })

  const records  = data?.items         ?? []
  const upcoming = data?.upcomingPlans ?? []
  const s        = data?.summary

  return (
    <AppShell active="reports" title="Reporte de Mantenimiento">
      <div style={{ maxWidth: 1400, padding: '24px 28px 56px' }}>
        <button onClick={() => navigate('/reports')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 12, padding: 0, marginBottom: 10 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}>
          <ChevronLeft size={14} /> Centro de Reportes
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wrench size={20} style={{ color: 'var(--clr-orange)' }} /> Reporte de Mantenimiento
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Historial de servicios, costos y planes programados</p>
          </div>
          <ExportMenu
            title="Reporte de Mantenimiento — FlotaTrack"
            filename={tab === 'records' ? 'mantenimiento-historial' : 'mantenimiento-planes'}
            csvRows={tab === 'records'
              ? records.map((r) => ({
                  'Equipo': r.equipmentName, 'Tipo': r.equipmentType, 'Plan': r.planName,
                  'Fecha': fmtD(r.performedAt),
                  'Horómetro (h)': r.hoursAtService != null ? r.hoursAtService : '—', 'Técnico': r.technician || '—',
                  'Descripción': r.description ?? '', 'Costo (S/)': r.cost.toFixed(2),
                }))
              : upcoming.map((p) => {
                  const now      = new Date()
                  const dueDate  = p.nextDueAt ? new Date(p.nextDueAt) : null
                  const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000) : null
                  const estado   = daysLeft === null ? '—'
                    : daysLeft < 0   ? 'VENCIDO'
                    : daysLeft <= 7  ? `Urgente (${daysLeft}d)`
                    : daysLeft <= 30 ? `Próximo (${daysLeft}d)`
                    : `Programado (${daysLeft}d)`
                  return {
                    'Equipo': p.equipmentName, 'Plan': p.name,
                    'Tipo intervalo': INTERVAL_LABEL[p.intervalType] ?? p.intervalType,
                    'Próximo vencimiento': fmtD(p.nextDueAt ?? null),
                    'Horas programadas': p.nextDueHours != null ? p.nextDueHours : '—',
                    'Estado': estado,
                  }
                })
            }
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
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Mantenimientos realizados', value: String(s?.total ?? 0),       color: 'var(--clr-text)' },
            { label: 'Costo total',               value: fmtK(s?.totalCost ?? 0),    color: 'var(--clr-orange)' },
            { label: 'Planes programados',        value: String(upcoming.length),     color: 'var(--clr-primary)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'var(--clr-sidebar)', padding: 4, borderRadius: 8, width: 'fit-content', border: '1px solid var(--clr-border)' }}>
          {(['records', 'upcoming'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '7px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: tab === t ? 'var(--clr-surface-hover)' : 'transparent',
                color: tab === t ? 'var(--clr-text)' : 'var(--clr-text-subtle)',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.3)' : 'none' }}>
              {t === 'records' ? `Historial (${records.length})` : `Próximos planes (${upcoming.length})`}
            </button>
          ))}
        </div>

        {/* Table - Records */}
        {tab === 'records' && (
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              {isLoading ? (
                <div style={{ padding: 24 }}>
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="animate-pulse" style={{ height: 44, background: 'var(--clr-surface-hover)', borderRadius: 6, marginBottom: 8 }} />)}
                </div>
              ) : !records.length ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin registros en el período seleccionado</div>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                      {['Equipo', 'Tipo', 'Plan', 'Fecha', 'Horómetro', 'Técnico', 'Descripción', 'Costo'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: i === 7 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text)', whiteSpace: 'nowrap' }}>{r.equipmentName}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{r.equipmentType}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-orange)', whiteSpace: 'nowrap' }}>{r.planName}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(r.performedAt)}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)' }}>{r.hoursAtService != null ? `${r.hoursAtService}h` : '—'}</td>
                        <td title={r.technician || undefined} style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.technician || '—'}</td>
                        <td title={r.description || undefined} style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: r.cost > 0 ? 'var(--clr-orange)' : 'var(--clr-text-subtle)', fontWeight: 600 }}>{r.cost > 0 ? fmt(r.cost) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                      <td colSpan={7} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>{records.length} registros</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-orange)', fontWeight: 700 }}>{fmt(s?.totalCost ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Table - Upcoming plans */}
        {tab === 'upcoming' && (
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              {isLoading ? (
                <div style={{ padding: 24 }}>
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse" style={{ height: 44, background: 'var(--clr-surface-hover)', borderRadius: 6, marginBottom: 8 }} />)}
                </div>
              ) : !upcoming.length ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin planes programados pendientes</div>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                      {['Equipo', 'Plan de mantenimiento', 'Tipo intervalo', 'Próximo vencimiento', 'Horas programadas', 'Estado'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => { const now = new Date(); return upcoming.map((p, i) => {
                      const dueDate   = p.nextDueAt ? new Date(p.nextDueAt) : null
                      const daysLeft  = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000) : null
                      const isOverdue = daysLeft !== null && daysLeft < 0
                      const isUrgent  = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7
                      const isSoon    = daysLeft !== null && daysLeft > 7  && daysLeft <= 30

                      const urgencyBadge = isOverdue
                        ? { label: 'VENCIDO',      color: 'var(--clr-danger)',  bg: 'var(--clr-danger-bg)' }
                        : isUrgent
                        ? { label: `${daysLeft}d`,  color: '#c2410c',           bg: 'rgba(234,88,12,0.10)' }
                        : isSoon
                        ? { label: `${daysLeft}d`,  color: '#d97706',           bg: 'rgba(217,119,6,0.10)' }
                        : daysLeft !== null
                        ? { label: `${daysLeft}d`,  color: 'var(--clr-text-subtle)', bg: 'var(--clr-surface-hover)' }
                        : null

                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                          <td style={{ padding: '9px 12px', color: 'var(--clr-text)' }}>{p.equipmentName}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--clr-orange)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {isOverdue && <AlertCircle size={12} style={{ color: 'var(--clr-danger)', flexShrink: 0 }} />}
                              {p.name}
                            </div>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)' }}>{INTERVAL_LABEL[p.intervalType] ?? p.intervalType}</td>
                          <td style={{ padding: '9px 12px', color: isOverdue ? 'var(--clr-danger)' : 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Clock size={11} />
                              {fmtD(p.nextDueAt)}
                            </div>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)' }}>{p.nextDueHours != null ? `${p.nextDueHours}h` : '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            {urgencyBadge && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: urgencyBadge.bg, color: urgencyBadge.color, whiteSpace: 'nowrap' }}>
                                {urgencyBadge.label}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    }) })()}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

