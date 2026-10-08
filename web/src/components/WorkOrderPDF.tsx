import { jsPDF } from 'jspdf'
import type { WorkOrder } from '../hooks/useFlota'

type Company = { name: string; ruc: string; address?: string; phone?: string; email?: string }

const fmt = (n: number) =>
  'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}

const billingLabel: Record<string, string> = { HOURLY: 'hora', DAILY: 'día', FIXED: 'servicio' }

const NAVY  = [30, 58, 95]    as [number, number, number]
const WHITE = [255, 255, 255] as [number, number, number]
const LIGHT = [245, 248, 252] as [number, number, number]
const GRAY  = [100, 110, 125] as [number, number, number]
const DARK  = [26, 26, 46]   as [number, number, number]
const AMBER = [180, 83, 9]   as [number, number, number]

// ─── Función central que construye el PDF y retorna el doc ───────────────────

function buildPDF(wo: WorkOrder, company: Company): jsPDF {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const H    = doc.internal.pageSize.getHeight()
  const L    = 15
  const R    = W - L
  let   y    = 15

  const extraCosts = wo.costs.reduce((s, c) => s + Number(c.amount), 0)
  const baseTotal  = Number(wo.subtotal) + extraCosts
  const igv        = Math.round(baseTotal * 0.18 * 100) / 100
  const total      = Math.round(baseTotal * 1.18 * 100) / 100
  const detraccion = wo.invoice ? Number(wo.invoice.detraccion) : 0
  const netCobrar  = total - detraccion
  const today      = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const unit       = billingLabel[wo.billingType] ?? 'unidad'

  const setColor = (r: [number, number, number]) => doc.setTextColor(r[0], r[1], r[2])
  const setFill  = (r: [number, number, number]) => doc.setFillColor(r[0], r[1], r[2])
  const setDraw  = (r: [number, number, number]) => doc.setDrawColor(r[0], r[1], r[2])
  const line     = (x1: number, y1: number, x2: number, y2: number) => doc.line(x1, y1, x2, y2)
  const rect     = (x: number, yy: number, w: number, h: number) => doc.rect(x, yy, w, h, 'F')

  // ── Header band ──
  setFill(NAVY); rect(0, 0, W, 30)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); setColor(WHITE)
  doc.text(company.name, L, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor([200, 210, 225])
  doc.text([`RUC: ${company.ruc}`, company.address, company.phone ? `Tel: ${company.phone}` : undefined, company.email].filter(Boolean).join('   ·   '), L, 19)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor([180, 200, 230])
  doc.text('ORDEN DE TRABAJO', R, 10, { align: 'right' })
  doc.setFontSize(20); setColor(WHITE); doc.text(wo.number, R, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor([180, 200, 230])
  doc.text(`Emitida: ${today}`, R, 26, { align: 'right' })

  y = 38
  setDraw(NAVY); doc.setLineWidth(0.5); line(L, y, R, y); y += 6

  // ── Info boxes ──
  const colW = (R - L - 6) / 2
  const col2 = L + colW + 6

  const infoBox = (x: number, yy: number, w: number, h: number, title: string, rows: [string, string][]) => {
    setFill(LIGHT); doc.setDrawColor(220, 228, 236); doc.setLineWidth(0.3)
    doc.roundedRect(x, yy, w, h, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setColor(NAVY)
    doc.text(title.toUpperCase(), x + 4, yy + 5)
    let ry = yy + 9
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY); doc.text(label, x + 4, ry)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setColor(DARK); doc.text(value, x + 4, ry + 4)
      ry += 10
    })
  }

  const clip = (s: string, n: number) => s.length > n ? s.substring(0, n) + '…' : s
  const boxH1 = 32
  infoBox(L, y, colW, boxH1, 'Cliente', [
    ['Razón social', clip(wo.client.businessName, 35)],
    ['RUC', wo.client.ruc],
  ])
  infoBox(col2, y, colW, boxH1, 'Servicio', [
    ['Equipo', clip(wo.equipment.name, 30)],
    ['Operario', wo.operator.name],
  ])
  y += boxH1 + 4

  const boxH2 = 26
  const dateRows: [string, string][] = [['Fecha inicio', fmtDate(wo.startDate)], ...(wo.endDate ? [['Fecha fin', fmtDate(wo.endDate)] as [string, string]] : [])]
  const locRows: [string, string][] = [...(wo.location ? [['Ubicación', wo.location] as [string, string]] : []), ...(wo.description ? [['Descripción', clip(wo.description, 30)] as [string, string]] : [])]
  infoBox(L, y, colW, boxH2, 'Período', dateRows)
  if (locRows.length > 0) infoBox(col2, y, colW, boxH2, 'Trabajo', locRows)
  y += boxH2 + 8

  // ── Table ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setColor(NAVY)
  doc.text('DETALLE DE FACTURACIÓN', L, y); y += 4
  setFill(NAVY); rect(L, y, R - L, 7); setColor(WHITE)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text('Descripción', L + 3, y + 4.5)
  doc.text('Cant.', L + 98, y + 4.5, { align: 'right' })
  doc.text('Precio unit.', L + 127, y + 4.5, { align: 'right' })
  doc.text('Subtotal', R - 2, y + 4.5, { align: 'right' })
  y += 7

  setFill(LIGHT); rect(L, y, R - L, 7); setColor(DARK)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const svcDesc = wo.description ? `${wo.equipment.name} — ${wo.description}` : wo.equipment.name
  doc.text(clip(svcDesc, 55), L + 3, y + 4.5)
  doc.text(`${Number(wo.quantity)} ${unit}`, L + 98, y + 4.5, { align: 'right' })
  doc.text(fmt(Number(wo.unitRate)), L + 127, y + 4.5, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.text(fmt(Number(wo.subtotal)), R - 2, y + 4.5, { align: 'right' })
  y += 7

  wo.costs.forEach((c, i) => {
    if (i % 2 === 0) { setFill([255, 255, 255]); rect(L, y, R - L, 6.5) }
    setColor([80, 90, 105]); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(c.description ? `${c.category} (${c.description})` : c.category, L + 3, y + 4.2)
    doc.text(fmt(Number(c.amount)), R - 2, y + 4.2, { align: 'right' })
    y += 6.5
  })
  setDraw([210, 218, 228]); doc.setLineWidth(0.3); line(L, y, R, y); y += 8

  // ── Totals ──
  const tBoxW = 80; const tBoxX = R - tBoxW
  ;([['Subtotal (sin IGV)', fmt(baseTotal)], ['IGV (18%)', fmt(igv)]] as [string, string][]).forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(GRAY); doc.text(label, tBoxX, y)
    setColor(DARK); doc.text(value, R - 2, y, { align: 'right' }); y += 5.5
  })
  y += 1; setFill(NAVY); rect(tBoxX - 3, y - 4, tBoxW + 3, 9); setColor(WHITE)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('TOTAL', tBoxX, y + 2); doc.text(fmt(total), R - 2, y + 2, { align: 'right' }); y += 13

  if (detraccion > 0) {
    setFill([255, 248, 225]); rect(tBoxX - 3, y - 4, tBoxW + 3, 8); setColor(AMBER)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('Detracción (retención SUNAT)', tBoxX, y + 1)
    doc.setFont('helvetica', 'bold'); doc.text(`- ${fmt(detraccion)}`, R - 2, y + 1, { align: 'right' }); y += 10
    setColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text('Neto a cobrar', tBoxX, y); doc.text(fmt(netCobrar), R - 2, y, { align: 'right' }); y += 8
  }

  // ── Notes ──
  if (wo.notes) {
    y += 4; setFill(LIGHT); rect(L, y, R - L, 16)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setColor(NAVY); doc.text('OBSERVACIONES', L + 3, y + 5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(GRAY)
    doc.text(doc.splitTextToSize(wo.notes, R - L - 6).slice(0, 2), L + 3, y + 10); y += 20
  }

  // ── Signatures ──
  const sigY = Math.max(y + 20, H - 55); const sigW = (R - L - 20) / 2; const sig2X = L + sigW + 20
  line(L, sigY, L + sigW, sigY)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setColor(DARK)
  doc.text(clip(company.name, 35), L, sigY + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY); doc.text('Representante autorizado', L, sigY + 8)
  line(sig2X, sigY, sig2X + sigW, sigY)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setColor(DARK)
  doc.text(clip(wo.client.businessName, 35), sig2X, sigY + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(GRAY); doc.text('Conformidad del cliente', sig2X, sigY + 8)

  // ── Footer ──
  setDraw([220, 228, 236]); doc.setLineWidth(0.3); line(L, H - 12, R, H - 12)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor([170, 180, 190])
  doc.text(`${wo.number}  ·  ${company.name}  ·  RUC ${company.ruc}`, L, H - 7)
  doc.text(`Generado el ${today}`, R, H - 7, { align: 'right' })

  return doc
}

// ─── API pública ─────────────────────────────────────────────────────────────

export function downloadWorkOrderPDF(wo: WorkOrder, company: Company): void {
  buildPDF(wo, company).save(`${wo.number}.pdf`)
}

export function generatePDFBlob(wo: WorkOrder, company: Company): Blob {
  return buildPDF(wo, company).output('blob')
}

export function previewWorkOrderPDFUrl(wo: WorkOrder, company: Company): string {
  return buildPDF(wo, company).output('datauristring')
}
