import { useState, useRef, useEffect, useMemo } from 'react'
import logoIcon from '../assets/logo-icon.svg'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useSearchStore } from '../store/search.store'
import { useCompany, useEquipment, useClients, useWorkOrders, useOperators, usePaymentsAll, type Client } from '../hooks/useFlota'
import { useDashboard } from '../hooks/useInvoices'
import { useQuotes } from '../hooks/useQuotes'
import {
  LayoutDashboard, Truck, Users, ClipboardList, LogOut, Building2,
  History, Settings, Receipt, FileText, Wrench, BarChart2,
  ChevronLeft, ChevronRight, Bell, Search, Clock, Palette, Globe,
} from 'lucide-react'
import { AppearancePanel } from './AppearancePanel'
import { useMenuStore } from '../store/menu.store'

type NavItem = { key: string; label: string; path: string; icon: typeof LayoutDashboard; section?: string }

const SEARCH_CTX: Record<string, { placeholder: string; types: string[] }> = {
  equipment:   { placeholder: 'Buscar equipo…',                  types: ['Equipo'] },
  maintenance: { placeholder: 'Buscar equipo en mantenimiento…', types: ['Equipo'] },
  operators:   { placeholder: 'Buscar operario…',                types: ['Operario'] },
  workorders:  { placeholder: 'Buscar OT, cliente, equipo…',     types: ['OT'] },
  clients:     { placeholder: 'Buscar cliente…',                 types: ['Cliente'] },
  cxc:         { placeholder: 'Buscar cliente, factura…',        types: ['Cliente'] },
  aging:       { placeholder: 'Buscar cliente…',                 types: ['Cliente'] },
  payments:    { placeholder: 'Buscar pago, cliente, factura…',  types: ['Pago'] },
  quotes:      { placeholder: 'Buscar cotización, cliente…',     types: ['Cliente', 'OT'] },
}
const DEFAULT_CTX = { placeholder: 'Buscar equipo, cliente, OT…', types: ['Equipo', 'Cliente', 'OT'] }

const PAYMENT_METHOD: Record<string, string> = {
  TRANSFER: 'Transferencia', DEPOSIT: 'Depósito', CHECK: 'Cheque', CASH: 'Efectivo',
}

type ResultType = 'Equipo' | 'Cliente' | 'OT' | 'Pago' | 'Operario'
const TYPE_COLOR: Record<ResultType, { bg: string; color: string }> = {
  Equipo:   { bg: 'var(--clr-primary-bg)',  color: 'var(--clr-primary)' },
  Cliente:  { bg: 'var(--clr-success-bg)',  color: 'var(--clr-success)' },
  OT:       { bg: 'rgba(217,119,6,0.15)',   color: '#d97706' },
  Pago:     { bg: 'var(--clr-violet-bg)',   color: 'var(--clr-violet)' },
  Operario: { bg: 'var(--clr-orange-bg)',   color: 'var(--clr-orange)' },
}

const NAV: NavItem[] = [
  { key: 'dashboard',   label: 'Dashboard',           path: '/dashboard',   icon: LayoutDashboard, section: 'GENERAL' },
  { key: 'equipment',   label: 'Equipos',              path: '/equipment',   icon: Truck,           section: 'OPERACIONES' },
  { key: 'quotes',      label: 'Cotizaciones',         path: '/quotes',      icon: FileText,        section: 'OPERACIONES' },
  { key: 'operators',   label: 'Operarios',            path: '/operators',   icon: Users,           section: 'OPERACIONES' },
  { key: 'maintenance', label: 'Mantenimiento',        path: '/maintenance', icon: Wrench,          section: 'OPERACIONES' },
  { key: 'workorders',  label: 'Órdenes de Trabajo',   path: '/workorders',  icon: ClipboardList,   section: 'OPERACIONES' },
  { key: 'clients',     label: 'Clientes',             path: '/clients',     icon: Building2,       section: 'COMERCIAL' },
  { key: 'cxc',         label: 'Cobranza',             path: '/cxc',         icon: Receipt,         section: 'COMERCIAL' },
  { key: 'aging',       label: 'Antigüedad CxC',       path: '/aging',       icon: Clock,           section: 'COMERCIAL' },
  { key: 'payments',    label: 'Pagos',                path: '/payments',    icon: History,         section: 'COMERCIAL' },
  { key: 'reports',     label: 'Reportes',             path: '/reports',     icon: BarChart2,       section: 'ANÁLISIS' },
  { key: 'sunat',       label: 'SUNAT / SIRE',         path: '/sunat',       icon: Globe,           section: 'SISTEMA' },
  { key: 'profile',     label: 'Empresa',              path: '/profile',     icon: Settings,        section: 'SISTEMA' },
]

const SECTIONS = ['GENERAL', 'OPERACIONES', 'COMERCIAL', 'ANÁLISIS', 'SISTEMA']

