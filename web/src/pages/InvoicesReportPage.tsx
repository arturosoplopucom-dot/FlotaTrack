import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Receipt, ChevronLeft, DollarSign, TrendingDown, AlertCircle } from 'lucide-react'
import { useInvoicesReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt     = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd  = (n: number) => '$ '  + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK    = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const fmtUsdK = (n: number) => n >= 1000 ? `$ ${(n / 1000).toFixed(1)}k` : fmtUsd(n)
const fmtD    = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

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
const labelSt: React.CSSProperties = {
  fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
}

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

  const todayMidnight = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const statusCounts = useMemo(() => {
    let paid = 0, pending = 0, overdue = 0
    for (const inv of items) {
      const eff = inv.status !== 'PAID' && (inv.status === 'OVERDUE' || new Date(inv.dueDate) < todayMidnight)
      if (inv.status === 'PAID') paid++
      else if (eff) overdue++
      else pending++
    }
    return { paid, pending, overdue }
  }, [items, todayMidnight])

  const detracStats = useMemo(() => {
    let total = 0, pending = 0, overdue = 0, paid = 0
    for (const inv of items) {
      const isPaid = inv.status === 'PAID'
      const eff = !isPaid && (inv.status === 'OVERDUE' || new Date(inv.dueDate) < todayMidnight)
      total   += inv.detraccion
      if (isPaid)  paid    += inv.detraccion
      if (!isPaid) pending += inv.detraccion
      if (eff)     overdue += inv.detraccion
    }
    return { total, pending, overdue, paid }
  }, [items, todayMidnight])

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
            csvRows={items.map((inv) => {
              const isUsd = inv.currency === 'USD' && inv.totalUsd != null
              return {
                'Factura':     `${inv.series}-${inv.number.padStart(8, '0')}`,
                'Cliente':     inv.clientName,
                'RUC':         inv.clientRuc,
                'Emisión':     fmtD(inv.issueDate),
                'Vencimiento': fmtD(inv.dueDate),
                'Moneda':      inv.currency,
                'Total':       isUsd ? `$ ${inv.totalUsd!.toFixed(2)}` : `S/ ${inv.total.toFixed(2)}`,
                'TC':          inv.tcambio != null ? inv.tcambio.toFixed(3) : '',
                'Cobrado':     isUsd
                                 ? `$ ${(inv.balanceUsd != null ? inv.totalUsd! - inv.balanceUsd : 0).toFixed(2)}`
                                 : `S/ ${inv.paid.toFixed(2)}`,
                'Saldo':       isUsd && inv.balanceUsd != null
                                 ? `$ ${inv.balanceUsd.toFixed(2)}`
                                 : `S/ ${inv.balance.toFixed(2)}`,
                'Detracción':  inv.detraccion > 0 ? `S/ ${inv.detraccion.toFixed(2)}` : 'No',
                'Estado':      STATUS_CFG[inv.status]?.label ?? inv.status,
              }
            })}
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
          {/* Total Facturado */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total facturado</span>
              <div style={{ padding: 6, borderRadius: 6, background: 'var(--clr-primary-bg)' }}><DollarSign size={13} style={{ color: 'var(--clr-primary)', display: 'block' }} /></div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-primary)' }}>{fmtK(s?.totalInvoiced ?? 0)}</div>
            {(s?.totalInvoicedUsd ?? 0) > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', marginTop: 3 }}>{fmtUsdK(s!.totalInvoicedUsd)}</div>
            )}
            {s && <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{s.total} facturas</div>}
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {detracStats.total > 0 ? 'Incl. detracción SPOT' : 'Total emitido en el período'}
            </div>
          </div>

          {/* Total Cobrado */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total cobrado</span>
              <div style={{ padding: 6, borderRadius: 6, background: 'var(--clr-success-bg)' }}><DollarSign size={13} style={{ color: 'var(--clr-success)', display: 'block' }} /></div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-success)' }}>{fmtK(s?.totalPaid ?? 0)}</div>
            {(s?.totalPaidUsd ?? 0) > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', marginTop: 3 }}>{fmtUsdK(s!.totalPaidUsd)}</div>
            )}
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{statusCounts.paid} pagadas</div>
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {detracStats.paid > 0 ? 'Cobros bancarios s/det. SPOT' : 'Cobros bancarios recibidos'}
            </div>
          </div>

          {/* Pendiente */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendiente</span>
              <div style={{ padding: 6, borderRadius: 6, background: 'rgba(217,119,6,0.10)' }}><TrendingDown size={13} style={{ color: '#d97706', display: 'block' }} /></div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{fmtK(s?.totalPending ?? 0)}</div>
            {(s?.totalPendingUsd ?? 0) > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309', marginTop: 3 }}>{fmtUsdK(s!.totalPendingUsd)}</div>
            )}
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{statusCounts.pending} pendientes</div>
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {detracStats.pending > 0 ? 'Saldo neto sin detracción' : 'Saldo por cobrar'}
            </div>
          </div>

          {/* Vencido */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vencido</span>
              <div style={{ padding: 6, borderRadius: 6, background: 'var(--clr-danger-bg)' }}><AlertCircle size={13} style={{ color: 'var(--clr-danger)', display: 'block' }} /></div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-danger)' }}>{fmtK(s?.totalOverdue ?? 0)}</div>
            {(s?.totalOverdueUsd ?? 0) > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', marginTop: 3 }}>{fmtUsdK(s!.totalOverdueUsd)}</div>
            )}
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{statusCounts.overdue} vencidas</div>
            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 4 }}>
              {detracStats.overdue > 0 ? 'Saldo neto sin detracción' : 'Saldo pendiente vencido'}
            </div>
          </div>
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
                    {['Factura', 'Cliente', 'RUC', 'Emisión', 'Vencimiento', 'Total', 'Pagado', 'Saldo', 'Detrac.', 'Estado'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: i >= 5 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((inv, i) => {
                    const isUsd = inv.currency === 'USD'
                    const isPaid = inv.status === 'PAID'
                    const effectivelyOverdue = !isPaid && (inv.status === 'OVERDUE' || new Date(inv.dueDate) < todayMidnight)
                    return (
                      <tr key={inv.id} style={{
                        borderBottom: '1px solid var(--clr-border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)',
                        ...(effectivelyOverdue ? { borderLeft: '2px solid var(--clr-danger)' } : {}),
                      }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-doc-number)', whiteSpace: 'nowrap' }}>
                          {inv.series}-{inv.number.padStart(8, '0')}
                          {isUsd && <span style={{ fontSize: 9, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, padding: '1px 4px', marginLeft: 5, fontFamily: 'sans-serif' }}>USD</span>}
                        </td>
                        <td title={inv.clientName} style={{ padding: '9px 12px', color: 'var(--clr-text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.clientName}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace' }}>{inv.clientRuc}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(inv.issueDate)}</td>
                        <td style={{ padding: '9px 12px', color: effectivelyOverdue ? 'var(--clr-danger)' : 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
                          {fmtD(inv.dueDate)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-text)', fontWeight: 600 }}>
                          {isUsd && inv.totalUsd != null ? fmtUsd(inv.totalUsd) : fmt(inv.total)}
                          {isUsd && inv.tcambio != null && (
                            <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', fontWeight: 400 }}>TC {inv.tcambio.toFixed(3)}</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-success)' }}>
                          {inv.paid > 0 ? fmt(inv.paid) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: inv.balance > 0 ? (effectivelyOverdue ? 'var(--clr-danger)' : '#d97706') : 'var(--clr-success)', fontWeight: 600 }}>
                          {isUsd && inv.balanceUsd != null ? fmtUsd(inv.balanceUsd) : (inv.balance > 0 ? fmt(inv.balance) : '—')}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          {inv.detraccion > 0
                            ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fef9c3', color: '#854d0e', whiteSpace: 'nowrap' }}>
                                {fmt(inv.detraccion)}
                              </span>
                            : <span style={{ color: 'var(--clr-border)', fontSize: 12 }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          {isPaid ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: STATUS_CFG.PAID.bg, color: STATUS_CFG.PAID.color }}>Pagada</span>
                          ) : effectivelyOverdue ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: STATUS_CFG.OVERDUE.bg, color: STATUS_CFG.OVERDUE.color, whiteSpace: 'nowrap' }}>Vencida</span>
                          ) : inv.status === 'PARTIAL' ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: STATUS_CFG.PARTIAL.bg, color: STATUS_CFG.PARTIAL.color }}>Pago parcial</span>
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: STATUS_CFG.PENDING.bg, color: STATUS_CFG.PENDING.color }}>Pendiente</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    <td colSpan={5} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>{items.length} facturas</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                      <div style={{ color: 'var(--clr-text)' }}>{fmt(s?.totalInvoiced ?? 0)}</div>
                      {(s?.totalInvoicedUsd ?? 0) > 0 && <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>{fmtUsd(s!.totalInvoicedUsd)}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                      <div style={{ color: 'var(--clr-success)' }}>{fmt(s?.totalPaid ?? 0)}</div>
                      {(s?.totalPaidUsd ?? 0) > 0 && <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>{fmtUsd(s!.totalPaidUsd)}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                      <div style={{ color: '#d97706' }}>{fmt(s?.totalPending ?? 0)}</div>
                      {(s?.totalPendingUsd ?? 0) > 0 && <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>{fmtUsd(s!.totalPendingUsd)}</div>}
                    </td>
                    <td />
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
