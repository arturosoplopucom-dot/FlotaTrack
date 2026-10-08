import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, DollarSign, Truck,
  Users, BarChart2, PieChart, ArrowUpRight, ChevronLeft, FileText, Loader2,
} from 'lucide-react'
import { useProfitability, type ReportPeriod } from '../hooks/useReports'
import { exportGerencialPDF } from '../utils/exportUtils'
import AppShell from '../components/AppShell'

const fmt   = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK  = (n: number) => n >= 1000 ? `S/ ${(n / 1000).toFixed(1)}k` : fmt(n)
const fmtPct= (n: number) => `${n.toFixed(1)}%`

const CATEGORY_LABEL: Record<string, string> = {
  FUEL: 'Combustible', TOLL: 'Peajes', ALLOWANCE: 'Viáticos', MAINTENANCE: 'Mantenimiento', OTHER: 'Otros',
}
const CATEGORY_COLOR: Record<string, string> = {
  FUEL: '#f59e0b', TOLL: '#06b6d4', ALLOWANCE: '#8b5cf6', MAINTENANCE: '#ef4444', OTHER: '#6b7280',
}

function BarChart({ data }: { data: { label: string; revenue: number; costs: number }[] }) {
  if (!data.length) return <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', textAlign: 'center', padding: '32px 0' }}>Sin datos en el período</p>
  const maxVal = Math.max(...data.flatMap((d) => [d.revenue, d.costs]), 1)
  const H = 140
  const barW = Math.min(36, Math.floor(560 / data.length / 2) - 4)
  return (
    <svg viewBox={`0 0 580 ${H + 30}`} style={{ width: '100%' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line key={pct} x1={0} y1={H - H * pct} x2={580} y2={H - H * pct} stroke="var(--clr-border)" strokeWidth={0.5} strokeDasharray="3,3" />
      ))}
      {data.map((d, i) => {
        const slotW = 580 / data.length
        const cx = i * slotW + slotW / 2
        const revH = (d.revenue / maxVal) * H
        const cosH = (d.costs / maxVal) * H
        return (
          <g key={d.label}>
            <rect x={cx - barW - 2} y={H - revH} width={barW} height={revH} fill="#3b82f6" rx={2} opacity={0.85} />
            <rect x={cx + 2} y={H - cosH} width={barW} height={cosH} fill="#ef4444" rx={2} opacity={0.75} />
            <text x={cx} y={H + 16} textAnchor="middle" fill="var(--clr-text-muted)" fontSize={9}>{d.label.slice(5)}</text>
          </g>
        )
      })}
      <rect x={0} y={H + 22} width={8} height={8} fill="#3b82f6" rx={1} />
      <text x={12} y={H + 30} fill="var(--clr-text-muted)" fontSize={8}>Ingresos</text>
      <rect x={60} y={H + 22} width={8} height={8} fill="#ef4444" rx={1} />
      <text x={72} y={H + 30} fill="var(--clr-text-muted)" fontSize={8}>Costos</text>
    </svg>
  )
}

function DonutChart({ data }: { data: { category: string; amount: number }[] }) {
  if (!data.length || data.every((d) => d.amount === 0))
    return <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', textAlign: 'center', padding: '32px 0' }}>Sin costos registrados</p>
  const total = data.reduce((s, d) => s + d.amount, 0)
  const R = 60, cx = 80, cy = 70
  let angle = -Math.PI / 2
  const slices = data.map((d) => {
    const sweep = (d.amount / total) * Math.PI * 2
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle)
    angle += sweep
    const x2 = cx + R * Math.cos(angle), y2 = cy + R * Math.sin(angle)
    return { ...d, x1, y1, x2, y2, large: sweep > Math.PI ? 1 : 0, pct: (d.amount / total) * 100 }
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg viewBox="0 0 160 140" style={{ width: 160, flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={`M ${cx} ${cy} L ${s.x1} ${s.y1} A ${R} ${R} 0 ${s.large} 1 ${s.x2} ${s.y2} Z`}
            fill={CATEGORY_COLOR[s.category] ?? '#6b7280'} stroke="var(--clr-surface)" strokeWidth={1.5} />
        ))}
        <circle cx={cx} cy={cy} r={R * 0.55} fill="var(--clr-surface)" />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--clr-text)" fontSize={9} fontWeight="bold">Total</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--clr-text-muted)" fontSize={7}>{fmtK(total)}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: CATEGORY_COLOR[s.category] ?? '#6b7280' }} />
            <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{CATEGORY_LABEL[s.category] ?? s.category}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-text)' }}>{fmtK(s.amount)}</span>
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', width: 40, textAlign: 'right' }}>{fmtPct(s.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankBar({ value, max, color = '#3b82f6' }: { value: number; max: number; color?: string }) {
  return (
    <div style={{ height: 4, background: 'var(--clr-surface-hover)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', borderRadius: 4, width: `${max > 0 ? Math.max((value / max) * 100, 0) : 0}%`, background: color, transition: 'width 0.3s' }} />
    </div>
  )
}

