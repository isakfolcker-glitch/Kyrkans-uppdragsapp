'use client'
import { useState } from 'react'
import { DemoProvider } from '@/lib/demoStore'
import AppShell from '@/components/layout/AppShell'
import AuthCard from '@/components/layout/AuthCard'
import Icon from '@/components/ui/Icon'

const ROLES = [
  {
    index: 0,
    label: 'Ideell',
    name: 'Maria Lindström',
    desc: 'Kyrkvärdsvolontär som anmäler sig till pass',
    ini: 'ML', av: '#FFC3AA', ac: '#7D0037',
  },
  {
    index: 1,
    label: 'Ansvarig',
    name: 'Johan Eriksson',
    desc: 'Anställd som är ansvarig för gudstjänster',
    ini: 'JE', av: '#F3E3CC', ac: '#7D0037',
  },
  {
    index: 2,
    label: 'Admin',
    name: 'Sarah Björk',
    desc: 'Pastoratsadministratör med full behörighet',
    ini: 'SB', av: '#FFEBE1', ac: '#7D0037',
  },
]

export default function DemoPage() {
  const [activeRole, setActiveRole] = useState<number | null>(null)

  if (activeRole === null) {
    return (
      <AuthCard wide title={<>Prova <span className="serif">demot</span></>} lead="Välj en roll för att utforska appen. All data är påhittad och inget sparas.">
        <ul style={{ listStyle: 'none' }}>
          {ROLES.map(role => (
            <li key={role.index}>
              <button type="button" className="pick-row" onClick={() => setActiveRole(role.index)}>
                <span aria-hidden="true" style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: role.av, color: role.ac,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 500, fontSize: 15, flexShrink: 0,
                }}>
                  {role.ini}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 500, color: '#000', fontSize: 16 }}>{role.label}, {role.name}</span>
                  <span style={{ color: 'rgba(0,0,0,0.72)', fontSize: 15 }}>{role.desc}</span>
                </span>
                <Icon name="ChevronRight" style={{ color: '#7D0037' }} />
              </button>
            </li>
          ))}
        </ul>

        <p style={{ color: 'rgba(0,0,0,0.72)', fontSize: 15, marginTop: 20 }}>
          Du kan byta roll när som helst inne i appen, längst ned i sidomenyn eller under Mer på mobilen.
        </p>
      </AuthCard>
    )
  }

  return (
    <DemoProvider key={activeRole} initialIndex={activeRole}>
      {/* Demoremsa överst, i flödet så att den inte täcker appen */}
      <div role="region" aria-label="Demoläge" className="demo-strip">
        <span className="demo-strip-text">
          <strong style={{ fontWeight: 500 }}>Demoläge</strong>
          <span className="demo-long">. Ingen data sparas. Byt roll längst ned i menyn.</span>
          <span className="demo-short">, inget sparas</span>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveRole(null)}>
          <Icon name="X" size={18} />Avsluta<span className="demo-long"> demo</span>
        </button>
      </div>

      <AppShell />
    </DemoProvider>
  )
}
