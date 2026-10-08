import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { FileText, ChevronLeft, Target, Search, X } from 'lucide-react'
import { useQuotesReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const fmtD = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Borrador',    color: 'var(--clr-text-muted)', bg: 'rgba(148,163,184,0.12)' },
  SENT:      { label: 'Enviada',     color: 'var(--clr-primary)',    bg: 'var(--clr-primary-bg)'  },
  APPROVED:  { label: 'Aprobada',   color: 'var(--clr-success)',    bg: 'var(--clr-success-bg)'  },
  REJECTED:  { label: 'Rechazada',  color: 'var(--clr-danger)',     bg: 'var(--clr-danger-bg)'   },
  CONVERTED: { label: 'Convertida', color: '#7c3aed',               bg: 'rgba(124,58,237,0.10)'  },
}

const inpStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none',
}
const labelSt: React.CSSProperties = { fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function QuotesReportPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [search, setSearch]       = useState('')

  const { data, isLoading } = useQuotesReport({
    status:   statusFilter || undefined,
    dateFrom: dateFrom     || undefined,
    dateTo:   dateTo       || undefined,
  })

  const s     = data?.summary
  const items = data?.items ?? []
  const now   = new Date()

  const filteredItems = items.filter((q) =>
    !search.trim() ||
    q.clientName.toLowerCase().includes(search.toLowerCase()) ||
    q.number.toLowerCase().includes(search.toLowerCase()) ||
    q.clientRuc.includes(search)
  )

  return (
    <AppShell active="reports" title="Reporte de Cotizaciones">
      <div style={{ maxWidth: 1400, padding: '24px 28px 56px' }}>
        <button onClick={() => navigate('/reports')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 12, padding: 0, marginBottom: 10 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b' }}>
          <ChevronLeft size={14} /> Centro de Reportes
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} style={{ color: 'var(--clr-teal)' }} /> Reporte de Cotizaciones
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Pipeline comercial, estados y tasa de conversión</p>
          </div>
          <ExportMenu
            title="Reporte de Cotizaciones — FlotaTrack"
            filename="cotizaciones"
            csvRows={items.map((q) => {
              const pastDue = parseISO(q.validUntil) < now && !['APPROVED', 'CONVERTED'].includes(q.status)
              const daysOvr = pastDue ? Math.floor((now.getTime() - parseISO(q.validUntil).getTime()) / 86_400_000) : 0
              return {
                'N° Cotización': q.number, 'Cliente': q.clientName, 'RUC': q.clientRuc,
                'Equipo': q.equipmentName || '—',
                'Emisión': fmtD(q.issueDate),
                'Válida hasta': fmtD(q.validUntil),
                'Vencida': pastDue ? 'SÍ' : 'NO',
                'Días vencida': daysOvr > 0 ? daysOvr : '',
                'Total (S/)': q.total.toFixed(2),
                'Estado': STATUS_CFG[q.status]?.label ?? q.status,
              }
            })}
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
            { label: 'Total cotizaciones', value: String(s?.total ?? 0),          color: 'var(--clr-text)' },
            { label: 'Monto total',        value: fmtK(s?.totalAmount ?? 0),      color: 'var(--clr-primary)' },
            { label: 'Monto convertido',   value: fmtK(s?.convertedAmount ?? 0),  color: 'var(--clr-success)' },
            { label: 'Tasa conversión',    value: `${(s?.conversionRate ?? 0).toFixed(1)}%`, color: !s ? 'var(--clr-text-subtle)' : s.conversionRate >= 30 ? 'var(--clr-success)' : s.conversionRate >= 15 ? '#d97706' : 'var(--clr-danger)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Conversion rate bar */}
        {s && (
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <Target size={16} style={{ color: 'var(--clr-teal)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>Pipeline de conversión</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-teal)' }}>{s.conversionRate.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--clr-surface-hover)', borderRadius: 3 }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(s.conversionRate, 100)}%`, background: 'linear-gradient(90deg, var(--clr-primary), var(--clr-success))' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
              {s && Object.entries(s.statusCounts).map(([status, count]) => {
                const sc = STATUS_CFG[status]
                if (!sc) return null
                return <span key={status} style={{ fontSize: 11, color: sc.color }}>{sc.label}: <strong>{count}</strong></span>
              })}
            </div>
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
              placeholder="Buscar por N° cotización, cliente o RUC…"
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
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin cotizaciones en el período seleccionado</div>
            ) : !filteredItems.length ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin resultados para "<strong>{search}</strong>"</div>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    {['N° Cotización', 'Cliente', 'RUC', 'Equipo', 'Emisión', 'Válida hasta', 'Total', 'Estado'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: i >= 6 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((q, i) => {
                    const sc        = STATUS_CFG[q.status] ?? STATUS_CFG.DRAFT
                    const isPastDue = parseISO(q.validUntil) < now && !['APPROVED', 'CONVERTED'].includes(q.status)
                    const daysOver  = isPastDue ? Math.floor((now.getTime() - parseISO(q.validUntil).getTime()) / 86_400_000) : 0
                    return (
                      <tr key={q.id} style={{ borderBottom: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', whiteSpace: 'nowrap' }}>{q.number}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.clientName}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace' }}>{q.clientRuc}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.equipmentName || '—'}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(q.issueDate)}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ color: isPastDue ? 'var(--clr-danger)' : 'var(--clr-text-muted)' }}>{fmtD(q.validUntil)}</div>
                          {isPastDue && <div style={{ fontSize: 10, color: 'var(--clr-danger)', marginTop: 1 }}>+{daysOver}d vencida</div>}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-text)', fontWeight: 600 }}>{fmt(q.total)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{sc.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    <td colSpan={6} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>
                      {search.trim() ? `${filteredItems.length} de ${items.length} cotizaciones` : `${items.length} cotizaciones`}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-primary)', fontWeight: 700 }}>
                      {fmt(filteredItems.reduce((s, q) => s + q.total, 0))}
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

