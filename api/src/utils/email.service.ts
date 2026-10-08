import nodemailer from 'nodemailer'
import { env } from '../config/env'

type SmtpConfig = {
  host?: string
  port?: number
  user?: string
  pass?: string
  from?: string
  fromName?: string
  secure?: boolean
}

function createTransporter(smtpConfig?: SmtpConfig | null) {
  const host   = smtpConfig?.host || env.smtp.host
  const port   = smtpConfig?.port || env.smtp.port
  const user   = smtpConfig?.user || env.smtp.user
  const pass   = smtpConfig?.pass || env.smtp.pass
  const secure = smtpConfig?.secure ?? (port === 465)

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  })
}

function getFrom(smtpConfig?: SmtpConfig | null, companyName?: string): string {
  if (smtpConfig?.from) return smtpConfig.from
  const displayName = smtpConfig?.fromName || companyName || 'FlotaTrack'
  if (smtpConfig?.user) return `${displayName} <${smtpConfig.user}>`
  return env.smtp.from
}

const formatDate = (d: Date) =>
  d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })

const formatMoney = (n: unknown, currency = 'PEN') =>
  `${currency === 'USD' ? 'US$' : 'S/'} ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`

type InvoiceWithRelations = {
  id: string
  number: string
  series: string
  total: unknown
  dueDate: Date
  currency: string
  client: { businessName: string; email: string | null; whatsapp: string | null }
  company: { name: string; email: string | null; smtpConfig?: unknown }
}

export const emailService = {
  async sendOverdueAlert(invoice: InvoiceWithRelations) {
    const to = invoice.client.email
    if (!to) return

    const smtpCfg = invoice.company.smtpConfig as SmtpConfig | null | undefined
    const transporter = createTransporter(smtpCfg)
    const from = getFrom(smtpCfg, invoice.company.name)

    await transporter.sendMail({
      from,
      to,
      subject: `⚠️ Factura VENCIDA ${invoice.series}-${invoice.number} — ${invoice.company.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#dc2626">⚠️ Factura Vencida</h2>
          <p>Estimados <strong>${invoice.client.businessName}</strong>,</p>
          <p>Les informamos que la siguiente factura se encuentra <strong style="color:#dc2626">VENCIDA</strong>:</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>Factura N°</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${invoice.series}-${invoice.number}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Monto</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${formatMoney(invoice.total, invoice.currency)}</td>
            </tr>
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>Fecha vencimiento</strong></td>
              <td style="padding:8px;border:1px solid #ddd;color:#dc2626"><strong>${formatDate(invoice.dueDate)}</strong></td>
            </tr>
          </table>
          <p>Por favor coordinar el pago a la brevedad para evitar inconvenientes.</p>
          <p>Atentamente,<br><strong>${invoice.company.name}</strong></p>
        </div>
      `,
    })
  },

  async sendDueSoonAlert(invoice: InvoiceWithRelations, days: number) {
    const to = invoice.client.email
    if (!to) return

    const smtpCfg = invoice.company.smtpConfig as SmtpConfig | null | undefined
    const transporter = createTransporter(smtpCfg)
    const from = getFrom(smtpCfg, invoice.company.name)

    const color   = days <= 7 ? '#d97706' : '#2563eb'
    const urgency = days <= 7 ? 'URGENTE: ' : ''

    await transporter.sendMail({
      from,
      to,
      subject: `${urgency}Factura ${invoice.series}-${invoice.number} vence en ${days} días — ${invoice.company.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${color}">📅 Recordatorio de vencimiento</h2>
          <p>Estimados <strong>${invoice.client.businessName}</strong>,</p>
          <p>Les recordamos que la siguiente factura vence en <strong style="color:${color}">${days} días</strong>:</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>Factura N°</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${invoice.series}-${invoice.number}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Monto</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${formatMoney(invoice.total, invoice.currency)}</td>
            </tr>
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>Fecha vencimiento</strong></td>
              <td style="padding:8px;border:1px solid #ddd;color:${color}"><strong>${formatDate(invoice.dueDate)}</strong></td>
            </tr>
          </table>
          <p>Ante cualquier consulta, no duden en contactarnos.</p>
          <p>Atentamente,<br><strong>${invoice.company.name}</strong></p>
        </div>
      `,
    })
  },

  async sendInvoiceReceipt(invoice: InvoiceWithRelations, pdfBuffer?: Buffer) {
    const to = invoice.client.email
    if (!to) return
    const smtpCfg = invoice.company.smtpConfig as SmtpConfig | null | undefined
    const transporter = createTransporter(smtpCfg)
    const from = getFrom(smtpCfg, invoice.company.name)
    const filename = `${invoice.series}-${invoice.number.padStart(8, '0')}.pdf`
    await transporter.sendMail({
      from,
      to,
      subject: `Factura ${invoice.series}-${invoice.number} — ${invoice.company.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#16a34a">✅ Comprobante de Factura</h2>
          <p>Estimados <strong>${invoice.client.businessName}</strong>,</p>
          <p>Adjuntamos el comprobante de la siguiente factura:</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>Factura N°</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${invoice.series}-${invoice.number}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Monto</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${formatMoney(invoice.total, invoice.currency)}</td>
            </tr>
            <tr style="background:#f5f5f5">
              <td style="padding:8px;border:1px solid #ddd"><strong>Fecha vencimiento</strong></td>
              <td style="padding:8px;border:1px solid #ddd">${formatDate(invoice.dueDate)}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Estado</strong></td>
              <td style="padding:8px;border:1px solid #ddd;color:#16a34a"><strong>PAGADA</strong></td>
            </tr>
          </table>
          <p>${pdfBuffer ? 'Encontrará el PDF adjunto a este correo.' : ''} Quedo a su disposición ante cualquier consulta.</p>
          <p>Atentamente,<br><strong>${invoice.company.name}</strong></p>
        </div>
      `,
      attachments: pdfBuffer ? [{ filename, content: pdfBuffer, contentType: 'application/pdf' }] : [],
    })
  },

  async testConnection(smtpConfig: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      const transporter = createTransporter(smtpConfig)
      await transporter.verify()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  },
}
