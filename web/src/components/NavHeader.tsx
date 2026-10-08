import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import {
  LayoutDashboard, Truck, Users, ClipboardList, LogOut, Building2, History, Settings, Receipt, FileText, Wrench, BarChart2,
} from 'lucide-react'

type NavItem = { key: string; label: string; path: string; icon: typeof LayoutDashboard }

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard',   label: 'Dashboard',    path: '/dashboard',   icon: LayoutDashboard },
  { key: 'cxc',         label: 'Cobranza',     path: '/cxc',         icon: Receipt         },
  { key: 'clients',     label: 'Clientes',     path: '/clients',     icon: Building2       },
  { key: 'payments',    label: 'Pagos',        path: '/payments',    icon: History         },
  { key: 'equipment',   label: 'Equipos',      path: '/equipment',   icon: Truck           },
  { key: 'operators',   label: 'Operarios',    path: '/operators',   icon: Users           },
  { key: 'quotes',      label: 'Cotizaciones', path: '/quotes',      icon: FileText        },
  { key: 'maintenance', label: 'Mantenimiento',path: '/maintenance', icon: Wrench          },
  { key: 'workorders',  label: 'OT',           path: '/workorders',  icon: ClipboardList   },
  { key: 'reports',     label: 'Rentabilidad', path: '/reports',     icon: BarChart2       },
  { key: 'profile',     label: 'Empresa',      path: '/profile',     icon: Settings        },
]

export default function NavHeader({ active, onLogout }: { active: string; onLogout: () => void }) {
  const navigate = useNavigate()
  const company = useAuthStore((s) => s.company)

  return (
    <aside style={{ width: 224, minHeight: '100vh', background: 'var(--clr-sidebar)', borderRight: '1px solid var(--clr-border)', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, zIndex: 30 }}>

      {/* Logo */}
      <div style={{ padding: 20, borderBottom: '1px solid var(--clr-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--clr-primary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Truck size={16} style={{ color: 'var(--clr-on-primary)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)', margin: 0, lineHeight: 1.2 }}>FlotaTrack</h1>
            <p style={{ fontSize: 11, color: 'var(--clr-text-subtle)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company?.name}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                background: isActive ? 'rgba(37,99,235,0.2)' : 'transparent',
                color: isActive ? '#60a5fa' : '#94a3b8',
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--clr-surface-hover)'; e.currentTarget.style.color = 'var(--clr-text)' } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(37,99,235,0.2)' : 'transparent'; e.currentTarget.style.color = isActive ? '#60a5fa' : '#94a3b8' }}
            >
              <Icon size={15} style={{ flexShrink: 0 }} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: 10, borderTop: '1px solid var(--clr-border)' }}>
        <button
          onClick={onLogout}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--clr-text-subtle)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)'; e.currentTarget.style.color = 'var(--clr-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
        >
          <LogOut size={15} style={{ flexShrink: 0 }} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

