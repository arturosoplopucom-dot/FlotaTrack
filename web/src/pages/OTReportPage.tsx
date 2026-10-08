import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ClipboardList, ChevronLeft, Search, X } from 'lucide-react'
import { useWorkOrdersReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const fmtD = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Borrador',   color: 'var(--clr-text-muted)',  bg: 'rgba(148,163,184,0.12)'   },
  SENT:      { label: 'Enviada',    color: '#d97706',                bg: 'rgba(217,119,6,0.10)'     },
  ACCEPTED:  { label: 'Aceptada',   color: '#ea580c',                bg: 'rgba(234,88,12,0.10)'     },
  ACTIVE:    { label: 'Activa',     color: 'var(--clr-primary)',     bg: 'var(--clr-primary-bg)'    },
  COMPLETED: { label: 'Completada', color: 'var(--clr-success)',     bg: 'var(--clr-success-bg)'    },
  BILLED:    { label: 'Facturada',  color: '#6d28d9',                bg: 'rgba(109,40,217,0.10)'    },
  PAID:      { label: 'Pagada',     color: 'var(--clr-success)',     bg: 'var(--clr-success-bg)'    },
  CANCELLED: { label: 'Cancelada',  color: 'var(--clr-danger)',      bg: 'var(--clr-danger-bg)'     },
}

const BILLING_LABEL: Record<string, string> = { HOURLY: 'Horas', DAILY: 'Días', FIXED: 'Fijo' }

const inpStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none',
}
const labelSt: React.CSSProperties = { fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function OTReportPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [search, setSearch]       = useState('')

  const { data, isLoading } = useWorkOrdersReport({
    status:   statusFilter || undefined,
    dateFrom: dateFrom     || undefined,
    dateTo:   dateTo       || undefined,
  })

  const s     = data?.summary
  const items = data?.items ?? []

  const filteredItems = items.filter((wo) =>
    !search.trim() ||
    wo.number.toLowerCase().includes(search.toLowerCase()) ||
    wo.clientName.toLowerCase().includes(search.toLowerCase()) ||
    wo.equipmentName.toLowerCase().includes(search.toLowerCase()) ||
    wo.operatorName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppShell active="reports" title="Reporte de OT">
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
              <ClipboardList size={20} style={{ color: '#8b5cf6' }} /> Órdenes de Trabajo
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Actividad operativa, ingresos y márgenes por OT</p>
          </div>
          <ExportMenu
            title="Reporte de OTs — FlotaTrack"
            filename="ordenes-trabajo"
            csvRows={items.map((wo) => ({
              'OT': wo.number, 'Cliente': wo.clientName, 'RUC': wo.clientRuc,
              'Equipo': wo.equipmentName, 'Operario': wo.operatorName,
              'Fecha inicio': fmtD(wo.startDate),
              'Tipo': BILLING_LABEL[wo.billingType] ?? wo.billingType,
              'Cantidad': wo.quantity.toFixed(1),
              'Ingresos (S/)': wo.subtotal.toFixed(2),
              'Costos (S/)': wo.costs.toFixed(2), 'Margen (S/)': wo.margin.toFixed(2),
              'Margen %': wo.subtotal > 0 ? `${((wo.margin / wo.subtotal) * 100).toFixed(1)}%` : '—',
              'Estado': STATUS_CFG[wo.status]?.label ?? wo.status,
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

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total OTs',       value: s?.total ?? 0,                           color: 'var(--clr-text)', isStr: false },
            { label: 'Ingresos (OTs)',  value: fmtK(s?.totalRevenue ?? 0),              color: 'var(--clr-success)', isStr: true  },
            { label: 'Costos',          value: fmtK(s?.totalCosts ?? 0),                color: 'var(--clr-danger)', isStr: true  },
            { label: 'Margen bruto',    value: fmtK(s?.grossMargin ?? 0),               color: !s ? 'var(--clr-text-subtle)' : s.grossMargin >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', isStr: true },
          ].map(({ label, value, color, isStr }) => (
            <div key={label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: isStr ? 16 : 24, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Status pills */}
        {s && Object.entries(s.statusCounts).length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {Object.entries(s.statusCounts).map(([status, count]) => {
              const sc = STATUS_CFG[status]
              if (!sc) return null
              return (
                <span key={status} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: sc.bg, color: sc.color, fontWeight: 600 }}>
                  {sc.label}: {count}
                </span>
              )
            })}
          </div>
        )}

        {/* Table */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Search bar */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={13} style={{ color: 'var(--clr-text-subtle)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por N° OT, cliente, equipo u operario…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--clr-text)' }}
            />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 0 }}><X size={13} /></button>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 24 }}>
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="animate-pulse" style={{ height: 44, background: 'var(--clr-surface-hover)', borderRadius: 6, marginBottom: 8 }} />)}
              </div>
            ) : !items.length ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin OTs en el período seleccionado</div>
            ) : !filteredItems.length ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin resultados para "<strong>{search}</strong>"</div>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    {['OT', 'Cliente', 'Equipo', 'Operario', 'Inicio', 'Tipo', 'Cant.', 'Ingresos', 'Costos', 'Margen', 'Marg.%', 'Estado'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: i >= 6 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((wo, i) => {
                    const sc         = STATUS_CFG[wo.status] ?? STATUS_CFG.DRAFT
                    const marginPct  = wo.subtotal > 0 ? (wo.margin / wo.subtotal) * 100 : null
                    const pctColor   = marginPct === null ? 'var(--clr-text-subtle)'
                      : marginPct >= 20 ? 'var(--clr-success)'
                      : marginPct >= 0  ? '#d97706'
                      : 'var(--clr-danger)'
                    return (
                      <tr key={wo.id} style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', whiteSpace: 'nowrap' }}>{wo.number}</td>
                        <td title={wo.clientName} style={{ padding: '9px 12px', color: 'var(--clr-text)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.clientName}</td>
                        <td title={wo.equipmentName} style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.equipmentName}</td>
                        <td title={wo.operatorName} style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.operatorName}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(wo.startDate)}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)' }}>{BILLING_LABEL[wo.billingType] ?? wo.billingType}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', textAlign: 'right' }}>{wo.quantity.toFixed(1)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-text)', fontWeight: 600 }}>{wo.subtotal > 0 ? fmtK(wo.subtotal) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: wo.costs > 0 ? 'var(--clr-danger)' : 'var(--clr-text-subtle)' }}>{wo.costs > 0 ? fmtK(wo.costs) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: wo.margin >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                          {wo.subtotal > 0 ? fmtK(wo.margin) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: pctColor }}>
                          {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{sc.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    <td colSpan={7} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>
                      {search.trim() ? `${filteredItems.length} de ${items.length} OTs` : `${items.length} OTs`}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-success)', fontWeight: 700 }}>
                      {fmt(filteredItems.reduce((a, wo) => a + wo.subtotal, 0))}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-danger)', fontWeight: 700 }}>
                      {fmt(filteredItems.reduce((a, wo) => a + wo.costs, 0))}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (() => { const m = filteredItems.reduce((a, wo) => a + wo.margin, 0); return m >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)' })() }}>
                      {fmt(filteredItems.reduce((a, wo) => a + wo.margin, 0))}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-text-subtle)', fontWeight: 600, fontSize: 11 }}>
                      {(() => { const rev = filteredItems.reduce((a, wo) => a + wo.subtotal, 0); const mar = filteredItems.reduce((a, wo) => a + wo.margin, 0); return rev > 0 ? `${((mar / rev) * 100).toFixed(1)}%` : '—' })()}
                    </td>
                    <td />
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

