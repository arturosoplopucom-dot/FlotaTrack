import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { X, CheckCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useRegisterPayment, type Invoice, type InvoiceCuota } from '../hooks/useInvoices'

const fmt = (n: number | string) =>
  'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type InvoiceDetail = Invoice & {
  payments: { id: string; amount: string; method: string; reference?: string; paidAt: string; cuotaId?: string }[]
  cuotas: InvoiceCuota[]
}

type PaymentForm = {
  amount: string
  method: 'TRANSFER' | 'CASH' | 'CHECK' | 'DEPOSIT'
  reference: string
  paidAt: string
}

const METHOD_LABELS: Record<string, string> = {
  TRANSFER: 'Transfer.',
  CASH:     'Efectivo',
  CHECK:    'Cheque',
  DEPOSIT:  'Depósito',
}

const inpStyle: React.CSSProperties = {
  width: '100%', background: 'var(--clr-surface)', color: 'var(--clr-text)',
  border: '1px solid var(--clr-border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--clr-text-muted)', marginBottom: 6,
}

const STATUS_COLOR: Record<string, string> = {
  PAID:    'var(--clr-success)',
  PENDING: '#d97706',
  OVERDUE: 'var(--clr-danger)',
}
const STATUS_LABEL: Record<string, string> = {
  PAID:    'Pagada',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencida',
}

