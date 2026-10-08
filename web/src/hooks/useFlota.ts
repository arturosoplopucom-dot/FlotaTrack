import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type Equipment = {
  id: string
  name: string
  brand?: string
  model?: string
  serialNumber?: string
  type: 'CRANE' | 'PLATFORM' | 'FORKLIFT' | 'EXCAVATOR' | 'OTHER'
  capacity?: string
  hourlyRate: string
  dailyRate: string
  currency: 'PEN' | 'USD'
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'RETIRED'
  currentHours?: string
  odometerKm?: string | null
  maintenanceIntervalKm?: string | null
  nextMaintenanceKm?: string | null
  notes?: string
  active?: boolean
}

export type OdometerLog = {
  id: string
  equipmentId: string
  km: string
  notes?: string | null
  recordedAt: string
}

export type OdometerStats = {
  avgKmPerDay: number | null
  estimatedDate: string | null
  kmRemaining: number | null
}

export type OdometerData = {
  logs: OdometerLog[]
  stats: OdometerStats
  equipment: Equipment
}

export type Operator = {
  id: string
  name: string
  dni: string
  licenseNumber?: string
  licenseExpiry?: string
  phone?: string
  status: 'ACTIVE' | 'INACTIVE'
}

export type WorkOrderCost = {
  id: string
  category: 'FUEL' | 'TOLL' | 'ALLOWANCE' | 'MAINTENANCE' | 'OTHER'
  description?: string
  amount: string
}

export type WorkOrderStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'ACTIVE' | 'COMPLETED' | 'BILLED' | 'PAID' | 'CANCELLED'

export type WorkOrder = {
  id: string
  number: string
  clientId: string
  equipmentId: string
  operatorId: string
  location?: string
  description?: string
  startDate: string
  endDate?: string
  billingType: 'HOURLY' | 'DAILY' | 'FIXED'
  quantity: string
  unitRate: string
  subtotal: string
  status: WorkOrderStatus
  invoiceId?: string
  notes?: string
  client: { businessName: string; ruc: string; phone?: string; whatsapp?: string; email?: string }
  equipment: { name: string; type: string }
  operator: { name: string }
  costs: WorkOrderCost[]
  invoice?: { id: string; series: string; number: string; total: string; detraccion: string; status: string; dueDate?: string } | null
  quote?: { id: string; number: string } | null
}

export type AvailableInvoice = {
  id: string; series: string; number: string; total: string
  detraccion: string; issueDate: string; dueDate?: string; status: string
}

// ─── Equipment ────────────────────────────────────────────────────────────────

export const useEquipment = () =>
  useQuery<Equipment[]>({
    queryKey: ['equipment'],
    queryFn: () => api.get('/equipment').then((r) => r.data),
  })

export const useCreateEquipment = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Equipment>) => api.post('/equipment', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment'] }),
  })
}

export const useUpdateEquipment = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Equipment> & { id: string }) =>
      api.put(`/equipment/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment'] }),
  })
}

export const useOdometerData = (equipmentId: string | null) =>
  useQuery<OdometerData>({
    queryKey: ['odometer', equipmentId],
    queryFn: () => api.get(`/equipment/${equipmentId}/odometer`).then((r) => r.data),
    enabled: !!equipmentId,
  })

export const useRegisterOdometer = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, km, notes }: { id: string; km: number; notes?: string }) =>
      api.post(`/equipment/${id}/odometer`, { km, notes }).then((r) => r.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['equipment'] })
      qc.invalidateQueries({ queryKey: ['odometer', v.id] })
    },
  })
}

// ─── Operators ────────────────────────────────────────────────────────────────

export const useOperators = () =>
  useQuery<Operator[]>({
    queryKey: ['operators'],
    queryFn: () => api.get('/operators').then((r) => r.data),
  })

export const useCreateOperator = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Operator>) => api.post('/operators', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operators'] }),
  })
}

export const useUpdateOperator = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Operator> & { id: string }) =>
      api.put(`/operators/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operators'] }),
  })
}

