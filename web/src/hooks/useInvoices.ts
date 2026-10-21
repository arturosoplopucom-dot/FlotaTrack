import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Invalida todas las queries afectadas cuando se registra o elimina un pago.
// Llámala desde cualquier lugar donde cambie el estado de cobro.
export function invalidatePaymentQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['invoices'] })       // listas + dashboard (prefix match)
  qc.invalidateQueries({ queryKey: ['invoice'] })        // detalle individual
  qc.invalidateQueries({ queryKey: ['payments-history'] })
  qc.invalidateQueries({ queryKey: ['payments-all'] })
  qc.invalidateQueries({ queryKey: ['analytics'] })
  qc.invalidateQueries({ queryKey: ['profitability'] })
  qc.invalidateQueries({ queryKey: ['report-invoices'] })
  qc.invalidateQueries({ queryKey: ['report-payments'] })
  qc.invalidateQueries({ queryKey: ['report-clients'] })
}

export type InvoiceWorkOrder = {
  id: string
  number: string
  location?: string
  description?: string
  startDate: string
  endDate?: string
  subtotal: string
  status: string
  equipment: { name: string; type: string }
  operator:  { name: string }
}

export type InvoiceCuota = {
  id: string
  number: number
  dueDate: string
  amount: string
  status: 'PENDING' | 'PAID' | 'OVERDUE'
  paidAt?: string
}

export type Invoice = {
  id: string
  clientId?: string
  number: string
  series: string
  description?: string
  amount: string
  igv: string
  total: string
  detraccion: string
  issueDate: string
  dueDate: string
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'
  currency: 'PEN' | 'USD'
  totalUsd?: string | null   // monto original en USD (cuando currency=USD y se enriqueció desde XML)
  tcambio?: string | null    // tipo de cambio PEN/USD aplicado por SUNAT
  daysUntilDue: number
  urgency: 'overdue' | 'critical' | 'warning' | 'ok'
  client: { businessName: string; ruc: string; whatsapp?: string; email?: string }
  cuotas: InvoiceCuota[]
  workOrders: InvoiceWorkOrder[]
}

export type Dashboard = {
  overdue: { amount: number; amountUsd: number; count: number }
  dueSoon: { amount: number; amountUsd: number; count: number }
  current: { amount: number; amountUsd: number; count: number }
  paid:    { amount: number; amountUsd: number; count: number }
  totalPending:    number
  totalPendingUsd: number
}

export const useDashboard = () =>
  useQuery<Dashboard>({
    queryKey: ['invoices', 'dashboard'],
    queryFn: () => api.get('/invoices/dashboard').then((r) => r.data),
    refetchInterval: 60_000,
  })

export const useInvoices = (filters?: Record<string, string>) =>
  useQuery<{ items: Invoice[]; total: number; totalPages: number }>({
    queryKey: ['invoices', filters],
    queryFn: () => api.get('/invoices', { params: filters }).then((r) => r.data),
  })

export const useCreateInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.post('/invoices', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export const useRegisterPayment = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.post(`/invoices/${id}/payments`, data).then((r) => r.data),
    onSuccess: () => invalidatePaymentQueries(qc),
  })
}

export const useUpdateInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.patch(`/invoices/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice'] })
    },
  })
}
