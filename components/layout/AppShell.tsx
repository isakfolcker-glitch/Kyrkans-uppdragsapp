'use client'
import { useApp } from '@/lib/appStore'
import Sidebar from '@/components/layout/Sidebar'
import Modal from '@/components/ui/Modal'
import PassPage from '@/components/pages/PassPage'
import MinaAnsvarPage from '@/components/pages/MinaAnsvarPage'
import MinaBokningarPage from '@/components/pages/MinaBokningarPage'
import NotiserPage from '@/components/pages/NotiserPage'
import ProfilPage from '@/components/pages/ProfilPage'
import PersonalPage from '@/components/pages/PersonalPage'
import GrupperPage from '@/components/pages/GrupperPage'
import UtskickPage from '@/components/pages/UtskickPage'
import BehorigheterPage from '@/components/pages/BehorigheterPage'
import ExporteraPage from '@/components/pages/ExporteraPage'
import ImporteraPage from '@/components/pages/ImporteraPage'
import OversiktPage from '@/components/pages/OversiktPage'
import ForsamlingarPage from '@/components/pages/ForsamlingarPage'
import PastoratPage from '@/components/pages/PastoratPage'
import KioskPage from '@/components/pages/KioskPage'

function PageContent() {
  const { page, isKiosk } = useApp()
  if (isKiosk()) return <KioskPage />
  switch (page) {
    case 'pass':           return <PassPage />
    case 'mina-ansvar':    return <MinaAnsvarPage />
    case 'mina-bokningar': return <MinaBokningarPage />
    case 'notiser':        return <NotiserPage />
    case 'profil':         return <ProfilPage />
    case 'personal':       return <PersonalPage />
    case 'grupper':        return <GrupperPage />
    case 'utskick':        return <UtskickPage />
    case 'behorigheter':   return <BehorigheterPage />
    case 'exportera':      return <ExporteraPage />
    case 'importera':      return <ImporteraPage />
    case 'oversikt':       return <OversiktPage />
    case 'forsamlingar':   return <ForsamlingarPage />
    case 'kyrkor':         return <ForsamlingarPage />
    case 'pastorat':       return <PastoratPage />
    default:               return <PassPage />
  }
}

export default function AppShell() {
  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <main className="main-content" style={{ paddingBottom: 80 }}>
          <PageContent />
        </main>
        <Modal />
      </div>
      <BottomNav />
    </>
  )
}

function BottomNav() {
  const { page, goTo, isKiosk, isAdmin, isSuperAdmin, notifications } = useApp()
  if (isKiosk()) return null
  const unread = notifications.filter((n: any) => !n.read).length

  const items = [
    { id: 'oversikt',        icon: '🏠', lbl: 'Start' },
    { id: 'pass',            icon: '📅', lbl: 'Pass' },
    { id: 'mina-bokningar',  icon: '🔖', lbl: 'Bokningar' },
    { id: 'notiser',         icon: '🔔', lbl: 'Notiser', badge: unread },
    { id: 'profil',          icon: '👤', lbl: 'Profil' },
  ]

  return (
    <nav style={{
      display: 'none',
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: '#412B72',
      borderTop: '1px solid rgba(255,255,255,0.15)',
      padding: '8px 0 env(safe-area-inset-bottom)',
    }} className="bottom-nav">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => goTo(item.id)}
          style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '4px 0', position: 'relative',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
          <span style={{
            fontSize: 10, fontWeight: page === item.id ? 700 : 500,
            color: page === item.id ? '#fff' : 'rgba(255,255,255,0.6)',
          }}>
            {item.lbl}
          </span>
          {item.badge ? (
            <span style={{
              position: 'absolute', top: 0, right: '50%', transform: 'translateX(8px)',
              background: '#FF785A', color: '#fff', borderRadius: 10,
              fontSize: 9, fontWeight: 700, padding: '1px 5px', minWidth: 16, textAlign: 'center',
            }}>
              {item.badge}
            </span>
          ) : null}
          {page === item.id && (
            <span style={{
              position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
              width: 4, height: 4, background: '#fff', borderRadius: '50%',
            }} />
          )}
        </button>
      ))}
    </nav>
  )
}
