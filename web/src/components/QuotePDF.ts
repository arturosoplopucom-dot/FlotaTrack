import { jsPDF } from 'jspdf'
import type { Quote } from '../hooks/useQuotes'
import type { CompanyProfile } from '../hooks/useFlota'

const fmt = (n: number | string) =>
  Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}

const NAVY  = [30, 58, 95]    as [number, number, number]
const WHITE = [255, 255, 255] as [number, number, number]
const LIGHT = [245, 248, 252] as [number, number, number]
const GRAY  = [100, 110, 125] as [number, number, number]
const DARK  = [26, 26, 46]    as [number, number, number]
const GREEN = [21, 128, 61]   as [number, number, number]

const STATUS_LABEL: Record<string, string> = {
  DRAFT:     'BORRADOR',
  SENT:      'ENVIADA',
  APPROVED:  'APROBADA',
  REJECTED:  'RECHAZADA',
  CONVERTED: 'CONVERTIDA A OT',
}

async function buildQuotePDF(quote: Quote, company: CompanyProfile): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const MARGIN = 15
  let y = 0

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 38, 'F')

  doc.setTextColor(...WHITE)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('COTIZACIÓN', W - MARGIN, 14, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(quote.number, W - MARGIN, 21, { align: 'right' })

  const statusLabel = STATUS_LABEL[quote.status] ?? quote.status
  doc.setFontSize(8)
  doc.text(`Estado: ${statusLabel}`, W - MARGIN, 28, { align: 'right' })

  // Empresa emisora
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(company.name, MARGIN, 14)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`RUC: ${company.ruc}`, MARGIN, 21)
  if (company.address) doc.text(company.address, MARGIN, 27)
  if (company.phone)   doc.text(`Tel: ${company.phone}`, MARGIN, 33)

  y = 45

  // ── Fechas ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT)
  doc.rect(MARGIN, y, W - MARGIN * 2, 12, 'F')
  doc.setTextColor(...DARK)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha emisión: ${fmtDate(quote.issueDate)}`, MARGIN + 3, y + 5)
  doc.text(`Válida hasta: ${fmtDate(quote.validUntil)}`, MARGIN + 3, y + 10)
  doc.text(`Moneda: ${quote.currency === 'PEN' ? 'Soles (PEN)' : 'Dólares (USD)'}`, W / 2, y + 5)
  if (quote.equipment) {
    doc.text(`Equipo: ${quote.equipment.name}`, W / 2, y + 10)
  }
  y += 18

  // ── Cliente ────────────────────────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text('CLIENTE / RECEPTOR', MARGIN, y)
  y += 4

  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, W - MARGIN, y)
  y += 3

  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(quote.client.businessName, MARGIN, y)
  y += 5

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`RUC: ${quote.client.ruc}`, MARGIN, y)
  if (quote.client.address) doc.text(quote.client.address, MARGIN + 50, y)
  y += 5
  if (quote.client.contactName) {
    doc.text(`Attn: ${quote.client.contactName}`, MARGIN, y)
    y += 5
  }
  if (quote.client.email || quote.client.phone) {
    const contact = [quote.client.email, quote.client.phone].filter(Boolean).join('  |  ')
    doc.text(contact, MARGIN, y)
    y += 5
  }
  y += 3

  // ── Tabla de ítems ─────────────────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text('DETALLE DE SERVICIOS', MARGIN, y)
  y += 4

  // Cabecera tabla
  doc.setFillColor(...NAVY)
  doc.rect(MARGIN, y, W - MARGIN * 2, 7, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(7.5)
  doc.text('#',               MARGIN + 2, y + 5)
  doc.text('Descripción',     MARGIN + 8, y + 5)
  doc.text('Cant.',           W - 60, y + 5, { align: 'right' })
  doc.text('P. Unit.',        W - 40, y + 5, { align: 'right' })
  doc.text('Total',           W - MARGIN, y + 5, { align: 'right' })
  y += 7

  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'normal')

  quote.items.forEach((item, idx) => {
    if (y > 255) {
      doc.addPage()
      y = 20
    }
    const bg = idx % 2 === 0 ? WHITE : LIGHT
    doc.setFillColor(...bg)
    doc.rect(MARGIN, y, W - MARGIN * 2, 7, 'F')

    doc.setFontSize(7.5)
    doc.text(String(idx + 1), MARGIN + 2, y + 5)

    const maxDescW = W - MARGIN * 2 - 70
    const desc = doc.splitTextToSize(item.description, maxDescW)[0] ?? item.description
    doc.text(desc, MARGIN + 8, y + 5)
    doc.text(Number(item.quantity).toLocaleString('es-PE', { maximumFractionDigits: 3 }), W - 60, y + 5, { align: 'right' })
    doc.text(fmt(item.unitPrice), W - 40, y + 5, { align: 'right' })
    doc.text(fmt(item.total),     W - MARGIN, y + 5, { align: 'right' })
    y += 7
  })

  // Línea inferior tabla
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, W - MARGIN, y)
  y += 5

  // ── Totales ────────────────────────────────────────────────────────────────
  const totalsX = W - MARGIN - 70
  const valX    = W - MARGIN

  const addTotalRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...(bold ? NAVY : GRAY))
    doc.text(label, totalsX, y)
    doc.setTextColor(...DARK)
    doc.text(value, valX, y, { align: 'right' })
    y += 5
  }

  const sym = quote.currency === 'PEN' ? 'S/' : '$'
  addTotalRow('Subtotal (sin IGV)',   `${sym} ${fmt(quote.subtotal)}`)
  addTotalRow('IGV (18%)',            `${sym} ${fmt(quote.igv)}`)

  // Línea antes del total
  doc.setDrawColor(...NAVY)
  doc.line(totalsX, y - 1, valX, y - 1)
  y += 1
  addTotalRow('TOTAL',               `${sym} ${fmt(quote.total)}`, true)

  y += 8

  // ── Notas ──────────────────────────────────────────────────────────────────
  if (quote.notes) {
    doc.setFillColor(...LIGHT)
    doc.rect(MARGIN, y, W - MARGIN * 2, 3, 'F')
    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text('OBSERVACIONES', MARGIN, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK)
    const lines = doc.splitTextToSize(quote.notes, W - MARGIN * 2)
    doc.text(lines, MARGIN, y)
    y += lines.length * 4 + 4
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 287, W, 10, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`${company.name} · RUC: ${company.ruc}`, W / 2, 293, { align: 'center' })

  // ── Sello de estado APROBADA ────────────────────────────────────────────────
  if (quote.status === 'APPROVED') {
    doc.setTextColor(...GREEN)
    doc.setFontSize(36)
    doc.setFont('helvetica', 'bold')
    doc.setGState(doc.GState({ opacity: 0.15 }))
    doc.text('APROBADA', W / 2, 180, { align: 'center', angle: 35 })
    doc.setGState(doc.GState({ opacity: 1 }))
  }

  return doc
}

export async function downloadQuotePDF(quote: Quote, company: CompanyProfile): Promise<void> {
  const doc = await buildQuotePDF(quote, company)
  doc.save(`${quote.number}.pdf`)
}

export async function previewQuotePDFUrl(quote: Quote, company: CompanyProfile): Promise<string> {
  const doc = await buildQuotePDF(quote, company)
  return doc.output('datauristring')
}
