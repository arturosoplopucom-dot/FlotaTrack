import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export type ReportPeriod = '1m' | '3m' | '6m' | '1y' | 'all'

export interface ProfitabilityReport {
  period: ReportPeriod
  summary: {
    totalRevenue: number; totalCosts: number; grossMargin: number; marginPct: number
    totalInvoiced: number; totalCollected: number; pendingCollection: number
    completedOTs: number; activeOTs: number; draftOTs: number; totalMaintCost: number
  }
  byMonth:       { month: string; revenue: number; costs: number; margin: number }[]
  byCostCategory: { category: string; amount: number }[]
  byClient:       { name: string; revenue: number; costs: number; margin: number; marginPct: number; otCount: number }[]
  byEquipment:    { name: string; type: string; revenue: number; hours: number; otCount: number }[]
  topOTs:         { number: string; clientName: string; equipmentName: string; revenue: number; costs: number; margin: number; marginPct: number; startDate: string }[]
}

export interface EquipmentReportItem {
  id: string; name: string; brand: string | null; model: string | null
  type: string; status: string; capacity: string | null; currentHours: number
  otCount: number; revenue: number; maintCost: number; hours: number
}

export interface WorkOrderReportItem {
  id: string; number: string; clientName: string; clientRuc: string
  equipmentName: string; equipmentType: string; operatorName: string
  location: string | null; startDate: string; endDate: string | null
  billingType: string; quantity: number; unitRate: number; subtotal: number
  costs: number; margin: number; status: string
}

export interface InvoiceReportItem {
  id: string; series: string; number: string
  clientName: string; clientRuc: string
  issueDate: string; dueDate: string
  amount: number; igv: number; total: number; paid: number; balance: number
  currency: string; status: string
}

export interface QuoteReportItem {
  id: string; number: string; clientName: string; clientRuc: string
  equipmentName: string; issueDate: string; validUntil: string
  total: number; currency: string; status: string
}

export interface MaintenanceReportItem {
  id: string; equipmentName: string; equipmentType: string; planName: string
  performedAt: string; hoursAtService: number | null
  technician: string | null; description: string | null; cost: number
}

export interface ClientReportItem {
  id: string; businessName: string; ruc: string; phone: string | null; email: string | null
  otCount: number; invoiceCount: number; totalInvoiced: number; totalPaid: number
  pending: number; overdueCount: number; otRevenue: number
}

interface DateParams { dateFrom?: string; dateTo?: string }

export function useProfitability(period: ReportPeriod = '6m') {
  return useQuery<ProfitabilityReport>({
    queryKey: ['profitability', period],
    queryFn: () => api.get('/reports/profitability', { params: { period } }).then((r) => r.data),
  })
}

export function useEquipmentReport(params: { status?: string } & DateParams) {
  return useQuery<EquipmentReportItem[]>({
    queryKey: ['report-equipment', params],
    queryFn: () => api.get('/reports/equipment', { params }).then((r) => r.data),
  })
}

export function useWorkOrdersReport(params: { status?: string; clientId?: string; equipmentId?: string } & DateParams) {
  return useQuery<{ items: WorkOrderReportItem[]; summary: { total: number; totalRevenue: number; totalCosts: number; grossMargin: number; statusCounts: Record<string, number> } }>({
    queryKey: ['report-work-orders', params],
    queryFn: () => api.get('/reports/work-orders', { params }).then((r) => r.data),
  })
}

export function useInvoicesReport(params: { status?: string; clientId?: string } & DateParams) {
  return useQuery<{ items: InvoiceReportItem[]; summary: { total: number; totalInvoiced: number; totalPaid: number; totalPending: number; totalOverdue: number; statusCounts: Record<string, number> } }>({
    queryKey: ['report-invoices', params],
    queryFn: () => api.get('/reports/invoices', { params }).then((r) => r.data),
  })
}

export function useQuotesReport(params: { status?: string; clientId?: string } & DateParams) {
  return useQuery<{ items: QuoteReportItem[]; summary: { total: number; totalAmount: number; convertedAmount: number; conversionRate: number; statusCounts: Record<string, number> } }>({
    queryKey: ['report-quotes', params],
    queryFn: () => api.get('/reports/quotes', { params }).then((r) => r.data),
  })
}

export function useMaintenanceReport(params: { equipmentId?: string } & DateParams) {
  return useQuery<{
    items: MaintenanceReportItem[]
    upcomingPlans: { id: string; equipmentName: string; name: string; nextDueAt: string | null; nextDueHours: number | null; intervalType: string }[]
    summary: { total: number; totalCost: number }
  }>({
    queryKey: ['report-maintenance', params],
    queryFn: () => api.get('/reports/maintenance', { params }).then((r) => r.data),
  })
}

export function useClientsReport(params: DateParams) {
  return useQuery<ClientReportItem[]>({
    queryKey: ['report-clients', params],
    queryFn: () => api.get('/reports/clients', { params }).then((r) => r.data),
  })
}

export interface PaymentReportItem {
  id: string
  paidAt: string
  amount: number
  method: string
  reference?: string
  notes?: string
  invoiceSeries: string
  invoiceNumber: string
  invoiceTotal: number
  currency: string
  clientName: string
  clientRuc: string
}

export interface PaymentsReportData {
  items: PaymentReportItem[]
  summary: {
    total: number
    totalAmount: number
    avgAmount: number
    byMethod: Record<string, { count: number; amount: number }>
    monthly: Record<string, number>
  }
}

export function usePaymentsReport(params: { method?: string } & DateParams) {
  return useQuery<PaymentsReportData>({
    queryKey: ['report-payments', params],
    queryFn: () => api.get('/reports/payments', { params }).then((r) => r.data),
  })
}

export interface EquipmentProfitabilityItem {
  id: string; name: string; brand: string | null; model: string | null
  type: string; status: string; otCount: number
  revenue: number; opCosts: number; maintCost: number; totalCost: number
  margin: number; marginPct: number; hours: number
  costsByCategory: Record<string, number>
}

export interface EquipmentProfitabilityData {
  period: ReportPeriod
  items: EquipmentProfitabilityItem[]
  totals: {
    revenue: number; opCosts: number; maintCost: number; totalCost: number
    margin: number; marginPct: number; otCount: number; hours: number
  }
}

export function useEquipmentProfitability(params: { period?: ReportPeriod } & DateParams) {
  return useQuery<EquipmentProfitabilityData>({
    queryKey: ['report-equipment-profitability', params],
    queryFn: () => api.get('/reports/equipment-profitability', { params }).then((r) => r.data),
  })
}
