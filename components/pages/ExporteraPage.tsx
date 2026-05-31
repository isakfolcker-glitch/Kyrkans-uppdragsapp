'use client'
import { useApp } from '@/lib/appStore'

export default function ExporteraPage() {
  const { passes } = useApp()
  const allBkgs = passes.flatMap(p => p.bookings.map(b => ({ ...b, passTitle: p.title, passDate: p.date })))
  return (
    <div>
      <div className="page-header"><h1 className="page-title">Exportera</h1></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => alert('I riktig version laddas Excel ned.')}>📊 Exportera Excel</button>
        <button className="btn btn-secondary" onClick={() => alert('I riktig version laddas CSV ned.')}>📄 Exportera CSV</button>
      </div>
      <div className="section-label">Bokningslista ({allBkgs.length} poster)</div>
      <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, overflow: 'hidden' }}>
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
      </div>
    </div>
  )
}