function KPICard({ label, value, sub, note, positive, icon: Icon, color = 'blue' }: {
  label: string; value: string; sub?: string; note?: string; positive?: boolean; icon: typeof DollarSign; color?: string
}) {
  const ic = { blue: { bg: 'var(--clr-primary-bg)', c: 'var(--clr-primary)' }, green: { bg: 'var(--clr-success-bg)', c: 'var(--clr-success)' },
    red: { bg: 'var(--clr-danger-bg)', c: 'var(--clr-danger)' }, yellow: { bg: 'rgba(217,119,6,0.10)', c: '#d97706' },
    purple: { bg: 'var(--clr-violet-bg)', c: 'var(--clr-violet)' } }[color] ?? { bg: 'var(--clr-primary-bg)', c: 'var(--clr-primary)' }
  return (
    <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{label}</span>
        <div style={{ padding: 6, borderRadius: 8, background: ic.bg }}>
          <Icon size={14} style={{ color: ic.c, display: 'block' }} />
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--clr-text)', lineHeight: 1.2 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
          color: positive === true ? 'var(--clr-success)' : positive === false ? 'var(--clr-danger)' : 'var(--clr-text-subtle)' }}>
          {positive === true  && <TrendingUp size={10} />}
          {positive === false && <TrendingDown size={10} />}
          {sub}
        </div>
      )}
      {note && <div style={{ fontSize: 10, marginTop: 5, color: 'var(--clr-text-subtle)' }}>{note}</div>}
    </div>
  )
}

function Panel({ title, icon: Icon, iconColor, children }: { title: string; icon: typeof BarChart2; iconColor: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={15} style={{ color: iconColor }} /> {title}
      </p>
      {children}
    </div>
  )
}

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: '1m', label: '1 mes' }, { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' }, { key: '1y', label: '1 año' }, { key: 'all', label: 'Histórico' },
]