function fmtDate() {
  return new Date().toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

interface AppShellProps {
  active: string
  title?: string
  children: React.ReactNode
}

export default function AppShell({ active, title, children }: AppShellProps) {
  const [collapsed, setCollapsed]     = useState(() => {
    try { return localStorage.getItem('ft-sidebar-collapsed') === '1' } catch { return false }
  })
  const [query, setQuery]             = useState('')
  const [searchOpen, setSearchOpen]   = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const menuSectionOrder = useMenuStore((s) => s.sectionOrder)
  const menuHidden       = useMenuStore((s) => s.hidden)
  const searchRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const setPageSearch = useSearchStore((s) => s.setQuery)
  const clearPageSearch = useSearchStore((s) => s.clear)
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const { data: company } = useCompany()
  const { data: equipment = [] } = useEquipment()
  const { data: clients = [] }   = useClients() as { data: Client[] }
  const { data: workOrders = [] } = useWorkOrders()
  const { data: operators = [] } = useOperators()
  const { data: allPayments }    = usePaymentsAll()
  const { data: dashboard } = useDashboard()
  const { data: quotesSent = [] } = useQuotes('SENT')

  const searchCtx = SEARCH_CTX[active] ?? DEFAULT_CTX
  const dateStr = useMemo(() => fmtDate(), [])

  // Clear page-level search filter when the user navigates away from a module
  useEffect(() => { clearPageSearch() }, [active])

  // Close search on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const types = searchCtx.types
    const results: { type: string; label: string; sub: string; path: string }[] = []

    // When we're in a module with explicit search context, results stay in that module.
    // For DEFAULT_CTX modules (dashboard, reports, etc.) fall back to each type's home.
    const inExplicitModule = active in SEARCH_CTX
    const modulePath = `/${active}`

    if (types.includes('Equipo')) {
      equipment.forEach((e) => {
        if (e.name.toLowerCase().includes(q) || (e.serialNumber ?? '').toLowerCase().includes(q) || (e.brand ?? '').toLowerCase().includes(q)) {
          results.push({ type: 'Equipo', label: e.name, sub: `${e.brand ?? ''} · ${e.status}`, path: inExplicitModule ? modulePath : '/equipment' })
        }
      })
    }
    if (types.includes('Cliente')) {
      clients.forEach((c) => {
        if ((c.businessName ?? '').toLowerCase().includes(q) || (c.ruc ?? '').toLowerCase().includes(q) || (c.contactName ?? '').toLowerCase().includes(q)) {
          results.push({ type: 'Cliente', label: c.businessName, sub: `RUC: ${c.ruc ?? '—'}`, path: inExplicitModule ? modulePath : '/clients' })
        }
      })
    }
    if (types.includes('OT')) {
      workOrders.forEach((w) => {
        if (w.number.toLowerCase().includes(q) || w.client?.businessName.toLowerCase().includes(q) || w.equipment?.name.toLowerCase().includes(q)) {
          results.push({ type: 'OT', label: `OT ${w.number}`, sub: `${w.client?.businessName} · ${w.status}`, path: inExplicitModule ? modulePath : '/workorders' })
        }
      })
    }
    if (types.includes('Pago')) {
      ;(allPayments?.items ?? []).forEach((p) => {
        const inv = `${p.invoice.series}-${p.invoice.number}`
        if (
          p.invoice.client.businessName.toLowerCase().includes(q) ||
          inv.toLowerCase().includes(q) ||
          (p.reference ?? '').toLowerCase().includes(q)
        ) {
          results.push({ type: 'Pago', label: p.invoice.client.businessName, sub: `${inv} · ${PAYMENT_METHOD[p.method] ?? p.method}`, path: inExplicitModule ? modulePath : '/payments' })
        }
      })
    }
    if (types.includes('Operario')) {
      operators.forEach((o) => {
        if (o.name.toLowerCase().includes(q) || (o.dni ?? '').includes(q) || (o.licenseNumber ?? '').toLowerCase().includes(q)) {
          results.push({ type: 'Operario', label: o.name, sub: `DNI: ${o.dni ?? '—'}`, path: inExplicitModule ? modulePath : '/operators' })
        }
      })
    }
    return results.slice(0, 8)
  }, [query, searchCtx, active, equipment, clients, workOrders, allPayments, operators])

  const location    = useLocation()
  const currentNav  = NAV.find((n) => n.key === active)
  const pageTitle   = title ?? currentNav?.label ?? 'FlotaTrack'
  // Show parent nav as a link when we're on a sub-page (path differs from nav root)
  const isSubPage   = !!(currentNav && location.pathname !== currentNav.path)

  const initials = (user as any)?.name
    ? (user as any).name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : 'U'

  const badges = useMemo<Record<string, number>>(() => ({
    maintenance: equipment.filter((e) => e.status === 'MAINTENANCE').length,
    cxc: dashboard?.overdue.count ?? 0,
    quotes: quotesSent.length,
  }), [equipment, dashboard, quotesSent])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--clr-bg)', color: 'var(--clr-text)' }}>

      {/* ── SIDEBAR ── */}
      <aside
        className="flex flex-col flex-shrink-0 border-r transition-all duration-200"
        style={{
          width: collapsed ? 56 : 220,
          background: 'var(--clr-sidebar)',
          borderColor: 'var(--clr-border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--clr-border)' }}>
          <img
            src={company?.logoUrl || logoIcon}
            alt={company?.name ?? 'FlotaTrack'}
            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 6, objectFit: 'contain', background: company?.logoUrl ? 'transparent' : undefined }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = logoIcon }}
          />
          {!collapsed && (
            <div className="overflow-hidden flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="font-bold text-sm leading-tight" style={{ color: 'var(--clr-text)' }}>FlotaTrack</div>
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.04em', padding: '1px 4px', borderRadius: 3, background: 'var(--clr-primary-bg)', color: 'var(--clr-primary-lt)', border: '1px solid var(--clr-primary-border)', lineHeight: 1.5, flexShrink: 0 }}>PERÚ</span>
              </div>
              <div className="text-xs truncate" style={{ color: 'var(--clr-text-subtle)' }}>{company?.name ?? '...'}</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => {
              const next = !c
              try { localStorage.setItem('ft-sidebar-collapsed', next ? '1' : '0') } catch {}
              return next
            })}
            className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors"
            style={{ color: 'var(--clr-text-subtle)', marginLeft: collapsed ? 'auto' : undefined }}
            onMouseEnter={(e) => { (e.target as HTMLElement).closest('button')!.style.background = 'var(--clr-surface-hover)' }}
            onMouseLeave={(e) => { (e.target as HTMLElement).closest('button')!.style.background = 'transparent' }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2" style={{ scrollbarWidth: 'none' }}>
          {SECTIONS.map((section) => {
            const allSection = NAV.filter((n) => n.section === section)
            const saved = menuSectionOrder[section]
            // Merge saved order with any new items not yet in the saved list
            const order = saved
              ? [...saved, ...allSection.map((n) => n.key).filter((k) => !saved.includes(k))]
              : allSection.map((n) => n.key)
            const items = order
              .map((k) => allSection.find((n) => n.key === k))
              .filter((n): n is NavItem => n != null && !menuHidden.includes(n.key))
            if (!items.length) return null
            return (
              <div key={section} className="mb-1">
                {!collapsed && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--clr-text-subtle)' }}>
                    {section}
                  </div>
                )}
                {items.map((item) => {
                  const Icon = item.icon
                  const isActive = active === item.key
                  const badge = badges[item.key] ?? 0
                  return (
                    <button
                      key={item.key}
                      title={collapsed ? item.label : undefined}
                      onClick={() => navigate(item.path)}
                      className="w-full flex items-center gap-2.5 text-sm font-medium transition-all relative"
                      style={{
                        padding: collapsed ? '9px 0' : '9px 12px',
                        justifyContent: collapsed ? 'center' : undefined,
                        color: isActive ? 'var(--clr-primary)' : 'var(--clr-text-subtle)',
                        background: isActive ? 'var(--clr-primary-bg)' : 'transparent',
                        borderRadius: 8,
                        margin: '1px 8px',
                        width: collapsed ? 40 : 'calc(100% - 16px)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--clr-surface)'
                          e.currentTarget.style.color = 'var(--clr-text)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isActive ? 'var(--clr-primary-bg)' : 'transparent'
                        e.currentTarget.style.color = isActive ? 'var(--clr-primary)' : 'var(--clr-text-subtle)'
                      }}
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r"
                          style={{ background: 'var(--clr-primary)' }}
                        />
                      )}
                      <Icon size={16} className="flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left">{item.label}</span>
                          {badge > 0 && (
                            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--clr-danger)', color: 'white', lineHeight: 1 }}>
                              {badge}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && badge > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: 'var(--clr-danger)' }} />
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* User footer */}
        <div className="flex-shrink-0 border-t p-2" style={{ borderColor: 'var(--clr-border)' }}>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="w-full flex items-center gap-2.5 rounded-lg transition-colors"
            style={{
              padding: collapsed ? '8px 0' : '8px 10px',
              justifyContent: collapsed ? 'center' : undefined,
              color: 'var(--clr-text-subtle)',
            }}
            title={collapsed ? 'Cerrar sesión' : undefined}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--clr-surface)'
              e.currentTarget.style.color = 'var(--clr-text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--clr-text-subtle)'
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--clr-primary-dk)', color: 'var(--clr-on-primary)' }}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--clr-text)' }}>
                  {(user as any)?.name ?? 'Usuario'}
                </div>
                <div className="text-[10px] truncate" style={{ color: 'var(--clr-text-subtle)' }}>Administrador</div>
              </div>
            )}
            {!collapsed && <LogOut size={13} />}
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header
          className="flex-shrink-0 flex items-center gap-4 px-6"
          style={{ height: 52, background: 'var(--clr-sidebar)', borderBottom: '1px solid var(--clr-border)' }}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--clr-text-subtle)' }}>
            <span style={{ color: 'var(--clr-text-muted)' }}>FlotaTrack</span>
            {isSubPage && currentNav && (
              <>
                <ChevronRight size={12} />
                <button
                  onClick={() => navigate(currentNav.path)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--clr-primary)', fontSize: 'inherit',
                    fontWeight: 500, padding: 0, lineHeight: 'inherit',
                    textDecoration: 'none', transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  {currentNav.label}
                </button>
              </>
            )}
            <ChevronRight size={12} />
            <span style={{ color: 'var(--clr-text)', fontWeight: 500 }}>{pageTitle}</span>
          </div>

          {/* Global Search */}
          <div ref={searchRef} style={{ position: 'relative', marginLeft: 16 }}>
            <div
              className="flex items-center gap-2 rounded-md px-3 py-1.5"
              style={{ background: 'var(--clr-surface)', border: `1px solid ${searchOpen ? 'var(--clr-primary)' : 'var(--clr-border)'}`, transition: 'border-color 0.15s' }}
            >
              <Search size={13} style={{ color: 'var(--clr-text-subtle)' }} />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)}
                placeholder={searchCtx.placeholder}
                className="bg-transparent outline-none text-xs w-48"
                style={{ color: 'var(--clr-text)' }}
              />
              {query && (
                <button onClick={() => { setQuery(''); setSearchOpen(false) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>

            {searchOpen && query.length >= 2 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100, minWidth: 320,
                background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
              }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--clr-text-subtle)', textAlign: 'center' }}>
                    Sin resultados para "{query}"
                  </div>
                ) : (
                  <>
                    {searchResults.map((r, i) => {
                      const isCurrentModule = r.path === '/' + active
                      return (
                        <button key={i}
                          onClick={() => {
                            if (isCurrentModule) {
                              // Ya estamos en este módulo: filtrar en la página actual
                              setPageSearch(query)
                            } else {
                              // Ir al módulo y pre-cargar el filtro
                              setPageSearch(query)
                              navigate(r.path)
                            }
                            setQuery(''); setSearchOpen(false)
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                            padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                            borderBottom: i < searchResults.length - 1 ? '1px solid var(--clr-border)' : 'none',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                            background: (TYPE_COLOR[r.type as ResultType] ?? TYPE_COLOR['Cliente']).bg,
                            color:      (TYPE_COLOR[r.type as ResultType] ?? TYPE_COLOR['Cliente']).color,
                          }}>{r.type.toUpperCase()}</span>
                          <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{r.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{r.sub}</div>
                          </div>
                          {isCurrentModule && (
                            <span style={{ fontSize: 9, color: 'var(--clr-primary-lt)', background: 'var(--clr-primary-bg)', border: '1px solid var(--clr-primary-border)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                              filtrar aquí
                            </span>
                          )}
                        </button>
                      )
                    })}
                    <div style={{ padding: '6px 14px 8px', fontSize: 10, color: 'var(--clr-text-subtle)', borderTop: '1px solid var(--clr-border)' }}>
                      {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Bell */}
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative"
              style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
            >
              <Bell size={15} />
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--clr-danger)' }}
              />
            </button>

            {/* Appearance */}
            <button
              onClick={() => setAppearanceOpen(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              title="Apariencia"
              style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-primary)'; e.currentTarget.style.borderColor = 'var(--clr-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-muted)'; e.currentTarget.style.borderColor = 'var(--clr-border)' }}
            >
              <Palette size={15} />
            </button>

            {/* Date */}
            <div className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)' }}>
              {dateStr}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--clr-border) transparent' }}>
          {children}
        </main>

        {/* Footer */}
        <footer style={{ borderTop: '1px solid var(--clr-border)', padding: '10px 24px', backgroundColor: 'var(--clr-sidebar)', fontSize: 11, color: 'var(--clr-text-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span>FlotaTrack Enterprise v2.4 · Sistema de Gestión de Maquinaria y Cuentas por Cobrar</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>SUNAT e-Facturación SPOT 12%</span>
            <span>·</span>
            <span>Tipo de Cambio Ref.: S/ 3.75 PEN/USD</span>
            <span>·</span>
            <span>Patio Principal: Lurín Km 34.5, Lima</span>
          </div>
        </footer>
      </div>

      <AppearancePanel open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
    </div>
  )
}
