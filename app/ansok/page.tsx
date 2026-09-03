'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Church = { id: number; name: string }

export default function AnsokPage() {
  return (
    <Suspense fallback={<div style={wrap}><div style={card}><div style={cross}>✝</div></div></div>}>
      <AnsokForm />
    </Suspense>
  )
}

function AnsokForm() {
  const searchParams = useSearchParams()
  const fromGoogle = searchParams.get('google') === '1'

  const [churches, setChurches] = useState<Church[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState(searchParams.get('e') ?? '')
  const [phone, setPhone] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [churchId, setChurchId] = useState<number | ''>('')
  const [ecName, setEcName] = useState('')
  const [ecPhone, setEcPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    createClient().from('churches').select('id, name').order('name').then(({ data }) => {
      if (data) { setChurches(data); if (data.length === 1) setChurchId(data[0].id) }
    })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim())  { setError('Ange ditt namn.'); return }
    if (!email.trim()) { setError('Ange din e-postadress.'); return }
    if (!phone.trim()) { setError('Ange ditt telefonnummer.'); return }
    if (!churchId)      { setError('Välj vilken församling du vill hjälpa till i.'); return }

    setLoading(true)
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        birth_year: birthYear || undefined, church_id: churchId,
        emergency_contact_name: ecName.trim(), emergency_contact_phone: ecPhone.trim(),
        message: message.trim(),
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'Något gick fel. Försök igen.'); setLoading(false); return }
    setDone(true)
    setLoading(false)
  }

  if (done) return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ ...cross, background: '#28A88E' }}>✓</div>
        <h2 style={h2}>Tack för din ansökan!</h2>
        <p style={{ color: '#5F5E5A', fontSize: 14, marginTop: 8 }}>
          Vi granskar den så snart vi kan. Du får ett mail med en länk för att skapa ditt konto när ansökan är godkänd.
        </p>
        <a href="/login" style={{ display: 'inline-block', marginTop: 20, fontSize: 13, fontWeight: 700, color: '#7D0037', textDecoration: 'none' }}>
          ← Tillbaka till inloggningen
        </a>
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ ...card, maxWidth: 480, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={cross}>✝</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#000' }}>Ansök om att bli ideell</h1>
            <p style={{ fontSize: 13, color: '#5F5E5A', marginTop: 2 }}>Fyll i formuläret så hör vi av oss.</p>
          </div>
        </div>

        {fromGoogle && (
          <div style={{ background: '#E8E0FF', border: '1px solid #8A6FB5', borderRadius: 10, padding: '10px 14px', color: '#412B72', fontSize: 13, marginBottom: 18 }}>
            Vi hittade inget konto kopplat till din Google-adress. Skicka in en ansökan nedan så återkommer vi.
          </div>
        )}

        <form onSubmit={submit}>
          <div style={field}>
            <label style={lbl}>Namn *</label>
            <input style={inp} placeholder="För- och efternamn" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={field}>
            <label style={lbl}>E-postadress *</label>
            <input style={inp} type="email" placeholder="din@mail.se" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div style={field}>
            <label style={lbl}>Mobilnummer *</label>
            <input style={inp} type="tel" placeholder="070-123 45 67" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div style={field}>
            <label style={lbl}>Födelseår</label>
            <input style={inp} type="number" placeholder="t.ex. 1990" min={1900} max={2015} value={birthYear} onChange={e => setBirthYear(e.target.value)} />
          </div>
          <div style={field}>
            <label style={lbl}>Församling *</label>
            <select style={inp} value={churchId} onChange={e => setChurchId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Välj församling…</option>
              {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ background: '#FFEBE1', borderRadius: 12, padding: 16, marginBottom: 16, borderLeft: '3px solid #7D0037' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#7D0037', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Kontaktperson i nödsituation (frivilligt)
            </p>
            <div style={field}>
              <label style={lbl}>Namn</label>
              <input style={inp} placeholder="Anna Andersson" value={ecName} onChange={e => setEcName(e.target.value)} />
            </div>
            <div style={{ ...field, marginBottom: 0 }}>
              <label style={lbl}>Telefonnummer</label>
              <input style={inp} type="tel" placeholder="070-987 65 43" value={ecPhone} onChange={e => setEcPhone(e.target.value)} />
            </div>
          </div>

          <div style={field}>
            <label style={lbl}>Vill du berätta något för oss? (frivilligt)</label>
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} placeholder="T.ex. vad du är intresserad av att hjälpa till med" value={message} onChange={e => setMessage(e.target.value)} />
          </div>

          {error && (
            <div style={{ background: '#FFC3AA', border: '1px solid #FF785A', borderRadius: 10, padding: '10px 14px', color: '#7D0037', fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
              ⚠ {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 13, background: '#7D0037', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer', boxShadow: '0 2px 10px rgba(125,0,55,0.25)', marginTop: 4,
          }}>
            {loading ? 'Skickar…' : 'Skicka ansökan →'}
          </button>
        </form>

        <a href="/login" style={{ display: 'block', marginTop: 16, fontSize: 12, color: '#5F5E5A', textAlign: 'center', textDecoration: 'none' }}>
          ← Har du redan ett konto? Logga in
        </a>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100vh', background: '#FFEBE1',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 360,
  boxShadow: '0 8px 32px rgba(125,0,55,0.12)', textAlign: 'center',
  border: '1px solid rgba(125,0,55,0.08)',
}
const cross: React.CSSProperties = {
  width: 52, height: 52, background: '#7D0037', borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: 24, margin: '0 auto', flexShrink: 0,
}
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#000', marginTop: 14 }
const field: React.CSSProperties = { marginBottom: 14 }
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#5F5E5A',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}
const inp: React.CSSProperties = {
  width: '100%', fontSize: 14, padding: '10px 13px',
  border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10,
  background: '#FFEBE1', color: '#000', outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box',
}