// ─── WorkOrders ───────────────────────────────────────────────────────────────

export const useWorkOrders = (status?: string) =>
  useQuery<WorkOrder[]>({
    queryKey: ['workorders', status],
    queryFn: () => api.get('/workorders', { params: status ? { status } : {} }).then((r) => r.data),
  })

export const useCreateWorkOrder = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/workorders', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

export const useUpdateWorkOrder = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.put(`/workorders/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

export const useUpdateWorkOrderStatus = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/workorders/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

export const useLinkInvoice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, invoiceId }: { id: string; invoiceId: string }) =>
      api.patch(`/workorders/${id}/link-invoice`, { invoiceId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workorders'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export const useMarkSent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/workorders/${id}/send`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

export const useMarkAccepted = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/workorders/${id}/accept`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

export const useAddCost = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; category?: string; description?: string; amount: number }) =>
      api.post(`/workorders/${id}/costs`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

export const useDeleteCost = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ woId, costId }: { woId: string; costId: string }) =>
      api.delete(`/workorders/${woId}/costs/${costId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

export const useUpdateActualHours = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api.patch(`/workorders/${id}/hours`, { quantity }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workorders'] }),
  })
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export type Client = {
  id: string
  businessName: string
  ruc: string
  contactName?: string
  phone?: string
  whatsapp?: string
  email?: string
  address?: string
  creditDays: number
  detraccionPct: string
  active: boolean
}

export const useClients = () =>
  useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  })

export const useCreateClient = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Client, 'id' | 'active'>) =>
      api.post('/clients', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export const useUpdateClient = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Client> & { id: string }) =>
      api.put(`/clients/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export const useDeleteClient = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/clients/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export type CompanyProfile = {
  id: string
  name: string
  ruc: string
  phone?: string
  email?: string
  address?: string
  logoUrl?: string
  plan: string
}

export const useCompany = () =>
  useQuery<CompanyProfile>({
    queryKey: ['company'],
    queryFn: () => api.get('/company').then((r) => r.data),
    staleTime: 1000 * 60 * 10,
  })

export type AnalyticsData = {
  monthly: { mes: string; emitido: number; cobrado: number }[]
  porCliente: { name: string; pendiente: number }[]
}

export const useAnalytics = () =>
  useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => api.get('/invoices/analytics').then((r) => r.data),
  })

export type PaymentRecord = {
  id: string
  amount: string
  method: 'CASH' | 'TRANSFER' | 'CHECK' | 'DEPOSIT'
  reference?: string
  paidAt: string
  notes?: string
  invoice: { series: string; number: string; client: { businessName: string } }
}

export type PaymentsPage = {
  items: PaymentRecord[]
  total: number
  page: number
  totalPages: number
}

export const usePaymentsHistory = (page = 1) =>
  useQuery<PaymentsPage>({
    queryKey: ['payments-history', page],
    queryFn: () => api.get(`/invoices/payments?page=${page}&limit=50`).then((r) => r.data),
  })

export const usePaymentsAll = () =>
  useQuery<PaymentsPage>({
    queryKey: ['payments-all'],
    queryFn: () => api.get('/invoices/payments?page=1&limit=500').then((r) => r.data),
    staleTime: 2 * 60 * 1000,
  })

export type AvailabilityBlock = {
  type: 'OT' | 'MAINTENANCE'
  id: string
  label: string
  dateFrom: string
  dateTo: string
  clientName?: string
  status: string
}

export type EquipmentAvailability = {
  id: string
  name: string
  type: string
  status: string
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
  capacity?: string | null
  currentHours?: number | null
  odometerKm?: number | null
  blocks: AvailabilityBlock[]
}

export const useEquipmentAvailability = (dateFrom: string, dateTo: string) =>
  useQuery<EquipmentAvailability[]>({
    queryKey: ['equipment-availability', dateFrom, dateTo],
    queryFn: () =>
      api.get(`/equipment/availability?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.data),
    enabled: !!dateFrom && !!dateTo,
    staleTime: 60_000,
  })
