import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Receipt, ChevronLeft, DollarSign, Hash, TrendingUp, CreditCard } from 'lucide-react'
import { usePaymentsReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

const METHOD_CFG: Record<string, { label: string; color: string; bg: string }> = {
  TRANSFER: { label: 'Transferencia', color: 'var(--clr-primary)',  bg: 'var(--clr-primary-bg)'  },
  CASH:     { label: 'Efectivo',      color: 'var(--clr-success)',  bg: 'var(--clr-success-bg)'  },
  CHECK:    { label: 'Cheque',        color: '#d97706',             bg: 'rgba(217,119,6,0.10)'   },
  DEPOSIT:  { label: 'Depósito',      color: 'var(--clr-violet)',   bg: 'var(--clr-violet-bg)'   },
}

const inpStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none',
}
const labelSt: React.CSSProperties = {
  fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4,
  display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
}

export default function PaymentsReportPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [method,   setMethod]   = useState('')

  const { data, isLoading } = usePaymentsReport({
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
    method:   method   || undefined,
  })

  const s     = data?.summary
  const items = data?.items ?? []

  // Método más usado
  const topMethod = useMemo(() => {
    if (!s?.byMethod) return null
    const entries = Object.entries(s.byMethod)
    if (!entries.length) return null
    return entries.sort((a, b) => b[1].amount - a[1].amount)[0]
  }, [s])

  // Tendencia mensual — últimos 6 meses ordenados
  const monthlyEntries = useMemo(() => {
    if (!s?.monthly) return []
    return Object.entries(s.monthly).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
  }, [s])
  const maxMonthly = useMemo(() => Math.max(...monthlyEntries.map(([, v]) => v), 1), [monthlyEntries])

  // CSV export
  const exportData = items.map((p) => ({
    'Fecha':      fmtD(p.paidAt),
    'Factura':    `${p.invoiceSeries}-${p.invoiceNumber}`,
    'Cliente':    p.clientName,
    'RUC':        p.clientRuc,
    'Método':     METHOD_CFG[p.method]?.label ?? p.method,
    'Referencia': p.reference ?? '',
    'Moneda':     p.currency,
    'Monto':      p.amount,
    'Total Fac.': p.invoiceTotal,
    'Notas':      p.notes ?? '',
  }))

  return (
    <AppShell active="reports" title="Reporte de Pagos">
      <div style={{ padding: '24px 28px', maxWidth: 1400 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <ChevronLeft size={16} /> Reportes
          </button>
          <span style={{ color: 'var(--clr-border)' }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--clr-text-muted)', fontWeight: 600 }}>Reporte de Pagos</span>
          <div style={{ marginLeft: 'auto' }}>
            <ExportMenu title="Reporte de Pagos" csvRows={exportData} filename="ReportePagos" />
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px' }}>
          <div>
            <label style={labelSt}>Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={labelSt}>Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={labelSt}>Método</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={inpStyle}>
              <option value="">Todos</option>
              {Object.entries(METHOD_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          {(dateFrom || dateTo || method) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={() => { setDateFrom(''); setDateTo(''); setMethod('') }}
                style={{ background: 'none', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--clr-text-subtle)' }}>
                Limpiar
              </button>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: DollarSign, label: 'Total Cobrado',    value: s ? fmt(s.totalAmount) : '—',  color: 'var(--clr-success)', note: 'Efectivo recibido sin detracción' },
            { icon: Hash,       label: 'N° de Cobros',     value: s ? String(s.total) : '—',      color: 'var(--clr-primary)', note: undefined },
            { icon: TrendingUp, label: 'Promedio/Cobro',   value: s ? fmt(s.avgAmount) : '—',    color: 'var(--clr-violet)',  note: undefined },
            { icon: CreditCard, label: topMethod ? (METHOD_CFG[topMethod[0]]?.label ?? topMethod[0]) : 'Método principal',
              value: topMethod ? fmt(topMethod[1].amount) : '—', color: '#d97706', note: undefined },
          ].map((k) => (
            <div key={k.label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderLeft: `4px solid ${k.color}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <k.icon size={14} style={{ color: k.color }} />
                <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
              {k.note && <div style={{ fontSize: 10, marginTop: 4, color: 'var(--clr-text-subtle)' }}>{k.note}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* Por método */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Por Método de Pago</div>
            {s && Object.keys(s.byMethod).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(s.byMethod).sort((a, b) => b[1].amount - a[1].amount).map(([m, v]) => {
                  const cfg = METHOD_CFG[m] ?? { label: m, color: 'var(--clr-text-subtle)', bg: 'var(--clr-surface-hover)' }
                  const pct = s.totalAmount > 0 ? (v.amount / s.totalAmount) * 100 : 0
                  return (
                    <div key={m}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)' }}>{fmt(v.amount)}</span>
                          <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginLeft: 6 }}>{v.count} cobros</span>
                        </div>
                      </div>
                      <div style={{ height: 5, background: 'var(--clr-border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--clr-text-subtle)', fontSize: 12, textAlign: 'center', padding: 24 }}>Sin datos</div>
            )}
          </div>

          {/* Tendencia mensual */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tendencia Mensual</div>
            {monthlyEntries.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                {monthlyEntries.map(([key, val]) => (
                  <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 9, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>{fmt(val).replace('S/ ', '')}</div>
                    <div style={{ width: '100%', background: 'var(--clr-success)', borderRadius: '3px 3px 0 0', height: `${Math.max((val / maxMonthly) * 72, 4)}px`, transition: 'height 0.4s ease' }} />
                    <div style={{ fontSize: 9, color: 'var(--clr-text-subtle)' }}>{key.slice(5)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--clr-text-subtle)', fontSize: 12, textAlign: 'center', padding: 24 }}>Sin datos</div>
            )}
          </div>
        </div>

        {/* Tabla de pagos */}
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Detalle de Cobros
            </span>
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{items.length} registros</span>
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Cargando…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin pagos registrados en el período</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--clr-bg)' }}>
                    {['Fecha', 'Factura', 'Cliente', 'Método', 'Referencia', 'Monto'].map((h) => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Monto' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p, i) => {
                    const cfg = METHOD_CFG[p.method] ?? { label: p.method, color: 'var(--clr-text-subtle)', bg: 'var(--clr-surface-hover)' }
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                        <td style={{ padding: '9px 14px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(p.paidAt)}</td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap' }}>{p.invoiceSeries}-{p.invoiceNumber}</td>
                        <td style={{ padding: '9px 14px', color: 'var(--clr-text)' }}>{p.clientName}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
                        </td>
                        <td style={{ padding: '9px 14px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace', fontSize: 11 }}>{p.reference ?? '—'}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--clr-success)', whiteSpace: 'nowrap' }}>{fmt(p.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                    <td colSpan={5} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase' }}>Total</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: 'var(--clr-success)', fontVariantNumeric: 'tabular-nums' }}>{s ? fmt(s.totalAmount) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
