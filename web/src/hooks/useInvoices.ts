import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

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
  daysUntilDue: number
  urgency: 'overdue' | 'critical' | 'warning' | 'ok'
  client: { businessName: string; ruc: string; whatsapp?: string; email?: string }
  cuotas: InvoiceCuota[]
  workOrders: InvoiceWorkOrder[]
}

export type Dashboard = {
  overdue: { amount: number; count: number }
  dueSoon: { amount: number; count: number }
  current: { amount: number; count: number }
  paid: { amount: number; count: number }
  totalPending: number
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export const useUpdateInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.patch(`/invoices/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}
