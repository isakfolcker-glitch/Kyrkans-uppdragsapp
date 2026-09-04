'use client'
import { useState, useRef } from 'react'
import { useApp } from '@/lib/appStore'

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
  const sep = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(';') ? ';' : ','
  return lines.map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    if (type === 'person') return { name: cols[0] || '', email: cols[1] || '', role: cols[2] || 'ideell', group: cols[3] || '' }
    return { title: cols[0] || '', date: cols[1] || '', time: cols[2] || '', plats: cols[3] || '', spots: cols[4] || '5', vk: cols[5] || '', tel: cols[6] || '', group: cols[7] || '' }
  })
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
    <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>👥 Importera personer</div>
        <button className="btn btn-secondary btn-sm" onClick={mall}>⬇ Ladda ned mall</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className={`filter-btn${tab === 'paste' ? ' on' : ''}`} onClick={() => setTab('paste')}>📋 Klistra in</button>
        <button className={`filter-btn${tab === 'file' ? ' on' : ''}`} onClick={() => setTab('file')}>📂 CSV-fil</button>
      </div>

      {tab === 'paste' ? (
        <>
          <p style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 8 }}>
            Kopiera rader från Excel/Google Sheets och klistra in här. Kolumnordning: <strong>namn → e-post → roll → grupp</strong>
          </p>
          <textarea
            style={{ width: '100%', height: 100, fontSize: 12, fontFamily: 'monospace', padding: 8, border: '1.5px solid #D3D1C7', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
            placeholder={'Anna Svensson\tanna@kyrka.se\tideell\tDomkyrkans vänner\nErik Johansson\terik@kyrka.se\tanstalld'}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onPaste} disabled={!pasteText.trim()}>Förhandsgranska</button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 8 }}>
            Ladda upp en CSV med kolumnerna: <strong>namn, epost, roll, grupp</strong>
          </p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFile} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>📂 Välj CSV-fil</button>
        </>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="alert alert-blue" style={{ marginBottom: 8 }}>
            {rows.length} personer hittade i filen
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E3DC', borderRadius: 8, marginBottom: 10 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F1EFE8' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Namn</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>E-post</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Roll</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Grupp</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #E5E3DC' }}>
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
            {loading ? 'Importerar...' : `✓ Importera ${rows.length} personer`}
          </button>
        </div>
      )}

      {done > 0 && <div className="alert alert-green" style={{ marginTop: 10 }}>✓ {done} personer importerade och inbjudna</div>}
      {errors.map((e, i) => <div key={i} className="alert alert-red" style={{ marginTop: 6, fontSize: 12 }}>{e}</div>)}
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
  const [progress, setProgress] = useState(0)

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
    <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>📅 Importera pass</div>
        <button className="btn btn-secondary btn-sm" onClick={mall}>⬇ Ladda ned mall</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className={`filter-btn${tab === 'paste' ? ' on' : ''}`} onClick={() => setTab('paste')}>📋 Klistra in</button>
        <button className={`filter-btn${tab === 'file' ? ' on' : ''}`} onClick={() => setTab('file')}>📂 CSV-fil</button>
      </div>

      {tab === 'paste' ? (
        <>
          <p style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 8 }}>
            Kopiera rader från Excel/Google Sheets. Kolumnordning: <strong>titel → datum (ÅÅÅÅ-MM-DD) → tid → plats → platser → vaktmästare → telefon → grupp</strong>
          </p>
          <textarea
            style={{ width: '100%', height: 100, fontSize: 12, fontFamily: 'monospace', padding: 8, border: '1.5px solid #D3D1C7', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
            placeholder={'Gudstjänst\t2026-06-15\t10:00\tDomkyrkan\t5\tAnna\t073-123\tDomkyrkans vänner'}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onPaste} disabled={!pasteText.trim()}>Förhandsgranska</button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 8 }}>
            Ladda upp en CSV med kolumnerna: <strong>titel, datum (ÅÅÅÅ-MM-DD), tid, plats, platser, vaktmastare, telefon, grupp</strong>
          </p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFile} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>📂 Välj CSV-fil</button>
        </>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="alert alert-blue" style={{ marginBottom: 8 }}>
            {rows.length} pass hittade i filen
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E3DC', borderRadius: 8, marginBottom: 10 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F1EFE8' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Titel</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Datum</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Tid</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Plats</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Platser</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Grupp</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #E5E3DC' }}>
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
            {loading ? `Importerar... ${progress}/${rows.length}` : `✓ Importera ${rows.length} pass`}
          </button>
          {loading && (
            <div style={{ marginTop: 10, background: '#F1EFE8', borderRadius: 8, height: 8, overflow: 'hidden' }}>
              <div style={{ background: '#7D0037', height: '100%', width: `${(progress / rows.length) * 100}%`, transition: 'width 0.3s ease' }} />
            </div>
          )}
        </div>
      )}

      {done > 0 && <div className="alert alert-green" style={{ marginTop: 10 }}>✓ {done} pass skapade</div>}
      {errors.map((e, i) => <div key={i} className="alert alert-red" style={{ marginTop: 6, fontSize: 12 }}>{e}</div>)}
    </div>
  )
}

export default function ImporteraPage() {
  const { groups, currentChurchId, isPAdmin, isSuperAdmin, activeChurch, setChurch, churches } = useApp()
  const cid = currentChurchId()

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Importera</h1>
        <p className="page-sub">Importera personal och pass från CSV eller Excel</p>
      </div>

      {(isPAdmin() || isSuperAdmin()) && (
        <div className="church-bar" style={{ marginBottom: 16 }}>
          {churches.map((c, i) => (
            <button key={i} className={`church-btn${activeChurch === i ? ' on' : ''}`} onClick={() => setChurch(i)}>{c.name}</button>
          ))}
        </div>
      )}

      <ImportPersoner churchId={cid} groups={groups} />
      <ImportPass churchId={cid} groups={groups} />
    </div>
  )
}
