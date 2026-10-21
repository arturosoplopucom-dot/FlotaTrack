import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface ServiceReport {
  id: string
  number: string
  status: 'PENDING' | 'LIQUIDATED'
  reportDate: string
  startTime: string
  endTime: string
  totalHours: number
  travelKm: number | null
  workDescription: string | null
  location: string | null
  unitRate: number
  amount: number
  currency: 'PEN' | 'USD'
  client: { id: string; businessName: string; ruc: string }
  equipment: { id: string; name: string; type: string } | null
  operator: { id: string; name: string } | null
  quote: { id: string; number: string } | null
  workOrder: { id: string; number: string; status: string } | null
  createdAt: string
}

export interface CreateServiceReportDTO {
  clientId: string
  equipmentId?: string
  operatorId?: string
  quoteId?: string
  reportDate: string        // YYYY-MM-DD
  startTime: string         // HH:mm
  endTime: string           // HH:mm
  totalHours: number
  travelKm?: number
  workDescription?: string
  location?: string
  unitRate: number
  currency?: 'PEN' | 'USD'
}

export interface LiquidateDTO {
  reportIds: string[]
  location?: string
  notes?: string
}

const QK = {
  list: (filters?: object) => ['service-reports', filters] as const,
  one: (id: string) => ['service-reports', id] as const,
}

export function useServiceReports(filters?: {
  status?: string
  clientId?: string
  equipmentId?: string
  dateFrom?: string
  dateTo?: string
}) {
  return useQuery<ServiceReport[]>({
    queryKey: QK.list(filters),
    queryFn: () => api.get('/service-reports', { params: filters }).then(r => r.data),
  })
}

export function useServiceReport(id: string) {
  return useQuery<ServiceReport>({
    queryKey: QK.one(id),
    queryFn: () => api.get(`/service-reports/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateServiceReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateServiceReportDTO) => api.post('/service-reports', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-reports'] }),
  })
}

export function useUpdateServiceReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CreateServiceReportDTO> & { id: string }) =>
      api.put(`/service-reports/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-reports'] }),
  })
}

export function useDeleteServiceReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/service-reports/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-reports'] }),
  })
}

export function useLiquidateReports() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LiquidateDTO) => api.post('/service-reports/liquidate', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-reports'] })
      qc.invalidateQueries({ queryKey: ['workorders'] })
    },
  })
}

export function useUnliquidateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/service-reports/${id}/unliquidate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-reports'] }),
  })
}
