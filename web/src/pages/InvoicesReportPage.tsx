import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Receipt, ChevronLeft, DollarSign, TrendingDown, AlertCircle } from 'lucide-react'
import { useInvoicesReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const fmtD = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pendiente',    color: 'var(--clr-primary)', bg: 'var(--clr-primary-bg)'  },
  PARTIAL: { label: 'Pago parcial', color: '#d97706', bg: 'rgba(217,119,6,0.10)'  },
  PAID:    { label: 'Pagada',       color: 'var(--clr-success)', bg: 'var(--clr-success-bg)'   },
  OVERDUE: { label: 'Vencida',      color: 'var(--clr-danger)', bg: 'var(--clr-danger-bg)'   },
}

const inpStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none',
}
const labelSt: React.CSSProperties = { fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function InvoicesReportPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [statusFilter, setStatus] = useState('')

  const { data, isLoading } = useInvoicesReport({
    status:   statusFilter || undefined,
    dateFrom: dateFrom     || undefined,
    dateTo:   dateTo       || undefined,
  })

  const s     = data?.summary
  const items = data?.items ?? []

  return (
    <AppShell active="reports" title="Reporte de Facturación">
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
              <Receipt size={20} style={{ color: 'var(--clr-success)' }} /> Reporte de Facturación
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Facturas emitidas, estados y resumen de cobro</p>
          </div>
          <ExportMenu
            title="Reporte de Facturación — FlotaTrack"
            filename="facturacion"
            csvRows={items.map((inv) => ({
              'Factura': `${inv.series}-${inv.number.padStart(8, '0')}`,
              'Cliente': inv.clientName, 'RUC': inv.clientRuc,
              'Emisión': fmtD(inv.issueDate),
              'Vencimiento': fmtD(inv.dueDate),
              'Total (S/)': inv.total.toFixed(2), 'Cobrado (S/)': inv.paid.toFixed(2),
              'Saldo (S/)': inv.balance.toFixed(2),
              'Estado': STATUS_CFG[inv.status]?.label ?? inv.status,
            }))}
          />
        </div>

        {/* Filters */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label style={labelSt}>Fecha emisión desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={labelSt}>Hasta</label>
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
            { icon: DollarSign,  label: 'Total facturado', value: fmtK(s?.totalInvoiced ?? 0), color: 'var(--clr-primary)',  bg: 'var(--clr-primary-bg)'  },
            { icon: DollarSign,  label: 'Total cobrado',   value: fmtK(s?.totalPaid ?? 0),     color: 'var(--clr-success)',  bg: 'var(--clr-success-bg)'   },
            { icon: TrendingDown,label: 'Pendiente',       value: fmtK(s?.totalPending ?? 0),  color: '#d97706',  bg: 'rgba(217,119,6,0.10)'  },
            { icon: AlertCircle, label: 'Vencido',         value: fmtK(s?.totalOverdue ?? 0),  color: 'var(--clr-danger)',  bg: 'var(--clr-danger-bg)'   },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <div style={{ padding: 6, borderRadius: 6, background: bg }}><Icon size={13} style={{ color, display: 'block' }} /></div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
              {s && <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{s.total} facturas</div>}
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 24 }}>
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="animate-pulse" style={{ height: 44, background: 'var(--clr-surface-hover)', borderRadius: 6, marginBottom: 8 }} />)}
              </div>
            ) : !items.length ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin facturas en el período seleccionado</div>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    {['Factura', 'Cliente', 'RUC', 'Emisión', 'Vencimiento', 'Total', 'Pagado', 'Saldo', 'Estado'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: i >= 5 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((inv, i) => {
                    const sc = STATUS_CFG[inv.status] ?? STATUS_CFG.PENDING
                    const isOverdue = inv.status === 'OVERDUE'
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--clr-border)', background: 'transparent', ...(isOverdue ? { borderLeft: '2px solid var(--clr-danger)' } : {}) }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', whiteSpace: 'nowrap' }}>{inv.series}-{inv.number.padStart(8, '0')}</td>
                        <td title={inv.clientName} style={{ padding: '9px 12px', color: 'var(--clr-text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.clientName}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace' }}>{inv.clientRuc}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(inv.issueDate)}</td>
                        <td style={{ padding: '9px 12px', color: isOverdue ? 'var(--clr-danger)' : 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(inv.dueDate)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-text)', fontWeight: 600 }}>{fmt(inv.total)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-success)' }}>{inv.paid > 0 ? fmt(inv.paid) : '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: inv.balance > 0 ? (isOverdue ? 'var(--clr-danger)' : '#d97706') : 'var(--clr-success)', fontWeight: 600 }}>
                          {inv.balance > 0 ? fmt(inv.balance) : '—'}
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
                    <td colSpan={5} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>{items.length} facturas</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-text)', fontWeight: 700 }}>{fmt(s?.totalInvoiced ?? 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-success)', fontWeight: 700 }}>{fmt(s?.totalPaid ?? 0)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706', fontWeight: 700 }}>{fmt(s?.totalPending ?? 0)}</td>
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

