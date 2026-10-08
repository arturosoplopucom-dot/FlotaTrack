import { useState } from 'react'
import { useAnalytics } from '../hooks/useFlota'

type Period = '1M' | '3M' | '6M' | '1Y'

const PERIODS: Period[] = ['1M', '3M', '6M', '1Y']

const fmtAxis = (n: number) => {
  if (n >= 1_000_000) return `S/${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `S/${(n / 1_000).toFixed(0)}k`
  return `S/${n}`
}

const fmtFull = (n: number) =>
  'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function RevenueChart() {
  const { data, isLoading } = useAnalytics()
  const [activePeriod, setActivePeriod] = useState<Period>('6M')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (isLoading) {
    return (
      <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, height: 360 }}
        className="animate-pulse" />
    )
  }
  if (!data?.monthly?.length) return null

  const allMonthly = data.monthly
  const sliceMap: Record<Period, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': allMonthly.length }
  const slice     = allMonthly.slice(-sliceMap[activePeriod])
  const labels    = slice.map((d) => d.mes)
  const invoiced  = slice.map((d) => d.emitido)
  const collected = slice.map((d) => d.cobrado)

  const totalInvoiced  = invoiced.reduce((a, b) => a + b, 0)
  const totalCollected = collected.reduce((a, b) => a + b, 0)
  const efficiency     = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0

  // SVG layout
  const HEIGHT       = 280
  const W            = 720
  const margin       = { top: 24, right: 28, bottom: 38, left: 68 }
  const innerW       = W - margin.left - margin.right
  const innerH       = HEIGHT - margin.top - margin.bottom

  const rawMax  = Math.max(...invoiced, ...collected, 1000)
  const step50k = Math.max(10000, Math.ceil(rawMax / 50000) * 10000)
  const maxVal  = Math.ceil(rawMax / step50k) * step50k

  const numItems = labels.length
  const colW     = innerW / numItems
  const barW     = Math.max(14, Math.min(40, colW * 0.45))

  const toY = (val: number) => margin.top + innerH - (val / maxVal) * innerH

  const linePoints = collected.map((val, i) => ({
    x: margin.left + i * colW + colW / 2,
    y: toY(val),
    val,
  }))
  const lineD = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const TICKS = 4
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => ({
    val: (maxVal / TICKS) * (TICKS - i),
    y: margin.top + (i / TICKS) * innerH,
  }))

  return (
    <div style={{
      background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)', width: '100%', boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--clr-border)', paddingBottom: 14,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text)', margin: 0, letterSpacing: '-0.01em' }}>
              Facturado vs. Cobrado
            </h3>
            <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', fontWeight: 500 }}>
              (Efectividad: {efficiency.toFixed(1)}%)
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
            Emisión mensual vs recaudación efectiva · soles
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'var(--clr-primary)', borderRadius: 2 }} />
              <span style={{ color: 'var(--clr-text-muted)' }}>Facturado</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 14, height: 3, background: 'var(--clr-success)', borderRadius: 2 }} />
              <span style={{ color: 'var(--clr-text-muted)' }}>Cobrado</span>
            </div>
          </div>

          {/* Period tabs */}
          <div style={{
            display: 'flex', background: 'var(--clr-bg)', borderRadius: 6, padding: 3, border: '1px solid var(--clr-border)',
          }}>
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => { setActivePeriod(p); setHoveredIndex(null) }}
                style={{
                  background: p === activePeriod ? 'var(--clr-primary)' : 'transparent',
                  color: p === activePeriod ? '#fff' : 'var(--clr-text-muted)',
                  border: 'none', borderRadius: 4, padding: '4px 10px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ width: '100%', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${HEIGHT}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Gridlines + Y labels */}
          {ticks.map((tick, i) => (
            <g key={i}>
              <line
                x1={margin.left} y1={tick.y}
                x2={W - margin.right} y2={tick.y}
                stroke="var(--clr-border)" strokeWidth="1"
                strokeDasharray={i === TICKS ? 'none' : '3 3'}
              />
              <text x={margin.left - 8} y={tick.y + 4}
                fill="var(--clr-text-muted)" fontSize="10" textAnchor="end"
                fontFamily="'JetBrains Mono', monospace">
                {fmtAxis(tick.val)}
              </text>
            </g>
          ))}

          {/* Bars (invoiced) */}
          {invoiced.map((val, i) => {
            const bh = (val / maxVal) * innerH
            const bx = margin.left + i * colW + colW / 2 - barW / 2
            const by = margin.top + innerH - bh
            const hovered = hoveredIndex === i
            return (
              <g key={`bar-${i}`}>
                <rect
                  x={margin.left + i * colW} y={margin.top}
                  width={colW} height={innerH}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredIndex(i)}
                />
                <rect
                  x={bx} y={by} width={barW} height={Math.max(bh, 1)}
                  fill={hovered ? '#3b82f6' : 'rgba(37,99,235,0.7)'}
                  rx="3"
                  style={{ transition: 'fill 0.15s ease', pointerEvents: 'none' }}
                />
              </g>
            )
          })}

          {/* Collected line */}
          <path d={lineD} fill="none" stroke="#10b981" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points + X labels */}
          {linePoints.map((pt, i) => {
            const hovered = hoveredIndex === i
            return (
              <g key={`pt-${i}`}>
                <circle cx={pt.x} cy={pt.y} r={hovered ? 6 : 4}
                  fill="#10b981" stroke="var(--clr-surface)" strokeWidth="2"
                  style={{ transition: 'r 0.15s ease', pointerEvents: 'none' }} />
                <text x={pt.x} y={margin.top + innerH + 22}
                  fill={hovered ? 'var(--clr-text)' : 'var(--clr-text-muted)'}
                  fontSize="11" fontWeight={hovered ? 700 : 500}
                  textAnchor="middle">
                  {labels[i]}
                </text>
              </g>
            )
          })}

          {/* Scrubber line */}
          {hoveredIndex !== null && (
            <line
              x1={linePoints[hoveredIndex].x} y1={margin.top}
              x2={linePoints[hoveredIndex].x} y2={margin.top + innerH}
              stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="2 2"
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Floating tooltip */}
        {hoveredIndex !== null && (() => {
          const inv = invoiced[hoveredIndex]
          const col = collected[hoveredIndex]
          const eff = inv > 0 ? (col / inv) * 100 : 0
          const pct = (linePoints[hoveredIndex].x / W) * 100
          return (
            <div style={{
              position: 'absolute', top: 10,
              left: `${Math.min(82, Math.max(18, pct))}%`,
              transform: 'translateX(-50%)',
              background: 'var(--clr-surface)', border: '1px solid var(--clr-border)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              borderRadius: 6, padding: '10px 14px',
              pointerEvents: 'none', zIndex: 10, minWidth: 190,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text)', marginBottom: 6, borderBottom: '1px solid var(--clr-border)', paddingBottom: 4 }}>
                {labels[hoveredIndex]}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: 'var(--clr-text-muted)' }}>Facturado:</span>
                <span style={{ color: 'var(--clr-primary)', fontWeight: 600, fontFamily: 'monospace' }}>{fmtFull(inv)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: 'var(--clr-text-muted)' }}>Cobrado:</span>
                <span style={{ color: 'var(--clr-success)', fontWeight: 600, fontFamily: 'monospace' }}>{fmtFull(col)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderTop: '1px dashed var(--clr-border)', paddingTop: 4, marginTop: 4 }}>
                <span style={{ color: 'var(--clr-text-muted)' }}>Efectividad:</span>
                <span style={{ color: eff >= 90 ? 'var(--clr-success)' : '#d97706', fontWeight: 700 }}>{eff.toFixed(1)}%</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Summary footer */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
        borderTop: '1px solid var(--clr-border)', paddingTop: 14,
      }}>
        {[
          { label: 'Total Facturado', value: fmtFull(totalInvoiced), color: 'var(--clr-primary)' },
          { label: 'Total Cobrado',   value: fmtFull(totalCollected), color: 'var(--clr-success)' },
          { label: 'Efectividad',     value: `${efficiency.toFixed(1)}%`, color: efficiency >= 90 ? 'var(--clr-success)' : efficiency >= 70 ? '#d97706' : 'var(--clr-danger)' },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

