import { useNavigate } from 'react-router-dom'
import {
  BarChart2, Truck, ClipboardList, Receipt, FileText,
  Wrench, Users, TrendingUp, ChevronRight, Lock,
} from 'lucide-react'
import AppShell from '../components/AppShell'

interface Category {
  id:    string
  icon:  typeof BarChart2
  color: string
  title: string
  desc:  string
  path?: string
  badge?: string
}

const CATEGORIES: Category[] = [
  { id: 'gerencial',     icon: TrendingUp,   color: '#3b82f6', title: 'Reportes Gerenciales',       desc: 'Ingresos, rentabilidad, KPIs y comparativos',    path: '/reports/gerencial'    },
  { id: 'equipos',       icon: Truck,        color: '#f59e0b', title: 'Reportes de Equipos',         desc: 'Flota, utilización e ingresos por equipo',       path: '/reports/equipos'      },
  { id: 'ots',           icon: ClipboardList,color: '#8b5cf6', title: 'Órdenes de Trabajo',           desc: 'Estado operativo, márgenes y actividad',         path: '/reports/ots'          },
  { id: 'facturacion',   icon: Receipt,      color: 'var(--clr-success)',  title: 'Reporte de Facturación',       desc: 'Facturas emitidas, IGV, estados y totales',      path: '/reports/facturacion'  },
  { id: 'cobranza',      icon: TrendingUp,   color: 'var(--clr-danger)',   title: 'Cuentas por Cobrar',           desc: 'Antigüedad de deuda, vencidas y saldos',         path: '/reports/cobranza'     },
  { id: 'cotizaciones',  icon: FileText,     color: 'var(--clr-teal)',     title: 'Reporte de Cotizaciones',      desc: 'Pipeline comercial y tasa de conversión',        path: '/reports/cotizaciones' },
  { id: 'mantenimiento', icon: Wrench,       color: 'var(--clr-orange)',   title: 'Reportes de Mantenimiento',   desc: 'Costo, historial y planes pendientes',           path: '/reports/mantenimiento'},
  { id: 'clientes',      icon: Users,        color: 'var(--clr-violet)',   title: 'Reportes de Clientes',         desc: 'Ranking por facturación y saldo pendiente',      path: '/reports/clientes'     },
  { id: 'alquileres',    icon: ClipboardList,color: 'var(--clr-text-subtle)', title: 'Reportes de Alquileres',       desc: 'Contratos, duración y actividad por equipo',     badge: 'Próximamente' },
  { id: 'operarios',     icon: Users,        color: 'var(--clr-text-subtle)', title: 'Reportes de Operarios',        desc: 'Horas trabajadas por operador',                  badge: 'Próximamente' },
  { id: 'horometros',    icon: Truck,        color: 'var(--clr-text-subtle)', title: 'Control de Horómetros',        desc: 'Registro y alertas de horómetro por equipo',     badge: 'Próximamente' },
  { id: 'rentabilidad',  icon: TrendingUp,   color: '#3b82f6',                title: 'Rentabilidad por Equipo',      desc: 'Ingresos vs costos por máquina y contrato',      path: '/reports/rentabilidad' },
  { id: 'disponibilidad',icon: Truck,        color: '#06b6d4',                title: 'Disponibilidad de Equipos',   desc: 'Agenda de disponibilidad para el área comercial',path: '/reports/disponibilidad' },
  { id: 'incidencias',   icon: Wrench,       color: 'var(--clr-text-subtle)', title: 'Reporte de Incidencias',       desc: 'Tipo, tiempo de atención y equipos afectados',   badge: 'Próximamente' },
  { id: 'documentacion', icon: FileText,     color: 'var(--clr-text-subtle)', title: 'Documentación de Equipos',    desc: 'SOAT, revisiones, seguros y vencimientos',       badge: 'Próximamente' },
  { id: 'pagos',         icon: Receipt,      color: '#10b981',                title: 'Reporte de Pagos',             desc: 'Cobros recibidos, métodos y conciliación',       path: '/reports/pagos' },
]

function CategoryCard({ cat }: { cat: Category }) {
  const navigate = useNavigate()
  const Icon = cat.icon
  const active = !!cat.path

  return (
    <div
      onClick={() => active && navigate(cat.path!)}
      style={{
        background: 'var(--clr-surface)',
        border: `1px solid var(--clr-border)`,
        borderRadius: 12,
        padding: '20px 20px 16px',
        cursor: active ? 'pointer' : 'default',
        opacity: active ? 1 : 0.6,
        transition: 'border-color 0.15s, transform 0.1s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => { if (active) { (e.currentTarget as HTMLElement).style.borderColor = cat.color; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' } }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--clr-border)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
    >
      {/* Accent bar */}
      {active && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: cat.color }} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ padding: 8, borderRadius: 8, background: `${cat.color}18` }}>
          <Icon size={18} style={{ color: cat.color, display: 'block' }} />
        </div>
        {cat.badge ? (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-subtle)', letterSpacing: '0.04em' }}>
            {cat.badge.toUpperCase()}
          </span>
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--clr-text-subtle)' }} />
        )}
        {!active && !cat.badge && <Lock size={13} style={{ color: 'var(--clr-text-subtle)' }} />}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--clr-text)' : 'var(--clr-text-subtle)', marginBottom: 4 }}>{cat.title}</div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', lineHeight: 1.5 }}>{cat.desc}</div>
    </div>
  )
}

export default function ReportsPage() {
  const active   = CATEGORIES.filter((c) => c.path)
  const upcoming = CATEGORIES.filter((c) => !c.path)

  return (
    <AppShell active="reports" title="Centro de Reportes">
      <div style={{ maxWidth: 1400, padding: '24px 28px 56px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <BarChart2 size={22} style={{ color: 'var(--clr-primary)' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
              Centro de Reportes
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--clr-text-subtle)', margin: 0, maxWidth: 520 }}>
            Inteligencia operativa y financiera para FlotaTrack. Accede a métricas de flota, cobranza, operaciones y rentabilidad en tiempo real.
          </p>
        </div>

        {/* Active reports */}
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
            Reportes disponibles — {active.length}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {active.map((cat) => <CategoryCard key={cat.id} cat={cat} />)}
          </div>
        </div>

        {/* Coming soon */}
        <div style={{ marginTop: 28 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
            Próximamente — {upcoming.length}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {upcoming.map((cat) => <CategoryCard key={cat.id} cat={cat} />)}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
