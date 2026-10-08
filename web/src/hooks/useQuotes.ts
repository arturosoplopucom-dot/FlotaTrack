import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CONVERTED'

export interface QuoteItem {
  id: string
  description: string
  quantity: string
  unitPrice: string
  total: string
  order: number
}

export interface Quote {
  id: string
  number: string
  clientId: string
  equipmentId?: string | null
  status: QuoteStatus
  issueDate: string
  validUntil: string
  subtotal: string
  igv: string
  total: string
  currency: 'PEN' | 'USD'
  notes?: string | null
  rejectionNotes?: string | null
  convertedToWorkOrderId?: string | null
  createdAt: string
  client: { businessName: string; ruc: string; contactName?: string; phone?: string; whatsapp?: string; email?: string; address?: string }
  equipment?: { name: string; type: string; hourlyRate?: string; dailyRate?: string } | null
  items: QuoteItem[]
  workOrder?: { id: string; number: string } | null
}

export function useQuotes(status?: QuoteStatus) {
  return useQuery<Quote[]>({
    queryKey: ['quotes', status],
    queryFn: () => api.get('/quotes', { params: status ? { status } : {} }).then((r) => r.data),
  })
}

export function useQuote(id: string | null) {
  return useQuery<Quote>({
    queryKey: ['quote', id],
    queryFn: () => api.get(`/quotes/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      clientId: string; equipmentId?: string; validUntil: string
      currency?: string; notes?: string
      items: { description: string; quantity: number; unitPrice: number }[]
    }) => api.post('/quotes', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  })
}

export function useUpdateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.put(`/quotes/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  })
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, rejectionNotes, workOrderId }: { id: string; status: QuoteStatus; rejectionNotes?: string; workOrderId?: string }) =>
      api.patch(`/quotes/${id}/status`, { status, rejectionNotes, workOrderId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  })
}

export function useDeleteQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/quotes/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  })
}
