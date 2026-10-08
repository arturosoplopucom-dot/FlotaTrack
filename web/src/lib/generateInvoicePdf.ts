import { jsPDF } from 'jspdf'

type Company = { name: string; ruc: string }

type Invoice = {
  series: string
  number: string
  description?: string
  amount: string
  igv: string
  total: string
  issueDate: string
  dueDate: string
  currency: 'PEN' | 'USD'
  status: string
  client: { businessName: string; ruc: string; email?: string }
}

const CURRENCY = { PEN: 'S/', USD: 'US$' }
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'PENDIENTE', PARTIAL: 'PAGO PARCIAL', PAID: 'PAGADA', OVERDUE: 'VENCIDA',
}

function fmt(n: number, currency: 'PEN' | 'USD') {
  return `${CURRENCY[currency]} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function generateInvoicePdf(invoice: Invoice, company: Company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const cur = invoice.currency

  // ── Paleta ────────────────────────────────────────────────────────────────
  const DARK   = [15,  23,  42]  as [number, number, number]
  const BLUE   = [37,  99, 235]  as [number, number, number]
  const GRAY   = [100, 116, 139] as [number, number, number]
  const LGRAY  = [241, 245, 249] as [number, number, number]
  const WHITE  = [255, 255, 255] as [number, number, number]
  const GREEN  = [22,  163, 74]  as [number, number, number]
  const RED    = [220,  38, 38]  as [number, number, number]

  // ── Header azul ───────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE)
  doc.rect(0, 0, W, 38, 'F')

  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('FlotaTrack', 14, 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(company.name, 14, 21)
  doc.text(`RUC ${company.ruc}`, 14, 27)

  // Número de factura (derecha)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...WHITE)
  const invoiceNum = `${invoice.series}-${invoice.number}`
  doc.text(invoiceNum, W - 14, 18, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('FACTURA ELECTRÓNICA', W - 14, 25, { align: 'right' })

  // Estado
  const statusColor = invoice.status === 'PAID' ? GREEN : invoice.status === 'OVERDUE' ? RED : BLUE
  doc.setFillColor(...statusColor)
  doc.roundedRect(W - 52, 28, 38, 7, 2, 2, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(STATUS_LABEL[invoice.status] ?? invoice.status, W - 33, 33, { align: 'center' })

  // ── Fechas ────────────────────────────────────────────────────────────────
  let y = 50
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Fecha de emisión', 14, y)
  doc.text('Fecha de vencimiento', 80, y)
  doc.text('Moneda', 150, y)

  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(formatDate(invoice.issueDate), 14, y + 6)
  doc.text(formatDate(invoice.dueDate), 80, y + 6)
  doc.text(cur === 'PEN' ? 'Soles (PEN)' : 'Dólares (USD)', 150, y + 6)

  // ── Divisor ───────────────────────────────────────────────────────────────
  y += 16
  doc.setDrawColor(...LGRAY)
  doc.setLineWidth(0.4)
  doc.line(14, y, W - 14, y)

  // ── Cliente ───────────────────────────────────────────────────────────────
  y += 10
  doc.setFillColor(...LGRAY)
  doc.roundedRect(14, y - 5, W - 28, 28, 3, 3, 'F')

  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('CLIENTE', 20, y + 1)

  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(invoice.client.businessName, 20, y + 9)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(`RUC: ${invoice.client.ruc}`, 20, y + 16)
  if (invoice.client.email) {
    doc.text(invoice.client.email, 20, y + 21)
  }

  // ── Tabla de concepto ─────────────────────────────────────────────────────
  y += 38
  doc.setFillColor(...BLUE)
  doc.rect(14, y, W - 28, 9, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('DESCRIPCIÓN', 20, y + 6)
  doc.text('IMPORTE', W - 20, y + 6, { align: 'right' })

  y += 9
  doc.setFillColor(248, 250, 252)
  doc.rect(14, y, W - 28, 14, 'F')
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const desc = invoice.description || `Servicio de grúa · Factura ${invoiceNum}`
  doc.text(desc, 20, y + 6)
  doc.setFont('helvetica', 'bold')
  doc.text(fmt(Number(invoice.amount), cur), W - 20, y + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Ver detalle en Orden de Trabajo asociada', 20, y + 11)

  // ── Totales ───────────────────────────────────────────────────────────────
  y += 24
  const TW = 80
  const TX = W - 14 - TW

  const drawTotal = (label: string, value: string, bold = false, fill?: [number, number, number]) => {
    if (fill) {
      doc.setFillColor(...fill)
      doc.rect(TX, y - 5, TW, 10, 'F')
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 10 : 9)
    const textColor = bold && fill ? WHITE : DARK
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    doc.text(label, TX + 4, y + 1)
    doc.text(value, TX + TW - 4, y + 1, { align: 'right' })
    y += 10
  }

  drawTotal('Subtotal (sin IGV)', fmt(Number(invoice.amount), cur))
  drawTotal('IGV 18%', fmt(Number(invoice.igv), cur))
  doc.setDrawColor(...BLUE)
  doc.setLineWidth(0.3)
  doc.line(TX, y - 2, TX + TW, y - 2)
  drawTotal('TOTAL', fmt(Number(invoice.total), cur), true, BLUE)

  // ── Nota de pago ──────────────────────────────────────────────────────────
  y += 6
  doc.setFillColor(...LGRAY)
  doc.roundedRect(14, y, W - 28, 16, 3, 3, 'F')
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('INFORMACIÓN DE PAGO', 20, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Transferencia bancaria o depósito a nombre de ' + company.name, 20, y + 12)

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFillColor(...DARK)
  doc.rect(0, 282, W, 15, 'F')
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('Generado por FlotaTrack · Sistema de Gestión de Flota', W / 2, 290, { align: 'center' })
  doc.text(company.name + ' · RUC ' + company.ruc, W / 2, 294, { align: 'center' })

  // ── Guardar ───────────────────────────────────────────────────────────────
  doc.save(`${invoiceNum}-${invoice.client.businessName.replace(/\s+/g, '-')}.pdf`)
}
