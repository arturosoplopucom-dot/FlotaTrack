export type UrgencyLevel = 'normal' | 'info' | 'success' | 'warning' | 'critical'

export interface KPICardData {
  id: string
  title: string
  subtitle?: string
  urgency: UrgencyLevel
  value: number | string
  formattedValue?: string
  changePct: number
  trend: 'up' | 'down' | 'flat'
  sparkline?: number[]
  colorHex?: string
}

interface KPICardProps {
  data: KPICardData
  onClick?: () => void
}

const urgencyBorderMap: Record<UrgencyLevel, string> = {
  normal:   'var(--clr-primary)',
  info:     'var(--clr-primary)',
  success:  'var(--clr-success)',
  warning:  '#d97706',
  critical: 'var(--clr-danger)',
}

const urgencyBgMap: Record<UrgencyLevel, string> = {
  normal:   'var(--clr-primary-bg)',
  info:     'var(--clr-primary-bg)',
  success:  'var(--clr-success-bg)',
  warning:  'rgba(217,119,6,0.14)',
  critical: 'var(--clr-danger-bg)',
}

const urgencyBadgeBorderMap: Record<UrgencyLevel, string> = {
  normal:   'var(--clr-primary-border)',
  info:     'var(--clr-primary-border)',
  success:  'var(--clr-success-border)',
  warning:  'rgba(217,119,6,0.32)',
  critical: 'var(--clr-danger-border)',
}

const urgencyLabelMap: Record<UrgencyLevel, string> = {
  normal:   'Estable',
  info:     'Estable',
  success:  'Óptimo',
  warning:  'Atención',
  critical: 'Urgente',
}

export default function KPICard({ data, onClick }: KPICardProps) {
  const accentColor = data.colorHex ?? urgencyBorderMap[data.urgency]
  const points = data.sparkline?.length ? data.sparkline : [10, 12, 11, 14, 13, 15]

  const minVal = Math.min(...points)
  const maxVal = Math.max(...points)
  const range  = maxVal - minVal === 0 ? 1 : maxVal - minVal
  const W = 90, H = 32, PY = 4

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = H - PY - ((p - minVal) / range) * (H - PY * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const pathD = `M ${coords.join(' L ')}`
  const areaD = `${pathD} L ${W},${H} L 0,${H} Z`

  const trendArrow = data.trend === 'up' ? '↑' : data.trend === 'down' ? '↓' : '→'
  const isOverdue  = data.id.includes('overdue') || data.id.includes('maintenance') || data.id.includes('vencida')
  const healthyDir = isOverdue ? data.changePct <= 0 : data.changePct >= 0
  const trendColor = data.changePct === 0
    ? 'var(--clr-text-subtle)'
    : healthyDir ? 'var(--clr-success)' : 'var(--clr-danger)'

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--clr-surface)',
        border: '1px solid var(--clr-border)',
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        minHeight: 136,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
        }
      }}
    >
      {/* Title + sparkline row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text-muted)', letterSpacing: '0.02em', display: 'block', marginBottom: 2 }}>
            {data.title}
          </span>
          {data.subtitle && (
            <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)', display: 'block' }}>{data.subtitle}</span>
          )}
        </div>
        <svg width={W} height={H} style={{ flexShrink: 0, overflow: 'visible' }}>
          <defs>
            <linearGradient id={`kg-${data.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={accentColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#kg-${data.id})`} />
          <path d={pathD} fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Big value */}
      <div style={{
        fontSize: 26, fontWeight: 700, color: 'var(--clr-text)',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
        lineHeight: 1.2, margin: '4px 0 10px',
      }}>
        {data.formattedValue ?? String(data.value)}
      </div>

      {/* Trend row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, borderTop: '1px solid var(--clr-border)', paddingTop: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: trendColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          <span>{trendArrow}</span>
          <span>{Math.abs(data.changePct)}%</span>
          <span style={{ color: 'var(--clr-text-subtle)', fontWeight: 400 }}>vs mes ant.</span>
        </div>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 4,
          backgroundColor: urgencyBgMap[data.urgency],
          color: urgencyBorderMap[data.urgency],
          border: `1px solid ${urgencyBadgeBorderMap[data.urgency]}`,
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {urgencyLabelMap[data.urgency]}
        </span>
      </div>
    </div>
  )
}
