export function downloadCSV(filename: string, rows: string[][]) {
  const content = rows.map(r => r.map(cell => `"${(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function parseCSV(text: string): string[][] {
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

export function parsePaste(text: string, type: 'person' | 'pass') {
  const lines = text.trim().split('\n').filter(l => l.trim())
  const sep = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(';') ? ';' : ','
  return lines.map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    if (type === 'person') return { name: cols[0] || '', email: cols[1] || '', role: cols[2] || 'ideell', group: cols[3] || '' }
    return { title: cols[0] || '', date: cols[1] || '', time: cols[2] || '', plats: cols[3] || '', spots: cols[4] || '5', vk: cols[5] || '', tel: cols[6] || '', group: cols[7] || '' }
  })
}
