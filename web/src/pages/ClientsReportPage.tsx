import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ChevronLeft, AlertCircle } from 'lucide-react'
import { useClientsReport } from '../hooks/useReports'
import AppShell from '../components/AppShell'
import ExportMenu from '../components/ExportMenu'

const fmt  = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)

const inpStyle: React.CSSProperties = {
  background: 'var(--clr-surface)', color: 'var(--clr-text)', border: '1px solid var(--clr-border)',
  borderRadius: 8, padding: '7px 11px', fontSize: 12, outline: 'none',
}
const labelSt: React.CSSProperties = { fontSize: 10, color: 'var(--clr-text-subtle)', marginBottom: 4, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function ClientsReportPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const { data = [], isLoading } = useClientsReport({
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
  })

  const totalInvoiced = data.reduce((s, c) => s + c.totalInvoiced, 0)
  const totalPending  = data.reduce((s, c) => s + c.pending, 0)
  const totalPaid     = data.reduce((s, c) => s + c.totalPaid, 0)
  const maxInvoiced   = Math.max(...data.map((c) => c.totalInvoiced), 1)

  return (
    <AppShell active="reports" title="Reporte de Clientes">
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
              <Users size={20} style={{ color: 'var(--clr-violet)' }} /> Reporte de Clientes
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Ranking por facturación, pendientes y actividad operativa</p>
          </div>
          <ExportMenu
            title="Reporte de Clientes — FlotaTrack"
            filename="clientes"
            csvRows={data.map((c) => ({
              'Cliente': c.businessName, 'RUC': c.ruc, 'Teléfono': c.phone ?? '', 'Email': c.email ?? '',
              'OTs': c.otCount, 'Facturas': c.invoiceCount,
              'Facturado (S/)': c.totalInvoiced.toFixed(2), 'Cobrado (S/)': c.totalPaid.toFixed(2),
              'Pendiente (S/)': c.pending.toFixed(2), 'Facturas vencidas': c.overdueCount,
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
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', cursor: 'pointer' }}>
            Limpiar
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total clientes',    value: String(data.length),   color: 'var(--clr-text)' },
            { label: 'Total facturado',   value: fmtK(totalInvoiced),   color: 'var(--clr-primary)' },
            { label: 'Total cobrado',     value: fmtK(totalPaid),       color: 'var(--clr-success)' },
            { label: 'Saldo pendiente',   value: fmtK(totalPending),    color: totalPending > 0 ? '#d97706' : 'var(--clr-success)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
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
            ) : !data.length ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--clr-text-subtle)', fontSize: 13 }}>Sin clientes en el período seleccionado</div>
            ) : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    {['#', 'Cliente', 'RUC', 'OTs', 'Facturas', 'Facturado', 'Cobrado', 'Pendiente', 'Vencidas'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: i >= 3 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--clr-border)', background: 'transparent' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: '9px 12px', maxWidth: 200 }}>
                        <div title={c.businessName} style={{ color: 'var(--clr-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.businessName}</div>
                        <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>
                          {[c.phone, c.email].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--clr-text-subtle)', fontFamily: 'monospace' }}>{c.ruc}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{c.otCount}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-text-muted)' }}>{c.invoiceCount}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                        <div>
                          <div style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{c.totalInvoiced > 0 ? fmtK(c.totalInvoiced) : '—'}</div>
                          {c.totalInvoiced > 0 && (
                            <div style={{ height: 3, background: 'var(--clr-surface-hover)', borderRadius: 2, marginTop: 3 }}>
                              <div style={{ height: '100%', borderRadius: 2, width: `${(c.totalInvoiced / maxInvoiced) * 100}%`, background: 'var(--clr-violet)' }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--clr-success)' }}>{c.totalPaid > 0 ? fmtK(c.totalPaid) : '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: c.pending > 0 ? '#d97706' : 'var(--clr-text-subtle)', fontWeight: c.pending > 0 ? 600 : 400 }}>
                        {c.pending > 0 ? fmtK(c.pending) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                        {c.overdueCount > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--clr-danger)', fontWeight: 700, fontSize: 11 }}>
                            <AlertCircle size={11} /> {c.overdueCount}
                          </span>
                        ) : <span style={{ color: 'var(--clr-text-subtle)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--clr-border)', background: 'var(--clr-sidebar)' }}>
                    <td colSpan={5} style={{ padding: '10px 12px', fontSize: 11, color: 'var(--clr-text-subtle)', fontWeight: 600 }}>{data.length} clientes</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-primary)', fontWeight: 700 }}>{fmt(totalInvoiced)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--clr-success)', fontWeight: 700 }}>{fmt(totalPaid)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706', fontWeight: 700 }}>{fmt(totalPending)}</td>
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

