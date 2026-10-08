import app from './app'
import { env } from './config/env'
import { prisma } from './config/database'
import { startAlertsJob } from './jobs/alerts.job'

const connectWithRetry = async (maxAttempts = 15, delayMs = 3000): Promise<void> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect()
      return
    } catch (err) {
      if (attempt === maxAttempts) throw err
      console.log(`⏳ DB no disponible (intento ${attempt}/${maxAttempts}), reintentando en ${delayMs / 1000}s...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

const start = async () => {
  try {
    await connectWithRetry()
    console.log('✅ Base de datos conectada')

    startAlertsJob()

    app.listen(env.port, () => {
      console.log(`🚀 FlotaTrack API corriendo en http://localhost:${env.port}`)
    })
  } catch (err) {
    console.error('❌ Error al iniciar:', err)
    process.exit(1)
  }
}

start()
