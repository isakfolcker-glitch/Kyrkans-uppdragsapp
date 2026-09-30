'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { useApp } from '@/lib/appStore'
import Sidebar, { useSubText } from '@/components/layout/Sidebar'
import { useNavItems, useUnreadCount } from '@/components/layout/useNavItems'
import PendingInvitations from '@/components/layout/PendingInvitations'
import Modal from '@/components/ui/Modal'
import Icon from '@/components/ui/Icon'
import Greeting from '@/components/ui/Greeting'
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

// Flikarna i nedre menyn på mobil. Allt annat ligger under "Mer".
const TABS = [
  { id: 'oversikt',       icon: 'Home',     lbl: 'Start' },
  { id: 'pass',           icon: 'Calendar', lbl: 'Pass' },
  { id: 'mina-bokningar', icon: 'Bookmark', lbl: 'Bokningar' },
  { id: 'notiser',        icon: 'Bell',     lbl: 'Notiser' },
]
const TAB_IDS = new Set(TABS.map(t => t.id))

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
    <>
      <div className="app-shell">
        <Sidebar />
        <div className="app-column">
          <MobileHeader />
          <main className="main-content">
            <PendingInvitations />
            <div className="desktop-only">
              <ChurchSwitcher />
            </div>
            <PageContent />
          </main>
        </div>
        <Modal />
      </div>
      <BottomNav />
    </>
  )
}

/** Rolltext för vald församling, t.ex. "Församlingsadmin". */
function useRoleLabel() {
  const { currentMembership } = useApp()
  const membership = currentMembership()
  return membership?.adminLevel === 'super'
    ? 'Systemadmin'
    : membership?.adminLevel === 'pastorat'
      ? 'Pastoratsadmin'
      : membership?.adminLevel === 'forsamling'
        ? 'Församlingsadmin'
        : membership?.role === 'anstalld'
          ? 'Anställd'
          : 'Ideell'
}

/** Rullgardin för att byta församling. Visas bara om man har fler än en. */
function ChurchSelect({ id }: { id: string }) {
  const { availableChurches, churches, currentChurchId, setChurch } = useApp()
  return (
    <select
      id={id}
      className="church-select"
      value={currentChurchId()}
      onChange={event => {
        const churchId = Number(event.target.value)
        const index = churches.findIndex(church => church.id === churchId)
        if (index >= 0) setChurch(index)
      }}
    >
      {availableChurches.map(church => (
        <option key={church.id} value={church.id}>{church.name}</option>
      ))}
    </select>
  )
}

function ChurchSwitcher() {
  const { currentUser, isKiosk, availableChurches } = useApp()
  const roleLabel = useRoleLabel()
  const selectId = useId()
  if (!currentUser || isKiosk() || availableChurches.length <= 1) return null

  return (
    <div className="church-switcher row-line">
      <div style={{ minWidth: 0 }}>
        <label htmlFor={selectId} className="church-switcher-label">Församling</label>
        <div className="church-switcher-sub">{roleLabel} i vald församling</div>
      </div>
      <ChurchSelect id={selectId} />
    </div>
  )
}

/** Vinrött huvud på mobil med appnamn, församling, hälsning och knappen Mer. */
function MobileHeader() {
  const { page, isKiosk, u, profile } = useApp()
  const subText = useSubText()
  const [open, setOpen] = useState(false)
  const merBtn = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  if (isKiosk()) return null
  const name = profile?.name || u().name

  const close = () => {
    setOpen(false)
    merBtn.current?.focus()
  }

  return (
    <>
      <header className="mobile-header">
        <div className="mobile-header-top">
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Kyrkouppdrag</span>
            {subText && <span className="serif" style={{ fontSize: 14 }}>{subText}</span>}
          </div>
          <button
            ref={merBtn}
            type="button"
            className="mer-btn"
            aria-expanded={open}
            aria-controls={panelId}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <Icon name="Dots" />
            Mer
          </button>
        </div>
        {page === 'oversikt' && (
          <h1 className="mobile-greeting"><Greeting name={name} /></h1>
        )}
      </header>
      {open && <MorePanel id={panelId} onClose={close} />}
    </>
  )
}

/** Panelen bakom "Mer": Min profil, övriga sidor, församlingsbyte och utloggning. */
function MorePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { page, goTo, currentUser, logout, cycleUser, u, isKiosk, availableChurches } = useApp()
  const items = useNavItems().filter(item => !TAB_IDS.has(item.id))
  const closeBtn = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const selectId = useId()
  const roleLabel = useRoleLabel()

  // Senaste onClose i en ref, så att fokus bara flyttas när panelen öppnas
  // och inte varje gång appen ritas om.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    closeBtn.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const open = (target: string) => { goTo(target); onClose() }

  return (
    <div className="mer-overlay" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div id={id} className="mer-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mer-panel-head">
          <h2 id={titleId} style={{ fontSize: 22, fontWeight: 500 }}>Mer</h2>
          <button ref={closeBtn} type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            <Icon name="X" />
            Stäng
          </button>
        </div>

        <nav aria-label="Fler sidor">
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              className={`mer-item${page === item.id ? ' active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => open(item.id)}
            >
              <Icon name={item.icon} />
              {item.lbl}
            </button>
          ))}
        </nav>

        {currentUser && !isKiosk() && availableChurches.length > 1 && (
          <div className="mer-church">
            <label htmlFor={selectId} className="church-switcher-label">Byt församling</label>
            <div className="church-switcher-sub">Du är {roleLabel.toLowerCase()} i vald församling</div>
            <ChurchSelect id={selectId} />
          </div>
        )}

        {currentUser ? (
          <button type="button" className="mer-item" onClick={logout}>
            <Icon name="Logout" />
            Logga ut
          </button>
        ) : (
          <button type="button" className="mer-item" onClick={() => { cycleUser(); onClose() }}>
            <Icon name="Switch" />
            Byt testanvändare (nu {u().name})
          </button>
        )}
      </div>
    </div>
  )
}

/** Nedre menyn på mobil: exakt fyra flikar. */
function BottomNav() {
  const { page, goTo, isKiosk } = useApp()
  const unread = useUnreadCount()
  if (isKiosk()) return null

  return (
    <nav className="bottom-nav" aria-label="Huvudmeny">
      {TABS.map(tab => {
        const active = page === tab.id
        const label = tab.id === 'notiser' && unread > 0 ? `${tab.lbl} (${unread})` : tab.lbl
        return (
          <button
            key={tab.id}
            type="button"
            className={`tab${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => goTo(tab.id)}
          >
            <span className="tab-pill"><Icon name={tab.icon} /></span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}
