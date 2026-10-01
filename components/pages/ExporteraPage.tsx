'use client'
import { useState, useRef } from 'react'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'

function downloadCSV(filename: string, rows: string[][]) {
  const content = rows.map(r => r.map(cell => `"${(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) {
        cells.push(cur.trim()); cur = ''
      } else cur += ch
    }
    cells.push(cur.trim())
    rows.push(cells)
  }
  return rows
}

function parsePaste(text: string, type: 'person' | 'pass') {
  const lines = text.trim().split('\n').filter(l => l.trim())
  // Stöd både tab (Excel) och semikolon/komma som separator
  const sep = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(';') ? ';' : ','
  return lines.map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    if (type === 'person') return { name: cols[0] || '', email: cols[1] || '', role: cols[2] || 'ideell', group: cols[3] || '' }
    return { title: cols[0] || '', date: cols[1] || '', time: cols[2] || '', plats: cols[3] || '', spots: cols[4] || '5', vk: cols[5] || '', tel: cols[6] || '', group: cols[7] || '' }
  })
  // Filtrera inte bort rader — visa allt och låt användaren se vad som parsats
}

function ImportPersoner({ churchId, groups }: { churchId: number; groups: { id: string; label: string }[] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [pasteText, setPasteText] = useState('')
  const [tab, setTab] = useState<'paste' | 'file'>('paste')

  const mall = () => downloadCSV('mall-personer.csv', [
    ['namn', 'epost', 'roll', 'grupp'],
    ['Anna Svensson', 'anna@kyrka.se', 'ideell', groups[0]?.label || ''],
    ['Erik Johansson', 'erik@kyrka.se', 'anstalld', ''],
  ])

  const onPaste = () => {
    const parsed = parsePaste(pasteText, 'person')
    if (!parsed.length) { alert('Inga rader hittades. Kontrollera att du klistrat in data.'); return }
    setRows(parsed)
    setDone(0)
    setErrors([])
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCSV(ev.target?.result as string)
      if (parsed.length < 2) return
      const header = parsed[0].map(h => h.toLowerCase().replace(/\s/g, ''))
      const nameIdx  = header.findIndex(h => h.includes('namn'))
      const emailIdx = header.findIndex(h => h.includes('epost') || h.includes('email') || h.includes('mail'))
      const roleIdx  = header.findIndex(h => h.includes('roll') || h.includes('role'))
      const groupIdx = header.findIndex(h => h.includes('grupp') || h.includes('group'))
      const mapped = parsed.slice(1).map(row => ({
        name:  nameIdx  >= 0 ? row[nameIdx]  : '',
        email: emailIdx >= 0 ? row[emailIdx] : '',
        role:  roleIdx  >= 0 ? row[roleIdx]  : 'ideell',
        group: groupIdx >= 0 ? row[groupIdx] : '',
      })).filter(r => r.name && r.email)
      setRows(mapped)
      setDone(0)
      setErrors([])
    }
    reader.readAsText(file, 'utf-8')
  }

  const roleMap: Record<string, string> = {
    ideell: 'ideell', volunteer: 'ideell',
    anstalld: 'anstalld', anställd: 'anstalld', employee: 'anstalld',
    fadmin: 'fadmin', församlingsadmin: 'fadmin',
    padmin: 'padmin', pastoratsadmin: 'padmin',
  }

  const importAll = async () => {
    const validRows = rows.filter(r => r.name && r.email && r.email.includes('@'))
    if (!validRows.length) { alert('Inga giltiga rader med namn och e-post hittades.'); return }
    setLoading(true)
    setErrors([])
    let ok = 0
    const errs: string[] = []
    for (const row of validRows) {
      const role = roleMap[row.role?.toLowerCase()] ?? 'ideell'
      const groupObj = groups.find(g => g.label.toLowerCase() === (row.group || '').toLowerCase())
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.name, email: row.email, role, church_id: churchId }),
      })
      const data = await res.json()
      if (res.ok) ok++
      else errs.push(`${row.name} (${row.email}): ${data.error}`)
    }
    setDone(ok)
    setErrors(errs)
    setRows([])
    setLoading(false)
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="Users" size={18} style={{ color: '#7D0037' }} />Importera personer</h3>
        <button className="btn btn-secondary btn-sm" onClick={mall}><Icon name="Download" size={18} />Ladda ned mall</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`filter-btn${tab === 'paste' ? ' on' : ''}`} onClick={() => setTab('paste')} aria-pressed={tab === 'paste'}>Klistra in</button>
        <button className={`filter-btn${tab === 'file' ? ' on' : ''}`} onClick={() => setTab('file')} aria-pressed={tab === 'file'}>CSV-fil</button>
      </div>

      {tab === 'paste' ? (
        <>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginBottom: 8 }}>
            Kopiera rader från Excel/Google Sheets och klistra in här. Kolumnordning: <strong style={{ fontWeight: 500 }}>namn, e-post, roll, grupp</strong>
          </p>
          <textarea
            aria-label="Rader att importera"
            style={{ width: '100%', height: 100, fontSize: 13, fontFamily: 'monospace', padding: 8, border: '1.5px solid rgba(125,0,55,0.35)', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
            placeholder={'Anna Svensson\tanna@kyrka.se\tideell\tDomkyrkans vänner\nErik Johansson\terik@kyrka.se\tanstalld'}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onPaste} disabled={!pasteText.trim()}>Förhandsgranska</button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginBottom: 8 }}>
            Ladda upp en CSV med kolumnerna: <strong style={{ fontWeight: 500 }}>namn, epost, roll, grupp</strong>
          </p>
          <input ref={fileRef} type="file" accept=".csv" aria-label="Välj CSV-fil" style={{ display: 'none' }} onChange={onFile} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Icon name="Upload" size={18} />Välj CSV-fil</button>
        </>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="alert alert-blue" style={{ marginBottom: 8 }}>
            {rows.length} personer hittade i filen
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(125,0,55,0.18)', borderRadius: 8, marginBottom: 10 }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'rgba(125,0,55,0.06)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Namn</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>E-post</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Roll</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Grupp</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid rgba(125,0,55,0.18)' }}>
                    <td style={{ padding: '5px 10px' }}>{r.name}</td>
                    <td style={{ padding: '5px 10px' }}>{r.email}</td>
                    <td style={{ padding: '5px 10px' }}>{r.role}</td>
                    <td style={{ padding: '5px 10px' }}>{r.group}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" onClick={importAll} disabled={loading}>
            {loading ? 'Importerar...' : `Importera ${rows.length} personer`}
          </button>
        </div>
      )}

      {done > 0 && <div role="status" className="alert alert-green" style={{ marginTop: 10 }}><Icon name="Check" size={18} />{done} personer importerade och inbjudna</div>}
      {errors.map((e, i) => <div key={i} className="alert alert-red" style={{ marginTop: 6, fontSize: 13 }}>{e}</div>)}
    </div>
  )
}

function ImportPass({ churchId, groups }: { churchId: number; groups: { id: string; label: string }[] }) {
  const { reloadPasses } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [pasteText, setPasteText] = useState('')
  const [tab, setTab] = useState<'paste' | 'file'>('paste')

  const mall = () => downloadCSV('mall-pass.csv', [
    ['titel', 'datum', 'tid', 'plats', 'platser', 'vaktmastare', 'telefon', 'grupp'],
    ['Gudstjänst', '2026-06-15', '10:00', 'Domkyrkan', '5', 'Anna Svensson', '073-123456', groups[0]?.label || ''],
    ['Café', '2026-06-16', '14:00', 'Församlingshuset', '3', '', '', ''],
  ])

  const onPaste = () => {
    const parsed = parsePaste(pasteText, 'pass')
    if (!parsed.length) { alert('Inga rader hittades. Kontrollera att du klistrat in data.'); return }
    setRows(parsed)
    setDone(0)
    setErrors([])
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCSV(ev.target?.result as string)
      if (parsed.length < 2) return
      const header = parsed[0].map(h => h.toLowerCase().replace(/\s/g, ''))
      const idx = (keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)))
      const mapped = parsed.slice(1).map(row => ({
        title: row[idx(['titel', 'title', 'namn'])] || '',
        date:  row[idx(['datum', 'date'])] || '',
        time:  row[idx(['tid', 'time'])] || '',
        plats: row[idx(['plats', 'place', 'lokal'])] || '',
        spots: row[idx(['platser', 'spots', 'antal'])] || '5',
        vk:    row[idx(['vakt', 'vk', 'ansvarig'])] || '',
        tel:   row[idx(['tel', 'phone', 'mobil'])] || '',
        group: row[idx(['grupp', 'group'])] || '',
      })).filter(r => r.title && r.date)
      setRows(mapped)
      setDone(0)
      setErrors([])
    }
    reader.readAsText(file, 'utf-8')
  }

  const [progress, setProgress] = useState(0)

  const importAll = async () => {
    setLoading(true)
    setErrors([])
    setProgress(0)
    let ok = 0
    const errs: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const groupObj = groups.find(g => g.label.toLowerCase() === row.group.toLowerCase())
      const res = await fetch('/api/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: row.title, church_id: churchId,
          date_str: row.date, time_str: row.time,
          plats: row.plats, spots: parseInt(row.spots) || 5,
          vk: row.vk, tel: row.tel,
          pub_status: 'live',
          groups: groupObj ? [groupObj.id] : [],
        }),
      })
      const data = await res.json()
      if (res.ok) ok++
      else errs.push(`${row.title}: ${data.error}`)
      setProgress(i + 1)
    }
    setDone(ok)
    setErrors(errs)
    setRows([])
    setLoading(false)
    if (ok > 0) await reloadPasses()
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="Calendar" size={18} style={{ color: '#7D0037' }} />Importera pass</h3>
        <button className="btn btn-secondary btn-sm" onClick={mall}><Icon name="Download" size={18} />Ladda ned mall</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`filter-btn${tab === 'paste' ? ' on' : ''}`} onClick={() => setTab('paste')} aria-pressed={tab === 'paste'}>Klistra in</button>
        <button className={`filter-btn${tab === 'file' ? ' on' : ''}`} onClick={() => setTab('file')} aria-pressed={tab === 'file'}>CSV-fil</button>
      </div>

      {tab === 'paste' ? (
        <>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginBottom: 8 }}>
            Kopiera rader från Excel/Google Sheets. Kolumnordning: <strong style={{ fontWeight: 500 }}>titel, datum (ÅÅÅÅ-MM-DD), tid, plats, platser, vaktmästare, telefon, grupp</strong>
          </p>
          <textarea
            aria-label="Rader att importera"
            style={{ width: '100%', height: 100, fontSize: 13, fontFamily: 'monospace', padding: 8, border: '1.5px solid rgba(125,0,55,0.35)', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
            placeholder={'Gudstjänst\t2026-06-15\t10:00\tDomkyrkan\t5\tAnna\t073-123\tDomkyrkans vänner'}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onPaste} disabled={!pasteText.trim()}>Förhandsgranska</button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginBottom: 8 }}>
            Ladda upp en CSV med kolumnerna: <strong style={{ fontWeight: 500 }}>titel, datum (ÅÅÅÅ-MM-DD), tid, plats, platser, vaktmastare, telefon, grupp</strong>
          </p>
          <input ref={fileRef} type="file" accept=".csv" aria-label="Välj CSV-fil" style={{ display: 'none' }} onChange={onFile} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Icon name="Upload" size={18} />Välj CSV-fil</button>
        </>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="alert alert-blue" style={{ marginBottom: 8 }}>
            {rows.length} pass hittade i filen
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(125,0,55,0.18)', borderRadius: 8, marginBottom: 10 }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'rgba(125,0,55,0.06)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Titel</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Datum</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Tid</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Plats</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Platser</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 500 }}>Grupp</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid rgba(125,0,55,0.18)' }}>
                    <td style={{ padding: '5px 10px' }}>{r.title}</td>
                    <td style={{ padding: '5px 10px' }}>{r.date}</td>
                    <td style={{ padding: '5px 10px' }}>{r.time}</td>
                    <td style={{ padding: '5px 10px' }}>{r.plats}</td>
                    <td style={{ padding: '5px 10px' }}>{r.spots}</td>
                    <td style={{ padding: '5px 10px' }}>{r.group}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" onClick={importAll} disabled={loading}>
            {loading ? `Importerar... ${progress} av ${rows.length}` : `Importera ${rows.length} pass`}
          </button>
          {loading && (
            <div style={{ marginTop: 10, background: 'rgba(125,0,55,0.06)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
              <div style={{ background: '#7D0037', height: '100%', width: `${(progress / rows.length) * 100}%`, transition: 'width 0.3s ease' }} />
            </div>
          )}
        </div>
      )}

      {done > 0 && <div role="status" className="alert alert-green" style={{ marginTop: 10 }}><Icon name="Check" size={18} />{done} pass skapade</div>}
      {errors.map((e, i) => <div key={i} className="alert alert-red" style={{ marginTop: 6, fontSize: 13 }}>{e}</div>)}
    </div>
  )
}

export default function ExporteraPage() {
  const { passes, people, churches, groups, currentChurchId, isPAdmin, isSuperAdmin, activeChurch, setChurch } = useApp()
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
      ...churchPeople.map(p => [p.name, p.mail || '', p.phone || '', p.role, churches.find(c => c.id === p.church)?.name || '']),
    ]
    downloadCSV(`personal-${new Date().toISOString().slice(0,10)}.csv`, rows)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Import <span className="serif">och</span> export</h1>
        <p className="page-sub">Importera och exportera data</p>
      </div>

      {(isPAdmin() || isSuperAdmin()) && (
        <div className="church-bar" style={{ marginBottom: 16 }}>
          {churches.map((c, i) => (
            <button key={i} className={`church-btn${activeChurch === i ? ' on' : ''}`} onClick={() => setChurch(i)}>{c.name}</button>
          ))}
        </div>
      )}

      <h2 className="section-label">Importera</h2>
      <ImportPersoner churchId={cid} groups={groups} />
      <ImportPass churchId={cid} groups={groups} />

      <h2 className="section-label">Exportera</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={exportBkgsCSV}><Icon name="Spreadsheet" size={18} />Exportera bokningar (CSV)</button>
        <button className="btn btn-secondary" onClick={exportPeopleCSV}><Icon name="Users" size={18} />Exportera personal (CSV)</button>
      </div>

      <h2 className="section-label">Bokningslista ({allBkgs.length} poster)</h2>
      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        {allBkgs.length === 0 ? (
          <div className="empty-state">Inga bokningar ännu.</div>
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
              {allBkgs.length > 15 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'rgba(0,0,0,0.72)', fontSize: 14 }}>och {allBkgs.length - 15} till</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
