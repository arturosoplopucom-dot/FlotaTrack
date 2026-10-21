import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Receipt, ChevronLeft, DollarSign, Hash, TrendingUp, CreditCard } from 'lucide-react'
import { usePaymentsReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt    = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => '$ '  + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtAmt = (n: number, currency: string) => currency === 'USD' ? fmtUsd(n) : fmt(n)
const fmtD   = (d: string) => format(parseISO(d), 'dd/MM/yyyy')

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

  // ─── Estadísticas por moneda — calculadas desde items (fuente única correcta) ─
  const stats = useMemo(() => {
    let penTotal = 0, usdTotal = 0, penCount = 0, usdCount = 0
    const penByMethod: Record<string, { count: number; amount: number }> = {}
    const usdByMethod: Record<string, { count: number; amount: number }> = {}
    const penMonthly:  Record<string, number> = {}
    const usdMonthly:  Record<string, number> = {}

    for (const p of items) {
      const mk = p.paidAt.slice(0, 7)
      if (p.currency === 'USD') {
        usdTotal += p.amount; usdCount++
        if (!usdByMethod[p.method]) usdByMethod[p.method] = { count: 0, amount: 0 }
        usdByMethod[p.method].count++; usdByMethod[p.method].amount += p.amount
        usdMonthly[mk] = (usdMonthly[mk] ?? 0) + p.amount
      } else {
        penTotal += p.amount; penCount++
        if (!penByMethod[p.method]) penByMethod[p.method] = { count: 0, amount: 0 }
        penByMethod[p.method].count++; penByMethod[p.method].amount += p.amount
        penMonthly[mk] = (penMonthly[mk] ?? 0) + p.amount
      }
    }

    const topPenMethod = Object.entries(penByMethod).sort((a, b) => b[1].amount - a[1].amount)[0] ?? null
    const topUsdMethod = Object.entries(usdByMethod).sort((a, b) => b[1].amount - a[1].amount)[0] ?? null

    return {
      penTotal, usdTotal, penCount, usdCount,
      penAvg: penCount > 0 ? penTotal / penCount : 0,
      usdAvg: usdCount > 0 ? usdTotal / usdCount : 0,
      penByMethod, usdByMethod, penMonthly, usdMonthly,
      topPenMethod, topUsdMethod,
    }
  }, [items])

  const penMonthlyEntries = useMemo(() =>
    Object.entries(stats.penMonthly).sort((a, b) => a[0].localeCompare(b[0])).slice(-6),
  [stats.penMonthly])

  const usdMonthlyEntries = useMemo(() =>
    Object.entries(stats.usdMonthly).sort((a, b) => a[0].localeCompare(b[0])).slice(-6),
  [stats.usdMonthly])

  const maxPenMonthly = useMemo(() => Math.max(...penMonthlyEntries.map(([, v]) => v), 1), [penMonthlyEntries])
  const maxUsdMonthly = useMemo(() => Math.max(...usdMonthlyEntries.map(([, v]) => v), 1), [usdMonthlyEntries])

  const hasBothCurrencies = stats.penCount > 0 && stats.usdCount > 0

  // CSV export
  const exportData = items.map((p) => ({
    'Fecha':       fmtD(p.paidAt),
    'Factura':     `${p.invoiceSeries}-${p.invoiceNumber}`,
    'Cliente':     p.clientName,
    'RUC':         p.clientRuc,
    'Moneda':      p.currency,
    'Método':      METHOD_CFG[p.method]?.label ?? p.method,
    'Referencia':  p.reference ?? '',
    'Monto S/':    p.currency !== 'USD' ? fmt(p.amount)    : '',
    'Monto $':     p.currency === 'USD' ? fmtUsd(p.amount) : '',
    'Total Fac.':  fmtAmt(p.invoiceTotal, p.currency),
    'Notas':       p.notes ?? '',
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

          {/* Total Cobrado */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderLeft: '4px solid var(--clr-success)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <DollarSign size={14} style={{ color: 'var(--clr-success)' }} />
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cobrado</span>
            </div>
            {stats.penTotal > 0 && <div style={{ fontSize: hasBothCurrencies ? 18 : 22, fontWeight: 700, color: 'var(--clr-text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.penTotal)}</div>}
            {stats.usdTotal > 0 && <div style={{ fontSize: hasBothCurrencies ? 18 : 22, fontWeight: 700, color: '#2563eb', fontVariantNumeric: 'tabular-nums', marginTop: stats.penTotal > 0 ? 2 : 0 }}>{fmtUsd(stats.usdTotal)}</div>}
            {stats.penTotal === 0 && stats.usdTotal === 0 && <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)' }}>—</div>}
            <div style={{ fontSize: 10, marginTop: 4, color: 'var(--clr-text-subtle)' }}>Efectivo recibido sin detracción</div>
          </div>

          {/* N° de Cobros */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderLeft: '4px solid var(--clr-primary)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Hash size={14} style={{ color: 'var(--clr-primary)' }} />
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>N° de Cobros</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', fontVariantNumeric: 'tabular-nums' }}>
              {s ? s.total : '—'}
            </div>
            {hasBothCurrencies && (
              <div style={{ fontSize: 10, marginTop: 4, color: 'var(--clr-text-subtle)' }}>{stats.penCount} en S/ · {stats.usdCount} en $</div>
            )}
          </div>

          {/* Promedio/Cobro — separado por moneda */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderLeft: '4px solid var(--clr-violet)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TrendingUp size={14} style={{ color: 'var(--clr-violet)' }} />
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Promedio / Cobro</span>
            </div>
            {stats.penCount > 0 && <div style={{ fontSize: hasBothCurrencies ? 16 : 22, fontWeight: 700, color: 'var(--clr-text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.penAvg)}</div>}
            {stats.usdCount > 0 && <div style={{ fontSize: hasBothCurrencies ? 16 : 22, fontWeight: 700, color: '#2563eb', fontVariantNumeric: 'tabular-nums', marginTop: stats.penCount > 0 ? 2 : 0 }}>{fmtUsd(stats.usdAvg)}</div>}
            {stats.penCount === 0 && stats.usdCount === 0 && <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)' }}>—</div>}
            <div style={{ fontSize: 10, marginTop: 4, color: 'var(--clr-text-subtle)' }}>Promedio por moneda</div>
          </div>

          {/* Método principal */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderLeft: '4px solid #d97706', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <CreditCard size={14} style={{ color: '#d97706' }} />
              <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {stats.topPenMethod ? (METHOD_CFG[stats.topPenMethod[0]]?.label ?? stats.topPenMethod[0]) : 'Método principal'}
              </span>
            </div>
            {stats.topPenMethod
              ? <div style={{ fontSize: hasBothCurrencies ? 16 : 22, fontWeight: 700, color: 'var(--clr-text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.topPenMethod[1].amount)}</div>
              : <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)' }}>—</div>
            }
            {stats.topUsdMethod && (
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {fmtUsd(stats.topUsdMethod[1].amount)}
                {stats.topUsdMethod[0] !== stats.topPenMethod?.[0] && (
                  <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--clr-text-subtle)', marginLeft: 4 }}>
                    ({METHOD_CFG[stats.topUsdMethod[0]]?.label ?? stats.topUsdMethod[0]})
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: 10, marginTop: 4, color: 'var(--clr-text-subtle)' }}>Mayor monto cobrado</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* Por método */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Por Método de Pago</div>

            {/* Soles */}
            {Object.keys(stats.penByMethod).length > 0 && (
              <>
                {hasBothCurrencies && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', marginBottom: 8, textTransform: 'uppercase' }}>Soles (S/)</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(stats.penByMethod).sort((a, b) => b[1].amount - a[1].amount).map(([m, v]) => {
                    const cfg = METHOD_CFG[m] ?? { label: m, color: 'var(--clr-text-subtle)', bg: 'var(--clr-surface-hover)' }
                    const pct = stats.penTotal > 0 ? (v.amount / stats.penTotal) * 100 : 0
                    return (
                      <div key={m}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)' }}>{fmt(v.amount)}</span>
                            <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginLeft: 6 }}>{v.count} cobro{v.count !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div style={{ height: 5, background: 'var(--clr-border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Dólares */}
            {Object.keys(stats.usdByMethod).length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', margin: `${hasBothCurrencies ? 16 : 0}px 0 8px`, textTransform: 'uppercase' }}>Dólares ($)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(stats.usdByMethod).sort((a, b) => b[1].amount - a[1].amount).map(([m, v]) => {
                    const cfg = METHOD_CFG[m] ?? { label: m, color: 'var(--clr-text-subtle)', bg: 'var(--clr-surface-hover)' }
                    const pct = stats.usdTotal > 0 ? (v.amount / stats.usdTotal) * 100 : 0
                    return (
                      <div key={m}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>{cfg.label}</span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{fmtUsd(v.amount)}</span>
                            <span style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginLeft: 6 }}>{v.count} cobro{v.count !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div style={{ height: 5, background: 'var(--clr-border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6', borderRadius: 3, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {Object.keys(stats.penByMethod).length === 0 && Object.keys(stats.usdByMethod).length === 0 && (
              <div style={{ color: 'var(--clr-text-subtle)', fontSize: 12, textAlign: 'center', padding: 24 }}>Sin datos</div>
            )}
          </div>

          {/* Tendencia mensual */}
          <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-muted)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tendencia Mensual</div>

            {/* Barras soles */}
            {penMonthlyEntries.length > 0 && (
              <>
                {hasBothCurrencies && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', marginBottom: 6, textTransform: 'uppercase' }}>Soles (S/)</div>}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: hasBothCurrencies ? 72 : 100 }}>
                  {penMonthlyEntries.map(([key, val]) => (
                    <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 9, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>{fmt(val).replace('S/ ', '')}</div>
                      <div style={{ width: '100%', background: 'var(--clr-success)', borderRadius: '3px 3px 0 0', height: `${Math.max((val / maxPenMonthly) * (hasBothCurrencies ? 44 : 72), 4)}px`, transition: 'height 0.4s ease' }} />
                      <div style={{ fontSize: 9, color: 'var(--clr-text-subtle)' }}>{key.slice(5)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Barras dólares */}
            {usdMonthlyEntries.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', margin: `${penMonthlyEntries.length > 0 ? 12 : 0}px 0 6px`, textTransform: 'uppercase' }}>Dólares ($)</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: hasBothCurrencies ? 72 : 100 }}>
                  {usdMonthlyEntries.map(([key, val]) => (
                    <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 9, color: '#2563eb', fontWeight: 600 }}>{fmtUsd(val).replace('$ ', '')}</div>
                      <div style={{ width: '100%', background: '#3b82f6', borderRadius: '3px 3px 0 0', height: `${Math.max((val / maxUsdMonthly) * (hasBothCurrencies ? 44 : 72), 4)}px`, transition: 'height 0.4s ease' }} />
                      <div style={{ fontSize: 9, color: 'var(--clr-text-subtle)' }}>{key.slice(5)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {penMonthlyEntries.length === 0 && usdMonthlyEntries.length === 0 && (
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
                    {['Fecha', 'Factura', 'Cliente', 'Método', 'Referencia'].map((h) => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                    <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Monto S/</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Monto $</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p, i) => {
                    const cfg = METHOD_CFG[p.method] ?? { label: p.method, color: 'var(--clr-text-subtle)', bg: 'var(--clr-surface-hover)' }
                    const isUsd = p.currency === 'USD'
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--clr-border)', background: i % 2 === 0 ? 'transparent' : 'var(--clr-bg)' }}>
                        <td style={{ padding: '9px 14px', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>{fmtD(p.paidAt)}</td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap' }}>{p.invoiceSeries}-{p.invoiceNumber}</td>
                        <td style={{ padding: '9px 14px', color: 'var(--clr-text)' }}>{p.clientName}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
                        </td>
                        <td style={{ padding: '9px 14px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace', fontSize: 11 }}>{p.reference ?? '—'}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--clr-success)', whiteSpace: 'nowrap' }}>
                          {!isUsd ? fmt(p.amount) : <span style={{ color: 'var(--clr-text-subtle)', fontWeight: 400 }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#2563eb', whiteSpace: 'nowrap' }}>
                          {isUsd ? fmtUsd(p.amount) : <span style={{ color: 'var(--clr-text-subtle)', fontWeight: 400 }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                    <td colSpan={5} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase' }}>Total</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: 'var(--clr-success)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {stats.penTotal > 0 ? fmt(stats.penTotal) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#2563eb', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {stats.usdTotal > 0 ? fmtUsd(stats.usdTotal) : '—'}
                    </td>
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
