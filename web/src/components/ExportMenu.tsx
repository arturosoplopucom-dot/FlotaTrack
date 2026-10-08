import { useState } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { exportToExcel, exportToPDF } from '../utils/exportUtils'

interface Props {
  title:    string
  csvRows:  Record<string, unknown>[] | null | undefined
  filename: string
}

export default function ExportMenu({ title, csvRows, filename }: Props) {
  const [loading, setLoading] = useState<'xlsx' | 'pdf' | null>(null)

  const isEmpty = !csvRows?.length

  const handleExcel = async () => {
    if (isEmpty || loading) return
    setLoading('xlsx')
    try {
      await exportToExcel(csvRows!, filename, title, 'blue')
    } catch (err) {
      console.error('[ExportMenu] Excel error:', err)
      alert(`Error al generar Excel: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(null)
    }
  }

  const handlePDF = () => {
    if (isEmpty || loading) return
    setLoading('pdf')
    try {
      exportToPDF(csvRows!, filename, title, 'blue')
    } catch (err) {
      console.error('[ExportMenu] PDF error:', err)
      alert(`Error al generar PDF: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(null)
    }
  }

  const baseBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    border: 'none', cursor: isEmpty ? 'not-allowed' : loading ? 'wait' : 'pointer',
    transition: 'opacity 0.15s, filter 0.15s',
    opacity: isEmpty ? 0.45 : 1,
    color: '#fff',
  }

  return (
    <div className="no-print" style={{ display: 'flex', gap: 8 }}>
      {/* Excel */}
      <button
        onClick={handleExcel}
        disabled={isEmpty || !!loading}
        title={isEmpty ? 'Sin datos para exportar' : 'Exportar a Excel (.xlsx)'}
        style={{ ...baseBtn, background: loading === 'xlsx' ? '#15803d' : '#16a34a' }}
        onMouseEnter={(e) => { if (!isEmpty && !loading) e.currentTarget.style.filter = 'brightness(1.1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}>
        {loading === 'xlsx'
          ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          : <FileSpreadsheet size={13} />}
        Exportar Excel
      </button>

      {/* PDF */}
      <button
        onClick={handlePDF}
        disabled={isEmpty || !!loading}
        title={isEmpty ? 'Sin datos para exportar' : 'Exportar a PDF'}
        style={{ ...baseBtn, background: loading === 'pdf' ? '#b91c1c' : '#dc2626' }}
        onMouseEnter={(e) => { if (!isEmpty && !loading) e.currentTarget.style.filter = 'brightness(1.1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}>
        {loading === 'pdf'
          ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          : <FileText size={13} />}
        Exportar PDF
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
