import { useState, useEffect } from 'react'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type AlertItem = {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  actionLabel: string
  type?: string
}

type AlertRibbonProps = {
  alerts: AlertItem[]
  onActionClick?: (alert: AlertItem) => void
}

const SEVERITY_CONFIG: Record<AlertSeverity, { accent: string; icon: string; badge: string }> = {
  critical: { accent: '#dc2626', icon: '⚠️', badge: 'CRÍTICO'       },
  warning:  { accent: '#d97706', icon: '⏳', badge: 'ATENCIÓN'      },
  info:     { accent: '#2563eb', icon: 'ℹ️', badge: 'RECORDATORIO'  },
}

export function AlertRibbon({ alerts, onActionClick }: AlertRibbonProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setCurrentIndex((i) => Math.min(i, Math.max(0, alerts.length - 1)))
  }, [alerts.length])

  if (dismissed || alerts.length === 0) return null

  const alert = alerts[Math.min(currentIndex, alerts.length - 1)]
  const cfg = SEVERITY_CONFIG[alert.severity]

  return (
    <div style={{
      backgroundColor: `${cfg.accent}14`,
      border: `1px solid ${cfg.accent}40`,
      borderLeft: `4px solid ${cfg.accent}`,
      borderRadius: 8,
      padding: '9px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      {/* Left: icon · badge · title · description */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>{cfg.icon}</span>

        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.07em',
          padding: '2px 7px', borderRadius: 4,
          background: cfg.accent, color: '#ffffff',
          flexShrink: 0, textTransform: 'uppercase',
        }}>
          {cfg.badge}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)', whiteSpace: 'nowrap' }}>
            {alert.title}:
          </span>
          <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alert.description}
          </span>
        </div>
      </div>

      {/* Right: action button · pagination · dismiss */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {onActionClick && (
          <button
            onClick={() => onActionClick(alert)}
            style={{
              background: cfg.accent, color: '#ffffff',
              border: 'none', borderRadius: 5,
              padding: '5px 12px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.82' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
          >
            {alert.actionLabel}
          </button>
        )}

        {alerts.length > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            borderLeft: '1px solid var(--clr-border)', paddingLeft: 8,
            fontSize: 11, color: 'var(--clr-text-muted)',
          }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', marginRight: 2 }}>
              {currentIndex + 1}/{alerts.length}
            </span>
            <button
              onClick={() => setCurrentIndex((p) => (p - 1 + alerts.length) % alerts.length)}
              title="Alerta anterior"
              style={{ background: 'transparent', border: 'none', color: 'var(--clr-text-muted)', cursor: 'pointer', padding: '2px 4px', fontSize: 12, lineHeight: 1 }}
            >◀</button>
            <button
              onClick={() => setCurrentIndex((p) => (p + 1) % alerts.length)}
              title="Siguiente alerta"
              style={{ background: 'transparent', border: 'none', color: 'var(--clr-text-muted)', cursor: 'pointer', padding: '2px 4px', fontSize: 12, lineHeight: 1 }}
            >▶</button>
          </div>
        )}

        <button
          onClick={() => setDismissed(true)}
          title="Ocultar avisos"
          style={{ background: 'transparent', border: 'none', color: 'var(--clr-text-subtle)', fontSize: 13, cursor: 'pointer', padding: '3px 6px', lineHeight: 1, borderRadius: 4, transition: 'background 0.15s, color 0.15s' }}
          onMouseEnter={(e) => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.background = 'var(--clr-surface-hover)'
            b.style.color = 'var(--clr-text)'
          }}
          onMouseLeave={(e) => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.background = 'transparent'
            b.style.color = 'var(--clr-text-subtle)'
          }}
        >✕</button>
      </div>
    </div>
  )
}

export default AlertRibbon
