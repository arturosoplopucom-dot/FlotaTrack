import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { errorHandler } from './middlewares/error.middleware'
import authRoutes from './modules/auth/auth.routes'
import clientsRoutes from './modules/clients/clients.routes'
import invoicesRoutes from './modules/invoices/invoices.routes'
import equipmentRoutes from './modules/equipment/equipment.routes'
import operatorsRoutes from './modules/operators/operators.routes'
import workOrdersRoutes from './modules/workorders/workorders.routes'
import companyRoutes from './modules/company/company.routes'
import sunatRoutes from './modules/sunat/sunat.routes'
import quotesRoutes from './modules/quotes/quotes.routes'
import maintenanceRoutes from './modules/maintenance/maintenance.routes'
import reportsRoutes from './modules/reports/reports.routes'

const app = express()

app.use(cors({ origin: env.clientUrl, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }))

app.use('/api/auth', authRoutes)
app.use('/api/clients', clientsRoutes)
app.use('/api/invoices', invoicesRoutes)
app.use('/api/equipment', equipmentRoutes)
app.use('/api/operators', operatorsRoutes)
app.use('/api/workorders', workOrdersRoutes)
app.use('/api/company', companyRoutes)
app.use('/api/sunat', sunatRoutes)
app.use('/api/quotes', quotesRoutes)
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/reports', reportsRoutes)

app.use(errorHandler)

export default app
