import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronDown, X, CheckCircle } from 'lucide-react'

export interface SearchItem { id: string; primary: string; secondary?: string; badge?: string }
interface DropRect { top: number; left: number; width: number }

export function SearchableDropdown({
  label, required, placeholder, items, value, onChange, icon: Icon,
}: {
  label?: string
  required?: boolean
  placeholder: string
  items: SearchItem[]
  value: string
  onChange: (id: string, item: SearchItem) => void
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const [rect, setRect]     = useState<DropRect>({ top: 0, left: 0, width: 0 })
  const triggerRef          = useRef<HTMLButtonElement>(null)
  const dropdownRef         = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLInputElement>(null)

  const selected = items.find(i => i.id === value)
  const filtered = items.filter(i =>
    !search ||
    (i.primary ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.secondary ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const close = useCallback(() => { setOpen(false); setSearch('') }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [open])

  const handleOpen = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width })
    setOpen(true); setSearch('')
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  const handleSelect = (item: SearchItem) => { onChange(item.id, item); close() }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('', { id: '', primary: '' })
  }

  const dropdown = open && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 9999,
        background: 'var(--clr-surface)', border: '1px solid var(--clr-primary)', borderRadius: 10,
        boxShadow: '0 16px 40px rgba(0,0,0,0.12)', overflow: 'hidden',
      }}
    >
      {/* Search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--clr-border)' }}>
        <Search size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Buscar ${(label ?? '').toLowerCase()}...`}
          style={{ flex: 1, background: 'transparent', color: 'var(--clr-text)', fontSize: 13, outline: 'none', border: 'none' }}
        />
        {search
          ? (
            <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}>
              <X size={12} />
            </button>
          ) : (
            <ChevronDown size={12} style={{ color: 'var(--clr-text-subtle)', transform: 'rotate(180deg)' }} />
          )
        }
      </div>

      {/* Items */}
      <div style={{ maxHeight: 208, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: 'var(--clr-text-subtle)' }}>
            Sin resultados para "{search}"
          </div>
        ) : (
          filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                background: item.id === value ? 'rgba(37,99,235,0.2)' : 'transparent',
                border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--clr-border)',
              }}
              onMouseEnter={(e) => { if (item.id !== value) e.currentTarget.style.background = 'var(--clr-surface-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = item.id === value ? 'rgba(37,99,235,0.2)' : 'transparent' }}
            >
              {Icon && <Icon size={13} style={{ color: 'var(--clr-text-subtle)', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--clr-text)', fontWeight: 500 }}>{item.primary}</div>
                {item.secondary && <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>{item.secondary}</div>}
              </div>
              {item.badge && (
                <span style={{ fontSize: 11, background: 'var(--clr-surface-hover)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                  {item.badge}
                </span>
              )}
              {item.id === value && <CheckCircle size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  )

  const borderColor = open ? '#2563eb' : value ? 'var(--clr-primary)' : 'var(--clr-border)'

  return (
    <div style={{ minWidth: 0 }}>
      {label && (
        <label style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 4, display: 'block' }}>
          {label}{required && <span style={{ color: 'var(--clr-danger)', marginLeft: 2 }}>*</span>}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? close : handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--clr-surface)', border: `1px solid ${borderColor}`,
          borderRadius: 8, padding: '8px 10px', fontSize: 13, textAlign: 'left',
          cursor: 'pointer', boxShadow: open ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = 'var(--clr-text-subtle)' }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = borderColor }}
      >
        {Icon && <Icon size={14} style={{ color: 'var(--clr-text-subtle)', flexShrink: 0 }} />}
        {selected ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: 'var(--clr-text)', fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.primary}</span>
            {selected.secondary && <span style={{ color: 'var(--clr-text-subtle)', fontSize: 11, display: 'block' }}>{selected.secondary}</span>}
          </div>
        ) : (
          <span style={{ color: 'var(--clr-text-subtle)', flex: 1 }}>{placeholder}</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {selected && !open && (
            <span
              onClick={handleClear}
              style={{ padding: 2, borderRadius: 4, cursor: 'pointer', display: 'flex', color: 'var(--clr-text-subtle)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--clr-surface-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--clr-text)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--clr-text-subtle)' }}
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            style={{ color: 'var(--clr-text-subtle)', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>
      {dropdown}
    </div>
  )
}