export function PaymentModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const [form, setForm] = useState<PaymentForm>({
    amount: '', method: 'TRANSFER', reference: '',
    paidAt: format(new Date(), 'yyyy-MM-dd'),
  })
  const [selectedCuotaId, setSelectedCuotaId] = useState<string | null>(null)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const registerPayment = useRegisterPayment()

  const { data: detail } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', invoice?.id],
    queryFn: () => api.get(`/invoices/${invoice!.id}`).then((r) => r.data),
    enabled: !!invoice,
  })

  if (!invoice) return null

  const hasCuotas     = (detail?.cuotas?.length ?? 0) > 0
  const pendingCuotas = (detail?.cuotas ?? []).filter(c => c.status !== 'PAID')
  const detraccion    = Number(invoice.detraccion ?? 0)
  const netTotal      = Number(invoice.total) - detraccion

  // Cuando hay cuotas: usar estado de cuotas para evitar que pagos libres distorsionen el saldo
  const paidCuotasTotal    = (detail?.cuotas ?? []).filter(c => c.status === 'PAID').reduce((s, c) => s + Number(c.amount), 0)
  const pendingCuotasTotal = pendingCuotas.reduce((s, c) => s + Number(c.amount), 0)
  const paymentsTotal      = detail ? detail.payments.reduce((s, p) => s + Number(p.amount), 0) : 0

  const totalPaid = hasCuotas ? paidCuotasTotal    : paymentsTotal
  const balance   = hasCuotas ? pendingCuotasTotal : (detail ? netTotal - paymentsTotal : netTotal)

  // Si hay cuotas y está seleccionada una, prellenar el monto con el de la cuota
  const selectedCuota = detail?.cuotas?.find(c => c.id === selectedCuotaId) ?? null
  const amountPlaceholder = selectedCuota
    ? Number(selectedCuota.amount).toFixed(2)
    : detail ? balance.toFixed(2) : '0.00'

  function handlePay() {
    const amount = parseFloat(form.amount || amountPlaceholder)
    if (!amount || amount <= 0) { setError('Ingresa un monto válido'); return }
    if (hasCuotas && !selectedCuotaId) { setError('Selecciona la cuota a pagar'); return }
    if (!hasCuotas && amount > balance + 0.01) {
      setError(`El monto supera el saldo (${fmt(balance)})`); return
    }
    if (selectedCuota && amount > Number(selectedCuota.amount) + 0.01) {
      setError(`El monto supera el valor de la cuota (${fmt(selectedCuota.amount)})`); return
    }
    setError('')

    registerPayment.mutate(
      {
        id: invoice.id,
        amount,
        method: form.method,
        reference: form.reference || undefined,
        paidAt: form.paidAt ? `${form.paidAt}T12:00:00` : undefined,
        cuotaId: selectedCuotaId ?? undefined,
      },
      {
        onSuccess: (res: any) => {
          setSuccess(
            res.status === 'PAID'
              ? '✅ Factura pagada al 100%'
              : `Pago registrado. Saldo restante: ${fmt(res.balance)}`
          )
          setTimeout(onClose, 1800)
        },
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Error al registrar pago')
        },
      }
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', padding: 16 }}>
      <div style={{ background: 'var(--clr-sidebar)', border: '1px solid var(--clr-border)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--clr-border)', position: 'sticky', top: 0, background: 'var(--clr-sidebar)', zIndex: 1 }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--clr-text)', fontSize: 15 }}>Registrar Pago</h3>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--clr-text-muted)', fontFamily: 'monospace' }}>
              {invoice.series}-{invoice.number} · {invoice.client.businessName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-text-subtle)', display: 'flex', padding: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-text-subtle)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Cuotas selector — solo si hay cuotas */}
        {hasCuotas && detail && (
          <div style={{ padding: '16px 20px 0' }}>
            <label style={labelStyle}>Cuotas de la factura</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.cuotas.map((c) => {
                const isPaid = c.status === 'PAID'
                const isSelected = selectedCuotaId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={isPaid}
                    onClick={() => {
                      setSelectedCuotaId(isSelected ? null : c.id)
                      if (!isSelected) setForm(f => ({ ...f, amount: Number(c.amount).toFixed(2) }))
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10, cursor: isPaid ? 'default' : 'pointer',
                      border: `1px solid ${isSelected ? '#3b82f6' : isPaid ? 'var(--clr-success-border)' : 'var(--clr-border)'}`,
                      background: isSelected ? 'rgba(37,99,235,0.12)' : isPaid ? 'rgba(74,222,128,0.04)' : 'var(--clr-surface)',
                      opacity: isPaid ? 0.7 : 1,
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {isPaid ? (
                        <CheckCircle size={16} color="var(--clr-success)" />
                      ) : (
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          border: `2px solid ${isSelected ? 'var(--clr-primary)' : 'var(--clr-text-subtle)'}`,
                          background: isSelected ? 'var(--clr-primary)' : 'transparent',
                          flexShrink: 0,
                        }} />
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isPaid ? 'var(--clr-success)' : 'var(--clr-text)' }}>
                          Cuota {c.number}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-subtle)', marginTop: 1 }}>
                          Vence: {format(parseISO(c.dueDate), "dd MMM yyyy", { locale: es })}
                          {c.paidAt && ` · Pagada: ${format(parseISO(c.paidAt), "dd MMM yyyy", { locale: es })}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: STATUS_COLOR[c.status] }}>
                        {fmt(c.amount)}
                      </div>
                      <div style={{ fontSize: 10, color: STATUS_COLOR[c.status], marginTop: 2 }}>
                        {STATUS_LABEL[c.status]}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Invoice summary */}
        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {!hasCuotas && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--clr-text-muted)' }}>Vencimiento</span>
                <span style={{ fontWeight: 600, color: invoice.urgency === 'overdue' ? 'var(--clr-danger)' : 'var(--clr-text)' }}>
                  {format(parseISO(invoice.dueDate), "dd 'de' MMMM yyyy", { locale: es })}
                  {invoice.daysUntilDue < 0 && (
                    <span style={{ color: 'var(--clr-danger)', fontSize: 11, marginLeft: 4 }}>
                      ({Math.abs(invoice.daysUntilDue)}d vencida)
                    </span>
                  )}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-text-muted)' }}>Total factura (SUNAT)</span>
              <span style={{ fontWeight: 700, color: 'var(--clr-text)' }}>{fmt(invoice.total)}</span>
            </div>
            {detraccion > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Detracción retenida</span>
                  <span style={{ color: 'var(--clr-orange)' }}>− {fmt(detraccion)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Monto neto a cobrar</span>
                  <span style={{ fontWeight: 600, color: 'var(--clr-success)' }}>{fmt(netTotal)}</span>
                </div>
              </>
            )}
            {detail && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>Ya cobrado</span>
                  <span style={{ color: 'var(--clr-success)' }}>{fmt(totalPaid)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--clr-border)', paddingTop: 8, marginTop: 2 }}>
                  <span style={{ fontWeight: 600, color: 'var(--clr-text)' }}>Saldo pendiente</span>
                  <span style={{ fontWeight: 700, color: '#d97706' }}>{fmt(balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Form */}
        {(!hasCuotas || selectedCuotaId) && (
          <div style={{ padding: '8px 20px 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>
                {selectedCuota ? `Monto cuota ${selectedCuota.number}` : 'Monto a cobrar'}
              </label>
              <input
                type="number" step="0.01" min="0.01"
                placeholder={amountPlaceholder}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                style={inpStyle}
              />
              {!hasCuotas && detail && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, amount: balance.toFixed(2) }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--clr-primary)', marginTop: 4, padding: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clr-primary-dk)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--clr-primary)' }}
                >
                  Usar saldo completo
                </button>
              )}
            </div>

            <div>
              <label style={labelStyle}>Método de pago</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {(['TRANSFER', 'CASH', 'CHECK', 'DEPOSIT'] as const).map((m) => (
                  <button
                    key={m} type="button"
                    onClick={() => setForm((f) => ({ ...f, method: m }))}
                    style={{
                      padding: '8px 4px', fontSize: 11, borderRadius: 8, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid',
                      background: form.method === m ? 'var(--clr-primary)' : 'var(--clr-border)',
                      borderColor: form.method === m ? '#3b82f6' : 'var(--clr-border)',
                      color: form.method === m ? 'white' : 'var(--clr-text-muted)',
                    }}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Referencia / N° operación</label>
              <input
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Opcional"
                style={inpStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Fecha de pago</label>
              <input
                type="date"
                value={form.paidAt}
                onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                style={inpStyle}
              />
            </div>
          </div>
        )}

        {hasCuotas && !selectedCuotaId && pendingCuotas.length > 0 && (
          <div style={{ margin: '8px 20px', padding: '10px 14px', background: 'var(--clr-primary-bg)', border: '1px solid var(--clr-primary-border)', borderRadius: 8, fontSize: 12, color: 'var(--clr-primary)' }}>
            Selecciona una cuota pendiente para registrar el pago
          </div>
        )}

        {error && (
          <div style={{ margin: '4px 20px', padding: '8px 12px', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: 8, fontSize: 12, color: 'var(--clr-danger)' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ margin: '4px 20px', padding: '8px 12px', background: 'var(--clr-success-bg)', border: '1px solid var(--clr-success-border)', borderRadius: 8, fontSize: 12, color: 'var(--clr-success)' }}>
            {success}
          </div>
        )}

        {/* Footer buttons */}
        <div style={{ padding: '12px 20px 20px', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '10px 0', fontSize: 13, background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)', borderRadius: 10, cursor: 'pointer', fontWeight: 500 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)'; e.currentTarget.style.color = 'var(--clr-text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--clr-surface-hover)'; e.currentTarget.style.color = 'var(--clr-text-muted)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handlePay}
            disabled={registerPayment.isPending || !!success || (hasCuotas && !selectedCuotaId)}
            style={{ flex: 1, padding: '10px 0', fontSize: 13, background: '#15803d', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, opacity: (registerPayment.isPending || !!success || (hasCuotas && !selectedCuotaId)) ? 0.5 : 1 }}
          >
            {registerPayment.isPending ? 'Registrando…' : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}


