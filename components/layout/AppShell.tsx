'use client'
import { useApp } from '@/lib/appStore'
import Sidebar from './Sidebar'
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
    case 'oversikt':       return <OversiktPage />
    case 'forsamlingar':   return <ForsamlingarPage />
    case 'kyrkor':         return <ForsamlingarPage />
    case 'pastorat':       return <PastoratPage />
    default:               return <PassPage />
  }
}

export default function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <PageContent />
      </main>
      <Modal />
    </div>
  )
}