export default function GerencialReportPage() {
  const navigate = useNavigate()
  const [period, setPeriod]     = useState<ReportPeriod>('all')
  const [exporting, setExporting] = useState(false)
  const { data, isLoading } = useProfitability(period)
  const s = data?.summary
  const maxClientRev = Math.max(...(data?.byClient.map((c) => c.revenue) ?? [1]), 1)
  const maxEquipRev  = Math.max(...(data?.byEquipment.map((e) => e.revenue) ?? [1]), 1)
  const chartData    = (data?.byMonth ?? []).map((m) => ({ label: m.month, revenue: m.revenue, costs: m.costs }))

  return (
    <AppShell active="reports" title="Reporte Gerencial">
      <div style={{ maxWidth: 1400, padding: '24px 28px 56px' }}>

        {/* Back + Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <button onClick={() => navigate('/reports')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 12, padding: 0, marginBottom: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
            >
              <ChevronLeft size={14} /> Centro de Reportes
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={20} style={{ color: 'var(--clr-primary)' }} /> Reporte Gerencial
            </h1>
            <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', marginTop: 4 }}>Ingresos, costos, márgenes operativos y rentabilidad</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 4 }}>
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 7, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: period === p.key ? 'var(--clr-primary)' : 'transparent', color: period === p.key ? 'white' : '#64748b' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <button
              disabled={!data || exporting}
              onClick={() => {
                if (!data) return
                setExporting(true)
                try { exportGerencialPDF(data, 'FlotaTrack') } catch (e) { alert(`Error: ${e instanceof Error ? e.message : String(e)}`) }
                finally { setExporting(false) }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: (!data || exporting) ? 'not-allowed' : 'pointer',
                background: exporting ? '#b91c1c' : '#dc2626', color: '#fff', border: 'none',
                opacity: (!data || exporting) ? 0.5 : 1, transition: 'opacity 0.15s',
              }}
            >
              {exporting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={13} />}
              Exportar PDF
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse" style={{ height: 96, borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <KPICard label="Ingresos operativos"    value={fmtK(s?.totalRevenue ?? 0)}   icon={TrendingUp}   color="blue"   />
              <KPICard label="Costos totales"          value={fmtK(s?.totalCosts ?? 0)}     icon={TrendingDown} color="red"    />
              <KPICard label="Margen bruto"            value={fmtK(s?.grossMargin ?? 0)}    sub={`${fmtPct(s?.marginPct ?? 0)} del total`}
                positive={(s?.marginPct ?? 0) >= 20}  icon={ArrowUpRight}                  color={(s?.marginPct ?? 0) >= 20 ? 'green' : 'yellow'} />
              <KPICard label="Costo de mantenimiento" value={fmtK(s?.totalMaintCost ?? 0)} icon={Truck}        color="purple" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <KPICard label="Total facturado" value={fmtK(s?.totalInvoiced ?? 0)}     icon={DollarSign} color="blue"   note="Valor bruto incl. detracción" />
              <KPICard label="Total cobrado"   value={fmtK(s?.totalCollected ?? 0)}    icon={DollarSign} color="green"  note="Efectivo recibido sin detracción" />
              <KPICard label="Por cobrar"      value={fmtK(s?.pendingCollection ?? 0)} icon={DollarSign} color="yellow" note="Saldo neto sin detracción" />
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginBottom: 12 }}>OTs en el período</p>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[{ v: s?.completedOTs, l: 'Completadas', c: 'var(--clr-success)' }, { v: s?.activeOTs, l: 'Activas', c: 'var(--clr-primary)' }, { v: s?.draftOTs, l: 'Borrador', c: 'var(--clr-text-subtle)' }].map(({ v, l, c }) => (
                    <div key={l} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v ?? 0}</div>
                      <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)', marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Panel title="Ingresos vs Costos por mes" icon={BarChart2} iconColor="#3b82f6"><BarChart data={chartData} /></Panel>
              <Panel title="Distribución de costos" icon={PieChart} iconColor="#8b5cf6"><DonutChart data={data?.byCostCategory ?? []} /></Panel>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Panel title="Top clientes por ingresos" icon={Users} iconColor="var(--clr-success)">
                {!(data?.byClient ?? []).length ? (
                  <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', textAlign: 'center', padding: '16px 0' }}>Sin datos</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(data?.byClient ?? []).map((c, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{i + 1}. {c.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: c.marginPct >= 20 ? 'var(--clr-success)' : c.marginPct >= 0 ? '#d97706' : 'var(--clr-danger)' }}>{fmtPct(c.marginPct)}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', width: 72, textAlign: 'right' }}>{fmtK(c.revenue)}</span>
                          </div>
                        </div>
                        <RankBar value={c.revenue} max={maxClientRev} color="#3b82f6" />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Equipos por rentabilidad" icon={Truck} iconColor="#d97706">
                {!(data?.byEquipment ?? []).length ? (
                  <p style={{ fontSize: 12, color: 'var(--clr-text-subtle)', textAlign: 'center', padding: '16px 0' }}>Sin datos</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(data?.byEquipment ?? []).map((e, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{i + 1}. {e.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {e.hours > 0 && <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{e.hours.toFixed(0)}h</span>}
                            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>{e.otCount} OT</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text)', width: 72, textAlign: 'right' }}>{fmtK(e.revenue)}</span>
                          </div>
                        </div>
                        <RankBar value={e.revenue} max={maxEquipRev} color="#f59e0b" />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
            {(data?.topOTs ?? []).length > 0 && (
              <Panel title="Top OTs por margen bruto" icon={ArrowUpRight} iconColor="var(--clr-success)">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--clr-border)' }}>
                        {['OT', 'Cliente', 'Equipo', 'Ingresos', 'Costos', 'Margen', '%'].map((h, i) => (
                          <th key={h} style={{ paddingBottom: 8, fontWeight: 500, color: 'var(--clr-text-subtle)', fontSize: 11, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.topOTs ?? []).map((ot, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--clr-border)' }}>
                          <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--clr-primary)' }}>{ot.number}</td>
                          <td style={{ padding: '8px 8px 8px 0', color: 'var(--clr-text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ot.clientName}</td>
                          <td style={{ padding: '8px 8px 8px 0', color: 'var(--clr-text-subtle)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ot.equipmentName}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--clr-text)' }}>{fmtK(ot.revenue)}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--clr-danger)' }}>{fmtK(ot.costs)}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: 'var(--clr-success)' }}>{fmtK(ot.margin)}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: ot.marginPct >= 20 ? 'var(--clr-success)' : ot.marginPct >= 0 ? '#d97706' : 'var(--clr-danger)' }}>
                            {fmtPct(ot.marginPct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </AppShell>
  )
}

