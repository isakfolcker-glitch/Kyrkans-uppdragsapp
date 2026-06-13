'use client'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/appStore'
import { PassMessage } from '@/types'

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

export default function PassQASection({ passId }: { passId: number }) {
  const { currentUser, profile, passes, isResponsible, isAdmin } = useApp()
  const pass = passes.find(p => p.id === passId)

  const [messages, setMessages] = useState<PassMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const staffMode = pass ? (isAdmin() || isResponsible(pass)) : false

  useEffect(() => {
    setLoading(true)
    fetch(`/api/passes/${passId}/messages`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setMessages(data.map(m => ({
            id: m.id, passId: m.pass_id, authorId: m.author_id,
            authorName: m.author_name, body: m.body,
            isStaffReply: m.is_staff_reply, createdAt: m.created_at,
          })))
        }
      })
      .finally(() => setLoading(false))
  }, [passId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!body.trim() || sending) return
    setSending(true)
    const res = await fetch(`/api/passes/${passId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, is_staff_reply: staffMode }),
    })
    const data = await res.json()
    if (res.ok) {
      setMessages(prev => [...prev, {
        id: data.id, passId: data.pass_id, authorId: data.author_id,
        authorName: data.author_name, body: data.body,
        isStaffReply: data.is_staff_reply, createdAt: data.created_at,
      }])
      setBody('')
    }
    setSending(false)
  }

  if (!currentUser) return null

  return (
    <div style={{ marginTop: 20 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>
        Frågor &amp; svar
        {messages.length > 0 && (
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: '#888780' }}>
            ({messages.length})
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: '#888780', padding: '8px 0' }}>Laddar…</div>
      ) : messages.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888780', textAlign: 'center', padding: '12px 0' }}>
          Inga frågor ännu. Skriv gärna om du undrar något!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
          {messages.map(m => (
            <div
              key={m.id}
              style={{
                background: m.isStaffReply ? '#F0EDFF' : '#F7F6F1',
                border: m.isStaffReply ? '1px solid #C8C2F5' : '1px solid #E8E5DC',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2A' }}>{m.authorName}</span>
                {m.isStaffReply && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, background: '#7C6FE0', color: '#fff',
                    borderRadius: 4, padding: '1px 5px', letterSpacing: 0.3,
                  }}>Svar</span>
                )}
                <span style={{ fontSize: 11, color: '#888780', marginLeft: 'auto' }}>{fmt(m.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: '#3C3A34', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={staffMode ? 'Skriv ett svar…' : 'Skriv en fråga…'}
          rows={2}
          style={{
            flex: 1, resize: 'none', borderRadius: 8,
            border: '1px solid #E8E5DC', padding: '8px 10px',
            fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          className="btn btn-purple btn-sm"
          onClick={send}
          disabled={!body.trim() || sending}
          style={{ alignSelf: 'flex-end', minWidth: 64 }}
        >
          {sending ? '…' : staffMode ? 'Svara' : 'Fråga'}
        </button>
      </div>
      {staffMode && (
        <div style={{ fontSize: 11, color: '#7C6FE0', marginTop: 4 }}>
          Du svarar som ansvarig — ditt svar visas med "Svar"-badge för alla.
        </div>
      )}
    </div>
  )
}
