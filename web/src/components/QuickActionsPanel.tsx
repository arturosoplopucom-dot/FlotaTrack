import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useDashboard, useInvoices } from '../hooks/useInvoices'
import { useQuery } from '@tanstack/react-query'
import type { Invoice } from '../hooks/useInvoices'
import { PaymentModal } from './PaymentModal'
import { api } from '../lib/api'

const fmtD = (d: string) => format(parseISO(d), 'dd/MM/yyyy')
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente', PARTIAL: 'Parcial', OVERDUE: 'Vencida', PAID: 'Pagada',
}

const QuickActionsPanel: React.FC<{ layout?: 'dock' | 'sidebar' }> = ({ layout = 'sidebar' }) => {
  const navigate = useNavigate()
  const { data: dash } = useDashboard()
  const { data: invoicesData } = useInvoices()
  const invoices = Array.isArray(invoicesData?.items) ? invoicesData.items : []

  const [activeModal, setActiveModal] = useState<'none' | 'alerts' | 'select-invoice'>('none')
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedAlertClients, setSelectedAlertClients] = useState<Set<string>>(new Set())
  const [alertChannel, setAlertChannel] = useState<'email' | 'whatsapp' | 'both'>('email')
  const [sendingAlerts, setSendingAlerts] = useState(false)

  const overdueInvoices = invoices.filter((inv) => inv.status === 'OVERDUE')
  const overdueCount = dash?.overdue.count ?? overdueInvoices.length
  const overdueAmount = dash?.overdue.amount ?? 0

  // Aging data — source of truth for alert modal (all clients, real balances)
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: agingData } = useQuery<{ rows: { clientId: string; clientName: string; ruc: string; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number; count: number }[] }>({
    queryKey: ['invoices', 'aging', today],
    queryFn: () => api.get('/invoices/aging', { params: { asOf: today } }).then((r) => r.data),
    staleTime: 60_000,
  })

  const overdueByClient = useCallback(() => {
    if (agingData?.rows) {
      return agingData.rows
        .filter((r) => r.d1_30 + r.d31_60 + r.d61_90 + r.d90plus > 0)
        .map((r) => ({
          clientId: r.clientId,
          name: r.clientName,
          ruc: r.ruc,
          total: r.d1_30 + r.d31_60 + r.d61_90 + r.d90plus,
          count: r.count,
        }))
    }
    // Fallback to invoices list while aging loads
    const map = new Map<string, { clientId: string; name: string; ruc: string; total: number; count: number }>()
    for (const inv of overdueInvoices) {
      const key = inv.clientId ?? inv.client.ruc
      if (!map.has(key)) map.set(key, { clientId: key, name: inv.client.businessName, ruc: inv.client.ruc, total: 0, count: 0 })
      const entry = map.get(key)!
      entry.total += parseFloat(inv.total)
      entry.count++
    }
    return [...map.values()]
  }, [agingData, overdueInvoices])

  const fmt = (n: number) =>
    'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  const handleExportCSV = async () => {
    showToast('Preparando CSV…')
    let allInvoices: Invoice[] = invoices
    try {
      const res = await api.get('/invoices', { params: { limit: 9999 } })
      allInvoices = Array.isArray(res.data?.items) ? res.data.items : invoices
    } catch {
      // Si falla, usa las facturas ya cargadas
    }

    const today = new Date().toISOString().slice(0, 10)
    const headers = [
      'N° Factura', 'RUC', 'Cliente', 'Descripción',
      'Importe', 'IGV', 'Total', 'Moneda',
      'F. Emisión', 'F. Vencimiento', 'Estado',
    ]
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const dataRows = allInvoices.map((inv) => [
      `${inv.series}-${inv.number}`,
      inv.client.ruc,
      inv.client.businessName,
      inv.description ?? '',
      inv.amount,
      inv.igv,
      inv.total,
      inv.currency,
      fmtD(inv.issueDate),
      fmtD(inv.dueDate),
      STATUS_LABELS[inv.status] ?? inv.status,
    ])
    const csv = [headers, ...dataRows].map((r) => r.map(esc).join(';')).join('\r\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `FlotaTrack_CxC_${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`CSV exportado: ${allInvoices.length} facturas.`)
  }

  const handleSendAlerts = async (
    clients: Array<{ clientId: string; name: string; ruc: string; total: number; count: number; email?: string | null; whatsapp?: string | null }>
  ) => {
    const selected = clients.filter((c) => selectedAlertClients.has(c.clientId))
    if (selected.length === 0) return
    const mailClients = selected.filter((c) => c.email)
    const waClients   = selected.filter((c) => c.whatsapp)
    const canEmail = alertChannel !== 'whatsapp' && mailClients.length > 0
    const canWA    = alertChannel !== 'email'    && waClients.length > 0
    if (!canEmail && !canWA) return
    setSendingAlerts(true)
    try {
      if (canEmail) {
        await api.post('/invoices/alerts/run', { clientIds: mailClients.map((c) => c.clientId) })
      }
      if (canWA) {
        for (const c of waClients) {
          const num = (c.whatsapp ?? '').replace(/[^0-9]/g, '')
          const fullNum = num.startsWith('51') ? num : `51${num}`
          const msg = encodeURIComponent(
            `Estimados ${c.name},\n\nRegistra un saldo vencido de ${fmt(c.total)} con nuestra empresa.\n\nPor favor, comuníquese con nosotros para coordinar el pago. Gracias.`
          )
          window.open(`https://wa.me/${fullNum}?text=${msg}`, '_blank')
          await new Promise((res) => setTimeout(res, 600))
        }
      }
      const parts: string[] = []
      if (canEmail) parts.push(`✉ ${mailClients.length} email`)
      if (canWA)    parts.push(`📱 ${waClients.length} WhatsApp`)
      setActiveModal('none')
      showToast(`✅ Alertas enviadas — ${parts.join(' · ')}`)
    } catch {
      showToast('❌ Error al enviar alertas')
    } finally {
      setSendingAlerts(false)
    }
  }

  /* ── Base style for quick-action buttons (fully adaptive) ── */
  const btnBase: React.CSSProperties = {
    backgroundColor: 'var(--clr-surface-hover)',
    border: '1px solid var(--clr-border)',
    color: 'var(--clr-text)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  }

  const hoverEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'var(--clr-primary-bg)'
    e.currentTarget.style.borderColor = 'var(--clr-primary-border)'
    e.currentTarget.style.color = 'var(--clr-text)'
  }
  const hoverLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'var(--clr-surface-hover)'
    e.currentTarget.style.borderColor = 'var(--clr-border)'
    e.currentTarget.style.color = 'var(--clr-text)'
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          backgroundColor: 'var(--clr-success)', color: '#ffffff',
          padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>✓</span><span>{toast}</span>
        </div>
      )}

      {/* Panel */}
      <div style={{
        backgroundColor: 'var(--clr-surface)',
        border: '1px solid var(--clr-border)',
        borderRadius: 10,
        padding: layout === 'dock' ? '12px 16px' : '18px 14px',
        display: 'flex',
        flexDirection: layout === 'dock' ? 'row' : 'column',
        alignItems: layout === 'dock' ? 'center' : 'stretch',
        gap: 12,
        height: layout === 'dock' ? 'auto' : '100%',
        boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: layout === 'dock' ? 'none' : '1px solid var(--clr-border)',
          borderRight: layout === 'dock' ? '1px solid var(--clr-border)' : 'none',
          paddingBottom: layout === 'dock' ? 0 : 10,
          paddingRight: layout === 'dock' ? 16 : 0,
          flexShrink: 0,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--clr-primary)', flexShrink: 0 }} />
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)',
            letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            Acciones Rápidas
          </span>
        </div>

        {/* Buttons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: layout === 'dock' ? 'repeat(4, 1fr)' : '1fr',
          gap: 8, flex: 1,
        }}>
          {/* Registrar Pago */}
          <button
            onClick={() => setActiveModal('select-invoice')}
            style={btnBase}
            onMouseEnter={hoverEnter}
            onMouseLeave={hoverLeave}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>💳</span>
            <span>Registrar Pago</span>
          </button>

          {/* Nueva OT */}
          <button
            onClick={() => navigate('/workorders')}
            style={btnBase}
            onMouseEnter={hoverEnter}
            onMouseLeave={hoverLeave}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>🚜</span>
            <span>Nueva OT / Despacho</span>
          </button>

          {/* Alertas de Mora */}
          <button
            disabled={overdueCount === 0}
            onClick={() => {
              const clients = overdueByClient()
              setSelectedAlertClients(new Set(clients.map((c) => c.clientId)))
              setActiveModal('alerts')
            }}
            style={{
              ...btnBase,
              borderColor: overdueCount > 0 ? 'var(--clr-danger-border)' : 'var(--clr-border)',
              opacity: overdueCount === 0 ? 0.4 : 1,
              cursor: overdueCount === 0 ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (overdueCount === 0) return
              e.currentTarget.style.backgroundColor = 'var(--clr-danger-bg)'
              e.currentTarget.style.borderColor = 'var(--clr-danger-border)'
              e.currentTarget.style.color = 'var(--clr-text)'
            }}
            onMouseLeave={(e) => {
              if (overdueCount === 0) return
              e.currentTarget.style.backgroundColor = 'var(--clr-surface-hover)'
              e.currentTarget.style.borderColor = overdueCount > 0 ? 'var(--clr-danger-border)' : 'var(--clr-border)'
              e.currentTarget.style.color = 'var(--clr-text)'
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>📢</span>
            <span>
              Alertas de Mora
              {overdueCount > 0 && (
                <span style={{
                  marginLeft: 5,
                  backgroundColor: 'var(--clr-danger)',
                  color: '#fff',
                  borderRadius: 9999,
                  fontSize: 10,
                  padding: '1px 5px',
                  fontWeight: 700,
                }}>
                  {overdueCount}
                </span>
              )}
            </span>
          </button>

          {/* Exportar CSV */}
          <button
            onClick={handleExportCSV}
            style={{
              ...btnBase,
              backgroundColor: 'var(--clr-primary)',
              borderColor: 'var(--clr-primary)',
              color: 'var(--clr-on-primary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--clr-primary-dk)'
              e.currentTarget.style.borderColor = 'var(--clr-primary-dk)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--clr-primary)'
              e.currentTarget.style.borderColor = 'var(--clr-primary)'
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>⬇</span>
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* MODAL: ALERTAS DE MORA — selección por cliente con canal */}
      {activeModal === 'alerts' && (() => {
        const clients = overdueByClient()
        const allSelected = clients.length > 0 && clients.every((c) => selectedAlertClients.has(c.clientId))
        const selected = clients.filter((c) => selectedAlertClients.has(c.clientId))
        const nSelected = selected.length
        const selectedTotal = selected.reduce((s, c) => s + c.total, 0)
        const mailClients = selected.filter((c) => c.email)
        const waClients   = selected.filter((c) => c.whatsapp)
        const canEmail = alertChannel !== 'whatsapp' && mailClients.length > 0
        const canWA    = alertChannel !== 'email'    && waClients.length > 0
        const canSend  = nSelected > 0 && (canEmail || canWA)

        const ChTab = ({ ch, label }: { ch: 'email' | 'whatsapp' | 'both'; label: string }) => (
          <button onClick={() => setAlertChannel(ch)} style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: alertChannel === ch ? 'var(--clr-danger)' : 'transparent', color: alertChannel === ch ? '#fff' : 'var(--clr-text-subtle)', transition: 'all 0.15s' }}>
            {label}
          </button>
        )

        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }}
            onClick={() => { if (!sendingAlerts) setActiveModal('none') }}>
            <div style={{ backgroundColor: 'var(--clr-surface)', border: '1px solid var(--clr-danger-border)', borderRadius: 12, width: '100%', maxWidth: 540, boxShadow: '0 12px 32px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, color: 'var(--clr-text)', fontWeight: 700 }}>📢 Envío de Alertas de Mora</h3>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--clr-text-subtle)' }}>
                    {clients.length} clientes con saldo vencido
                  </p>
                </div>
                <button onClick={() => { if (!sendingAlerts) setActiveModal('none') }} style={{ background: 'none', border: 'none', color: 'var(--clr-text-subtle)', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>

              {/* Channel selector */}
              <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Canal de envío</div>
                <div style={{ display: 'flex', gap: 4, background: 'var(--clr-surface)', borderRadius: 8, padding: 4, border: '1px solid var(--clr-border)' }}>
                  <ChTab ch="email"    label="✉ Solo Email" />
                  <ChTab ch="whatsapp" label="📱 Solo WhatsApp" />
                  <ChTab ch="both"     label="✉ + 📱 Ambos" />
                </div>
                {alertChannel !== 'email' && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#d97706' }}>
                    📱 WhatsApp abrirá una pestaña por cliente (gratis, vía wa.me)
                  </p>
                )}
              </div>

              {/* Select all bar */}
              {clients.length > 0 && (
                <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => setSelectedAlertClients(allSelected ? new Set() : new Set(clients.map((c) => c.clientId)))}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-muted)', fontSize: 12, fontWeight: 600, padding: 0 }}
                  >
                    <span style={{ fontSize: 14 }}>{allSelected ? '☑' : '☐'}</span>
                    {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-subtle)' }}>
                    {nSelected} seleccionado{nSelected !== 1 ? 's' : ''} · {fmt(selectedTotal)}
                  </span>
                </div>
              )}

              {/* Client list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {clients.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--clr-success)', padding: '20px', textAlign: 'center' }}>✓ No hay facturas vencidas en este momento.</p>
                ) : clients.map((c) => {
                  const checked = selectedAlertClients.has(c.clientId)
                  const hasEmail = !!c.email
                  const hasWA    = !!c.whatsapp
                  return (
                    <div key={c.clientId}
                      onClick={() => { const n = new Set(selectedAlertClients); if (checked) n.delete(c.clientId); else n.add(c.clientId); setSelectedAlertClients(n) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: '1px solid var(--clr-border)', cursor: 'pointer', background: checked ? 'var(--clr-primary-bg)' : 'transparent', transition: 'background 0.1s' }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0, color: checked ? 'var(--clr-primary)' : 'var(--clr-text-subtle)' }}>{checked ? '☑' : '☐'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--clr-text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace' }}>{c.ruc}</span>
                          {hasEmail && <span title={c.email!}>✉</span>}
                          {hasWA    && <span title={c.whatsapp!}>📱</span>}
                          {checked && !hasEmail && alertChannel !== 'whatsapp' && <span style={{ color: '#d97706', fontSize: 10 }}>sin email</span>}
                          {checked && !hasWA    && alertChannel !== 'email'    && <span style={{ color: '#d97706', fontSize: 10 }}>sin WhatsApp</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--clr-danger)', fontSize: 13 }}>{fmt(c.total)}</div>
                        <div style={{ fontSize: 10, color: 'var(--clr-text-subtle)' }}>{c.count} fact.</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--clr-border)', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--clr-text-subtle)', lineHeight: 1.5 }}>
                  {canEmail && <div>✉ Email: {mailClients.length} cliente{mailClients.length !== 1 ? 's' : ''}</div>}
                  {canWA    && <div>📱 WhatsApp: {waClients.length} cliente{waClients.length !== 1 ? 's' : ''}</div>}
                  {nSelected > 0 && !canSend && <div style={{ color: '#d97706' }}>⚠ Sin canal disponible</div>}
                </div>
                <button type="button" onClick={() => setActiveModal('none')} disabled={sendingAlerts}
                  style={{ backgroundColor: 'transparent', border: '1px solid var(--clr-border)', color: 'var(--clr-text)', borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
                  Cancelar
                </button>
                {clients.length > 0 && (
                  <button type="button" onClick={() => handleSendAlerts(clients)} disabled={!canSend || sendingAlerts}
                    style={{ backgroundColor: !canSend ? 'rgba(185,28,28,0.4)' : 'var(--clr-danger)', border: 'none', color: '#fff', borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: !canSend ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {sendingAlerts ? '⏳ Enviando...' : `Despachar (${nSelected})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* MODAL: SELECCIÓN DE FACTURA PARA PAGO */}
      {activeModal === 'select-invoice' && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 999, padding: 16,
          }}
          onClick={() => setActiveModal('none')}
        >
          <div
            style={{
              backgroundColor: 'var(--clr-surface)',
              border: '1px solid var(--clr-border)',
              borderRadius: 10, width: '100%', maxWidth: 560,
              padding: 24, boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, borderBottom: '1px solid var(--clr-border)', paddingBottom: 12,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, color: 'var(--clr-text)', fontWeight: 700 }}>
                  Seleccionar factura a cobrar
                </h3>
                <span style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
                  {overdueInvoices.length > 0
                    ? `${overdueInvoices.length} factura${overdueInvoices.length !== 1 ? 's' : ''} vencida${overdueInvoices.length !== 1 ? 's' : ''}`
                    : 'Sin facturas vencidas'}
                </span>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                style={{ background: 'none', border: 'none', color: 'var(--clr-text-subtle)', fontSize: 16, cursor: 'pointer' }}
              >✕</button>
            </div>

            {overdueInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--clr-success)', fontSize: 13 }}>
                ✓ No hay facturas vencidas pendientes de cobro.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {overdueInvoices.map((inv) => {
                  const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)
                  const pending = parseFloat(inv.total) - (inv.payments?.reduce((s: number, p: { amount: string | number }) => s + parseFloat(String(p.amount)), 0) ?? 0)
                  return (
                    <button
                      key={inv.id}
                      onClick={() => { setActiveModal('none'); setPayInvoice(inv) }}
                      style={{
                        backgroundColor: 'var(--clr-surface)',
                        border: '1px solid var(--clr-border)',
                        borderRadius: 7, padding: '10px 14px',
                        cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between',
                        gap: 12, textAlign: 'left',
                        transition: 'border-color 0.15s, background-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--clr-success-border)'
                        e.currentTarget.style.backgroundColor = 'var(--clr-surface-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--clr-border)'
                        e.currentTarget.style.backgroundColor = 'var(--clr-surface)'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inv.client.businessName}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
                          {inv.series}-{inv.number} · Vencida hace{' '}
                          <span style={{ color: 'var(--clr-danger)', fontWeight: 700 }}>{days}d</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-danger)', fontVariantNumeric: 'tabular-nums' }}>
                          {inv.currency === 'PEN' ? 'S/' : '$'} {pending.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--clr-success)', fontWeight: 600, marginTop: 2 }}>→ Registrar cobro</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {overdueInvoices.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--clr-border)' }}>
                <button
                  onClick={() => { setActiveModal('none'); navigate('/aging') }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--clr-text-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Ver todas en Antigüedad de Saldos →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <PaymentModal key={payInvoice?.id ?? ''} invoice={payInvoice} onClose={() => setPayInvoice(null)} />
    </>
  )
}

export default QuickActionsPanel
