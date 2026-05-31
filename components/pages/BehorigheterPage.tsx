'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { roleLabel } from '@/lib/appData'

function PermModal({ personId }: { personId: number }) {
  const { people, passes, closeModal, updatePerson, updatePass, isPAdmin, isSuperAdmin, u } = useApp()
  const p = people.find(x => x.id === personId)
  if (!p) return null
  const [isEmp, setIsEmp] = useState(p.isEmployee)
  const [lvl, setLvl] = useState(p.adminLevel)
  const myPasses = passes.filter(x => x.church === p.church)
  const [respPasses, setRespPasses] = useState<number[]>(
    myPasses.filter(x => x.responsibleUserIds.includes(personId)).map(x => x.id)
  )
  const togglePass = (id: number) => setRespPasses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const save = () => {
    updatePerson({ ...p, isEmployee: isEmp, adminLevel: lvl as any, role: lvl === 'pastorat' ? 'padmin' : lvl === 'forsamling' ? 'fadmin' : isEmp ? 'anstalld' : 'ideell' })
    myPasses.forEach(pass => {
      const hasResp = respPasses.includes(pass.id)
      const curResp = pass.responsibleUserIds.includes(personId)
      if (hasResp !== curResp) {
        updatePass({ ...pass, responsibleUserIds: hasResp ? [...pass.responsibleUserIds, personId] : pass.responsibleUserIds.filter(id => id !== personId) })
      }
    })
    closeModal()
  }

  const canFAdmin = isPAdmin() || isSuperAdmin() || (u().adminLevel === 'forsamling' && u().churches.includes(p.church))
  const canPAdmin = isPAdmin() || isSuperAdmin()

  return (
    <>
      <div className="modal-title">🛡 Behörighet – {p.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#F1EFE8', borderRadius: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.av, color: p.ac, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{p.ini}</div>
        <div><div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{p.name}</div><div style={{ fontSize: 12, color: '#888780' }}>{p.mail}</div></div>
      </div>
      <div className="form-field">
        <label>Anställd?</label>
        <select value={isEmp ? 'true' : 'false'} onChange={e => setIsEmp(e.target.value === 'true')}>
          <option value="false">Nej – ideell</option><option value="true">Ja – anställd</option>
        </select>
      </div>
      <div className="form-field">
        <label>Adminnivå</label>
        <select value={lvl} onChange={e => setLvl(e.target.value as any)}>
          <option value="none">Ingen</option>
          {canFAdmin && <option value="forsamling">Församlingsadmin</option>}
          {canPAdmin && <option value="pastorat">Pastoratsadmin</option>}
        </select>
      </div>
      <div className="form-field">
        <label>Ansvarig för pass</label>
        <div style={{ background: '#F1EFE8', borderRadius: 8, padding: 10, maxHeight: 140, overflowY: 'auto' }}>
          {myPasses.map(x => (
            <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={respPasses.includes(x.id)} onChange={() => togglePass(x.id)} />
              <span style={{ fontSize: 12 }}>{x.title} ({x.date})</span>
            </label>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>✓ Spara</button>
      </div>
    </>
  )
}

export default function BehorigheterPage() {
  const { people, churches, isPAdmin, u, showModal } = useApp()
  const viewChurches = isPAdmin() ? [0, 1, 2, 3] : u().churches
  return (
    <div>
      <div className="page-header"><h1 className="page-title">Behörigheter</h1><p className="page-sub">Ändra roller och ansvarspass</p></div>
      {viewChurches.map(ci => {
        const pp = people.filter(p => p.church === ci)
        if (!pp.length) return null
        return (
          <div key={ci}>
            <div className="section-label" style={{ marginTop: ci ? 16 : 0 }}>{churches[ci]?.name}</div>
            <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '12px 16px', marginBottom: 10 }}>
              <div className="person-list">
                {pp.map(p => {
                  const [rl, rc, rb] = roleLabel(p)
                  return (
                    <div key={p.id} className="person-row">
                      <div className="person-av" style={{ background: p.av, color: p.ac }}>{p.ini}</div>
                      <div className="person-info">
                        <div className="person-name">{p.name}</div>
                        <div className="person-email">{p.mail}</div>
                        <div className="person-tags"><span className="role-tag" style={{ background: rb, color: rc }}>{rl}</span></div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => showModal(<PermModal personId={p.id} />)}>🛡 Ändra</button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
