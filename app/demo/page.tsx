'use client'
import { useState } from 'react'
import { DemoProvider } from '@/lib/demoStore'
import AppShell from '@/components/layout/AppShell'

const ROLES = [
  {
    index: 0,
    label: 'Ideell',
    name: 'Maria Lindström',
    desc: 'Kyrkvärdsvolontär som anmäler sig till pass',
    ini: 'ML', av: '#EEEDFE', ac: '#3C3489',
  },
  {
    index: 1,
    label: 'Ansvarig',
    name: 'Johan Eriksson',
    desc: 'Anställd som är ansvarig för gudstjänster',
    ini: 'JE', av: '#FFF0E5', ac: '#633806',
  },
  {
    index: 2,
    label: 'Admin',
    name: 'Sarah Björk',
    desc: 'Pastoratsadministratör med full behörighet',
    ini: 'SB', av: '#E6F5F0', ac: '#085041',
  },
]

export default function DemoPage() {
  const [activeRole, setActiveRole] = useState<number | null>(null)

  if (activeRole === null) {
    return (
      <div style={{
        minHeight: '100vh', background: '#F7F6F1',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ maxWidth: 460, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>⛪</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2C2C2A', margin: 0 }}>
              Kyrkans uppdragsapp
            </h1>
            <p style={{ color: '#5F5E5A', marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
              Välj en roll för att utforska appen. All data är fiktiv — inget sparas.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ROLES.map(role => (
              <button
                key={role.index}
                onClick={() => setActiveRole(role.index)}
                style={{
                  background: '#fff', border: '1.5px solid rgba(0,0,0,0.09)',
                  borderRadius: 14, padding: '15px 18px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: role.av, color: role.ac,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {role.ini}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#2C2C2A', fontSize: 15 }}>
                    {role.label} – {role.name}
                  </div>
                  <div style={{ color: '#888780', fontSize: 13, marginTop: 2 }}>{role.desc}</div>
                </div>
                <div style={{ marginLeft: 'auto', color: '#C7C4BC', fontSize: 18 }}>›</div>
              </button>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: '#B8B6AD', fontSize: 12, marginTop: 28 }}>
            Du kan byta roll när som helst inne i appen genom att klicka på användaren i sidomenyn.
          </p>
        </div>
      </div>
    )
  }

  return (
    <DemoProvider key={activeRole} initialIndex={activeRole}>
      {/* Demo-banner */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#412B72', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '5px 14px', fontSize: 12,
      }}>
        <span style={{ opacity: 0.7, flexShrink: 0 }}>Demo-läge</span>
        <span style={{ opacity: 0.35, flexShrink: 0 }}>|</span>
        <span style={{ flex: 1, opacity: 0.7, fontSize: 11 }}>
          Klicka på användaren i sidomenyn för att byta roll · Ingen data sparas
        </span>
        <button
          onClick={() => setActiveRole(null)}
          style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff', borderRadius: 6, padding: '3px 10px',
            fontSize: 11, cursor: 'pointer', flexShrink: 0,
          }}
        >
          ✕ Avsluta
        </button>
      </div>

      {/* App-innehållet med lite top-padding för bannern */}
      <div style={{ paddingTop: 30 }}>
        <AppShell />
      </div>
    </DemoProvider>
  )
}
