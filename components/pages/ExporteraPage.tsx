'use client'
import { useApp } from '@/lib/appStore'

function downloadCSV(filename: string, rows: string[][]) {
  const content = rows.map(r => r.map(cell => `"${(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ExporteraPage() {
  const { passes, people, churches, currentChurchId } = useApp()
  const cid = currentChurchId()
  const allBkgs = passes.filter(p => p.church === cid).flatMap(p =>
    p.bookings.map(b => ({ ...b, passTitle: p.title, passDate: p.date, passTime: p.time, plats: p.plats }))
  )
  const churchPeople = people.filter(p => p.church === cid)

  const exportBkgsCSV = () => {
    const rows = [
      ['Pass', 'Datum', 'Tid', 'Plats', 'Namn', 'E-post', 'Telefon', 'Källa'],
      ...allBkgs.map(b => [b.passTitle, b.passDate, b.passTime || '', b.plats || '', b.name, b.mail || '', b.tel || '', b.source === 'kiosk' ? 'Kiosk' : b.source === 'manual' ? 'Manuellt' : 'App']),
    ]
    downloadCSV(`bokningar-${new Date().toISOString().slice(0,10)}.csv`, rows)
  }

  const exportPeopleCSV = () => {
    const rows = [
      ['Namn', 'E-post', 'Telefon', 'Roll', 'Kyrka'],
      ...churchPeople.map(p => [p.name, p.mail || '', p.phone || '', p.role, churches[p.church]?.name || '']),
    ]
    downloadCSV(`personal-${new Date().toISOString().slice(0,10)}.csv`, rows)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Exportera</h1>
        <p className="page-sub">Ladda ned data som CSV</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={exportBkgsCSV}>📄 Exportera bokningar (CSV)</button>
        <button className="btn btn-secondary" onClick={exportPeopleCSV}>👥 Exportera personal (CSV)</button>
      </div>

      <div className="section-label">Bokningslista ({allBkgs.length} poster)</div>
      <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, overflow: 'hidden' }}>
        {allBkgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#888780', fontSize: 13 }}>Inga bokningar ännu.</div>
        ) : (
          <table className="exp-table">
            <thead><tr><th>Pass</th><th>Datum</th><th>Namn</th><th>Källa</th></tr></thead>
            <tbody>
              {allBkgs.slice(0, 15).map((b, i) => (
                <tr key={i}>
                  <td>{b.passTitle}</td><td>{b.passDate}</td><td>{b.name}</td>
                  <td>{b.source === 'kiosk' ? 'Kiosk' : b.source === 'manual' ? 'Manuellt' : 'App'}</td>
                </tr>
              ))}
              {allBkgs.length > 15 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888780', fontSize: 11 }}>+{allBkgs.length - 15} fler...</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
