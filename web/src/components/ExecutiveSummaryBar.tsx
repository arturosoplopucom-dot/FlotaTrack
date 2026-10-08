import { useNavigate } from 'react-router-dom'
import { useDashboard } from '../hooks/useInvoices'
import { useEquipment, useAnalytics } from '../hooks/useFlota'

const fmtSoles = (n: number) => {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `S/ ${(n / 1_000).toFixed(1)}k`
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const trendSign = (pct: number) => (pct >= 0 ? '+' : '')

export default function ExecutiveSummaryBar() {
  const navigate = useNavigate()
  const { data: dash }      = useDashboard()
  const { data: equipment } = useEquipment()
  const { data: analytics } = useAnalytics()

  const eq          = equipment ?? []
  const active      = eq.filter((e) => e.status !== 'RETIRED')
  const totalEq     = active.length
  const alquilados  = active.filter((e) => e.status === 'IN_USE').length
  const utilPct     = totalEq > 0 ? (alquilados / totalEq) * 100 : 0

  const monthly     = analytics?.monthly ?? []
  const lastMonth   = monthly.at(-1)
  const prevMonth   = monthly.at(-2)

  const emitidoMes  = lastMonth?.emitido  ?? 0
  const emitidoPrev = prevMonth?.emitido  ?? 0
  const cobradoMes  = lastMonth?.cobrado  ?? 0
  const cobradoPrev = prevMonth?.cobrado  ?? 0

  const emitidoTrend = emitidoPrev > 0 ? ((emitidoMes - emitidoPrev) / emitidoPrev) * 100 : null
  const cobradoTrend = cobradoPrev > 0 ? ((cobradoMes - cobradoPrev) / cobradoPrev) * 100 : null

  const totalPending  = (dash?.overdue.amount ?? 0) + (dash?.dueSoon.amount ?? 0) + (dash?.current.amount ?? 0)
  const overduePct    = totalPending > 0 ? (( dash?.overdue.amount ?? 0) / totalPending) * 100 : 0

  const metrics = [
    {
      id: 'facturacion-mes',
      label: 'FACTURACIÓN DEL MES',
      value: fmtSoles(emitidoMes),
      subtext: emitidoTrend !== null
        ? `${trendSign(emitidoTrend)}${emitidoTrend.toFixed(1)}% vs mes anterior`
        : lastMonth?.mes ?? '—',
      trendText: 'Emisión facturada',
      trendPositive: emitidoTrend === null || emitidoTrend >= 0,
      accentColor: '#2563eb',
      clickable: false,
    },
    {
      id: 'cobrado-mes',
      label: 'COBRADO (MES ACTUAL)',
      value: fmtSoles(cobradoMes),
      subtext: cobradoTrend !== null
        ? `${trendSign(cobradoTrend)}${cobradoTrend.toFixed(1)}% vs mes anterior`
        : 'Período activo',
      trendText: 'Ingresos recuperados',
      trendPositive: cobradoTrend === null || cobradoTrend >= 0,
      accentColor: '#10b981',
      clickable: false,
    },
    {
      id: 'overdue-ratio',
      label: '% CARTERA VENCIDA',
      value: `${overduePct.toFixed(1)}%`,
      subtext: overduePct > 20 ? 'Por encima del umbral' : overduePct > 15 ? 'Atención requerida' : 'Dentro del objetivo',
      trendText: 'Meta corporativa: < 15%',
      trendPositive: overduePct <= 15,
      accentColor: overduePct > 20 ? '#ef4444' : overduePct > 15 ? '#f59e0b' : '#10b981',
      clickable: true,
    },
    {
      id: 'fleet-utilization',
      label: 'UTILIZACIÓN DE FLOTA',
      value: `${utilPct.toFixed(1)}%`,
      subtext: `${alquilados} de ${totalEq} equipos activos`,
      trendText: utilPct >= 70 ? 'Nivel óptimo' : 'Capacidad disponible',
      trendPositive: utilPct >= 50,
      accentColor: 'var(--clr-primary)',
      clickable: false,
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      backgroundColor: 'var(--clr-surface)',
      border: '1px solid var(--clr-border)',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      width: '100%',
    }}>
      {metrics.map((item, index) => {
        const isLast = index === metrics.length - 1
        return (
          <div
            key={item.id}
            onClick={() => { if (item.id === 'overdue-ratio') navigate('/aging') }}
            style={{
              padding: '16px 20px',
              borderRight: isLast ? 'none' : '1px solid var(--clr-border)',
              cursor: item.clickable ? 'pointer' : 'default',
              transition: 'background-color 0.15s ease',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: 80,
            }}
            onMouseEnter={(e) => { if (item.clickable) e.currentTarget.style.backgroundColor = 'var(--clr-surface-hover)' }}
            onMouseLeave={(e) => { if (item.clickable) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {/* Label + accent dot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--clr-text-subtle)', textTransform: 'uppercase' }}>
                {item.label}
              </span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.accentColor }} />
            </div>

            {/* Big value */}
            <div style={{
              fontSize: 24, fontWeight: 700, color: 'var(--clr-text)',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              lineHeight: 1.2, marginBottom: 6,
            }}>
              {item.value}
            </div>

            {/* Subtext + trend label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, flexWrap: 'wrap' }}>
              <span style={{ color: item.trendPositive ? 'var(--clr-success)' : 'var(--clr-danger)' }}>{item.subtext}</span>
              <span style={{ color: 'var(--clr-text-subtle)' }}>·</span>
              <span style={{ color: 'var(--clr-text-subtle)' }}>{item.trendText}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

