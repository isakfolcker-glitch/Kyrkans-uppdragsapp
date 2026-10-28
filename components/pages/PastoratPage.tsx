'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'
import ConfirmModal from '@/components/modals/ConfirmModal'

interface Kyrka { id: number; name: string; address?: string; forsamling_id: number }

function AddPastoratModal() {
  const { closeModal, addPastorat, nextPastoratId } = useApp()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim()) return alert('Namn krävs')
    setSaving(true)
    try {
      await addPastorat({ id: nextPastoratId(), name: name.trim(), admin: '', adminEmail: '', churches: [] })
      closeModal()
    } finally { setSaving(false) }
  }
  return <>
    <h2 className="modal-title">Nytt pastorat</h2>
    <div className="form-field"><label htmlFor="pastorat-name">Namn</label>
      <input id="pastorat-name" value={name} onChange={e => setName(e.target.value)} placeholder="Exempel: Växjö pastorat" autoFocus /></div>
    <p>Efter att pastoratet skapats kan du koppla befintliga församlingar till det.</p>
    <div className="modal-footer"><button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
      <button className="btn btn-primary" disabled={saving} onClick={save}>Skapa pastorat</button></div>
  </>
}

function EditPastoratModal({ id }: { id: number }) {
  const { pastorat, closeModal, updatePastorat } = useApp()
  const p = pastorat.find(x => x.id === id)
  const [name, setName] = useState(p?.name ?? '')
  if (!p) return null
  const save = async () => {
    if (!name.trim()) return alert('Namn krävs')
    await updatePastorat({ ...p, name: name.trim() })
    closeModal()
  }
  return <>
    <h2 className="modal-title">Redigera pastorat</h2>
    <div className="form-field"><label htmlFor="pastorat-edit">Namn</label>
      <input id="pastorat-edit" value={name} onChange={e => setName(e.target.value)} /></div>
    <div className="modal-footer"><button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
      <button className="btn btn-primary" onClick={save}>Spara</button></div>
  </>
}

export default function PastoratPage() {
  const { pastorat, churches, showModal, deletePastorat, updateChurch, isSuperAdmin, isPAdmin, currentChurchId, goTo } = useApp()
  const [kyrkor, setKyrkor] = useState<Kyrka[]>([])
  const [selectedChurch, setSelectedChurch] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const ownPastoratId = churches.find(c => c.id === currentChurchId())?.pastoratId
  const systemAdmin = isSuperAdmin()
  const visiblePastorat = systemAdmin ? pastorat : isPAdmin() ? pastorat.filter(p => p.id === ownPastoratId) : []

  useEffect(() => {
    fetch('/api/kyrkor').then(async response => {
      if (!response.ok) return
      const data: unknown = await response.json()
      if (Array.isArray(data)) setKyrkor(data as Kyrka[])
    }).catch(() => {})
  }, [])

  async function changePastorat(churchId: number, pastoratId: number) {
    setBusy(churchId)
    try {
      const res = await fetch(`/api/churches/${churchId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastorat_id: pastoratId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunde inte koppla församlingen')
      const idx = churches.findIndex(c => c.id === churchId)
      if (idx !== -1) updateChurch(idx, { ...churches[idx], pastoratId })
      setSelectedChurch(prev => ({ ...prev, [pastoratId]: '' }))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Kunde inte spara kopplingen')
    } finally { setBusy(null) }
  }

  return <div>
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      <div><h1 className="page-title">Pastorat</h1><p className="page-sub">Pastorat, församlingar och kyrkor</p></div>
      {systemAdmin && <button className="btn btn-primary" onClick={() => showModal(<AddPastoratModal />)}><Icon name="Plus" size={18}/>Nytt pastorat</button>}
    </div>
    {visiblePastorat.length === 0 && <div className="empty-state">Inget pastorat att visa.</div>}
    {visiblePastorat.map(p => {
      const congregations = churches.filter(c => c.pastoratId === p.id)
      const unassigned = churches.filter(c => c.pastoratId == null)
      return <section key={p.id} className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div><h2 style={{ fontSize: 20, fontWeight: 600 }}>{p.name}</h2>
            <p className="page-sub">{congregations.length} församlingar</p></div>
          {systemAdmin && <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditPastoratModal id={p.id} />)}><Icon name="Pencil" size={18}/>Redigera</button>
            <button className="btn btn-danger btn-sm" disabled={congregations.length > 0} onClick={() => showModal(
              <ConfirmModal title={`Ta bort ${p.name}?`} sub="Pastoratet tas bort." confirmLabel="Ta bort" onConfirm={() => deletePastorat(p.id)} />
            )}><Icon name="Trash" size={18}/>Ta bort</button>
          </div>}
        </div>
        {congregations.length === 0 && <p>Inga församlingar kopplade ännu.</p>}
        {congregations.map(church => {
          const buildings = kyrkor.filter(k => k.forsamling_id === church.id)
          return <div key={church.id} className="row-line" style={{ padding: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="BuildingChurch" size={20}/>
              <strong>{church.name}</strong>
            </div>
            <div style={{ paddingLeft: 28 }}>
              {buildings.length === 0 ? <p className="page-sub">Inga kyrkor registrerade</p> : buildings.map(k =>
                <div key={k.id} style={{ padding: '6px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="BuildingChurch" size={16}/><span>{k.name}</span>
                  {k.address && <span className="page-sub">{k.address}</span>}
                </div>)}
            </div>
          </div>
        })}
        {systemAdmin && <div className="row-line" style={{ paddingTop: 12 }}>
          <label htmlFor={`attach-${p.id}`} style={{ display: 'block', marginBottom: 8 }}>Koppla befintlig församling</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select id={`attach-${p.id}`} value={selectedChurch[p.id] ?? ''} onChange={e => setSelectedChurch(prev => ({ ...prev, [p.id]: e.target.value }))}>
              <option value="">Välj församling utan pastorat</option>
              {unassigned.map(church => <option key={church.id} value={church.id}>{church.name}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" disabled={!selectedChurch[p.id] || busy !== null}
              onClick={() => changePastorat(Number(selectedChurch[p.id]), p.id)}>Koppla församling</button>
          </div>
          <p className="page-sub">För att flytta en församling från ett annat pastorat, redigera dess pastoratstillhörighet under Församlingar.</p>
        </div>}
      </section>
    })}
    {(systemAdmin || isPAdmin()) && <button className="btn btn-secondary" onClick={() => goTo('forsamlingar')}>Visa och administrera församlingar</button>}
  </div>
}
