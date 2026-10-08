import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/auth.store'
import { ThemeProvider } from './components/ThemeProvider'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AgingReportPage from './pages/AgingReportPage'
import EquipmentPage from './pages/EquipmentPage'
import OperatorsPage from './pages/OperatorsPage'
import WorkOrdersPage from './pages/WorkOrdersPage'
import ClientsPage from './pages/ClientsPage'
import PaymentsHistoryPage from './pages/PaymentsHistoryPage'
import CompanyProfilePage from './pages/CompanyProfilePage'
import CxCPage from './pages/CxCPage'
import QuotesPage from './pages/QuotesPage'
import MaintenancePage from './pages/MaintenancePage'
import ReportsPage from './pages/ReportsPage'
import GerencialReportPage from './pages/GerencialReportPage'
import EquipmentReportPage from './pages/EquipmentReportPage'
import OTReportPage from './pages/OTReportPage'
import InvoicesReportPage from './pages/InvoicesReportPage'
import CxCReportPage from './pages/CxCReportPage'
import QuotesReportPage from './pages/QuotesReportPage'
import MaintenanceReportPage from './pages/MaintenanceReportPage'
import ClientsReportPage from './pages/ClientsReportPage'
import PaymentsReportPage from './pages/PaymentsReportPage'
import EquipmentProfitabilityPage from './pages/EquipmentProfitabilityPage'
import EquipmentAvailabilityPage from './pages/EquipmentAvailabilityPage'
import SunatSyncPage from './pages/SunatSyncPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/aging" element={<PrivateRoute><AgingReportPage /></PrivateRoute>} />
          <Route path="/clients" element={<PrivateRoute><ClientsPage /></PrivateRoute>} />
          <Route path="/payments" element={<PrivateRoute><PaymentsHistoryPage /></PrivateRoute>} />
          <Route path="/cxc"      element={<PrivateRoute><CxCPage /></PrivateRoute>} />
          <Route path="/profile"  element={<PrivateRoute><CompanyProfilePage /></PrivateRoute>} />
          <Route path="/equipment" element={<PrivateRoute><EquipmentPage /></PrivateRoute>} />
          <Route path="/operators" element={<PrivateRoute><OperatorsPage /></PrivateRoute>} />
          <Route path="/workorders" element={<PrivateRoute><WorkOrdersPage /></PrivateRoute>} />
          <Route path="/quotes"       element={<PrivateRoute><QuotesPage /></PrivateRoute>} />
          <Route path="/maintenance"  element={<PrivateRoute><MaintenancePage /></PrivateRoute>} />
          <Route path="/reports"                element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
          <Route path="/reports/gerencial"     element={<PrivateRoute><GerencialReportPage /></PrivateRoute>} />
          <Route path="/reports/equipos"       element={<PrivateRoute><EquipmentReportPage /></PrivateRoute>} />
          <Route path="/reports/ots"           element={<PrivateRoute><OTReportPage /></PrivateRoute>} />
          <Route path="/reports/facturacion"   element={<PrivateRoute><InvoicesReportPage /></PrivateRoute>} />
          <Route path="/reports/cobranza"      element={<PrivateRoute><CxCReportPage /></PrivateRoute>} />
          <Route path="/reports/cotizaciones"  element={<PrivateRoute><QuotesReportPage /></PrivateRoute>} />
          <Route path="/reports/mantenimiento" element={<PrivateRoute><MaintenanceReportPage /></PrivateRoute>} />
          <Route path="/reports/clientes"      element={<PrivateRoute><ClientsReportPage /></PrivateRoute>} />
          <Route path="/reports/pagos"         element={<PrivateRoute><PaymentsReportPage /></PrivateRoute>} />
          <Route path="/reports/rentabilidad"     element={<PrivateRoute><EquipmentProfitabilityPage /></PrivateRoute>} />
          <Route path="/reports/disponibilidad" element={<PrivateRoute><EquipmentAvailabilityPage /></PrivateRoute>} />
          <Route path="/sunat" element={<PrivateRoute><SunatSyncPage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
