'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import type { PassData, NotifData } from '@/lib/appData'
import { gLabel } from '@/lib/appData'
import Icon from '@/components/ui/Icon'
import Greeting from '@/components/ui/Greeting'
import PassDetailModal from '@/components/modals/PassDetailModal'
import PassQAModal from '@/components/modals/PassQAModal'
import {
  parseLocalDate, localDateString, weekLabel, weekKey, relativeDay,
  shortMonth, weekday, formatTime,
} from '@/lib/dates'

// Notistyper som öppnar passets kommentarstråd (samma som på Notiser).
const THREAD_TYPES = new Set(['message', 'comment', 'comment_reply', 'comment_mention'])
const MAX_ROWS = 8
const MAX_NOTIFS = 3

// Allt på startsidan räknas här från data som redan finns i storen.
// Vad som visas styr bara vyn, skyddet av data ligger i API och RLS.
export default function OversiktPage() {
  const {
    u, profile, currentUser, passes, people, groups, churches, availableChurches, notifications,
    selfBookings, goTo, setChurch, showModal, doBook, markNotifRead,
    isAdmin, isPAdmin, isSuperAdmin, canBook, canViewBkgs, isResponsible,
    currentChurchId, currentGroups,
  } = useApp()
  const [announce, setAnnounce] = useState('')

  const usr = u()
  const name = profile?.name || usr.name
  const today = localDateString()
  const churchId = currentChurchId()
  const myGroups = currentGroups()
  const available = profile?.available ?? usr.available

  const upcoming = passes
    .filter(p => p.church === churchId && !p.cancelled && p.pubStatus === 'live' && p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))

  const isBooked = (p: PassData) => Boolean(selfBookings[p.id])
  const isOpenForMe = (p: PassData) =>
    canBook() && available && p.filled < p.spots && p.groups.some(g => myGroups.includes(g))

  // Nästa uppdrag: närmaste pass där jag är bokad eller ansvarig.
  const next = upcoming.find(p => isBooked(p) || isResponsible(p))

  // Kommande pass för mig: bokade, eller lediga i mina grupper.
  const rows = upcoming.filter(p => isBooked(p) || isOpenForMe(p)).slice(0, MAX_ROWS)
  const weeks: { key: string; label: string; rows: PassData[] }[] = []
  for (const p of rows) {
    const date = parseLocalDate(p.date)
    const key = weekKey(date)
    const last = weeks[weeks.length - 1]
    if (last?.key === key) last.rows.push(p)
    else weeks.push({ key, label: weekLabel(date), rows: [p] })
  }

  // Nytt sedan sist: de senaste notiserna för mig.
  const myId = currentUser ? profile?.id : usr.id
  const myNotifs = notifications
    .filter(n => n.userId === myId)
    .sort((a, b) => String(b.time).localeCompare(String(a.time)))
  const latest = myNotifs.slice(0, MAX_NOTIFS)

  const roleFor = (p: PassData) => {
    if (isResponsible(p) && !isBooked(p)) return 'ansvarig'
    const group = p.groups.find(g => myGroups.includes(g)) ?? p.groups[0]
    return group ? gLabel(group, groups).toLocaleLowerCase('sv-SE') : ''
  }

  const openPass = (p: PassData) => {
    showModal(canViewBkgs(p) ? <PassDetailModal passId={p.id} /> : <PassQAModal passId={p.id} />)
  }

  const takePass = (p: PassData) => {
    doBook(p.id)
    setAnnounce(`Du är bokad på ${p.title}.`)
  }

  const openNotification = (n: NotifData) => {
    if (!n.read) markNotifRead(Number(n.id))
    if (!n.passId) { goTo('notiser'); return }
    const pass = passes.find(item => item.id === n.passId)
    if (pass) {
      const churchIndex = churches.findIndex(church => church.id === pass.church)
      if (churchIndex >= 0) setChurch(churchIndex)
    }
    if (THREAD_TYPES.has(n.type) && pass) {
      showModal(<PassQAModal passId={n.passId} targetCommentId={n.commentId} />)
      return
    }
    goTo('pass')
  }

  const showList = canBook() || rows.length > 0

  return (
    <div className="start">
      <div className="start-head">
        {/* På mobil står hälsningen i det vinröda huvudet. */}
        <h1 className="start-greeting desktop-only"><Greeting name={name} /></h1>
        <NextAssignment pass={next} role={next ? roleFor(next) : ''} browseLabel={canBook() ? 'Se lediga pass' : 'Se alla pass'} onOpen={openPass} onBrowse={() => goTo('pass')} />
      </div>

      <div className="start-main">
        {showList && (
          <section aria-labelledby="start-pass" className="start-section">
            <h2 id="start-pass" className="start-h2">Kommande pass <span className="serif">för dig</span></h2>

            {!available && canBook() && (
              <p className="start-note">
                Du är markerad som otillgänglig, så lediga pass visas inte.{' '}
                <button type="button" className="link-btn" onClick={() => goTo('profil')}>Ändra i Min profil</button>
              </p>
            )}

            {weeks.length === 0 ? (
              <p className="start-note">
                Inga kommande pass för dig just nu.{' '}
                <button type="button" className="link-btn" onClick={() => goTo('pass')}>Se alla pass</button>
              </p>
            ) : (
              weeks.map(week => (
                <div key={week.key} className="week">
                  <h3 className="week-label">{week.label}</h3>
                  <ul className="pass-rows">
                    {week.rows.map(p => (
                      <PassRow key={p.id} pass={p} booked={isBooked(p)} role={roleFor(p)} onTake={takePass} />
                    ))}
                  </ul>
                </div>
              ))
            )}
            <p className="sr-only" aria-live="polite">{announce}</p>
          </section>
        )}

        {isAdmin() && (
          <AdminOverview
            upcoming={upcoming}
            ideellaCount={people.filter(p => p.church === churchId && p.isEmployee === false).length}
            unread={myNotifs.filter(n => !n.read).length}
            showChurches={(isPAdmin() || isSuperAdmin()) && churches.length > 0}
            churchRows={availableChurches.map(c => ({
              id: c.id,
              index: churches.findIndex(item => item.id === c.id),
              name: c.name,
              admin: c.admin,
              active: passes.filter(x => x.church === c.id && !x.cancelled && x.pubStatus === 'live').length,
            }))}
            onGo={goTo}
            onManage={index => { setChurch(index); goTo('pass') }}
          />
        )}
      </div>

      <aside aria-labelledby="start-notiser" className="start-aside">
        <h2 id="start-notiser" className="start-h2 start-h2-small">Nytt sedan sist</h2>
        {latest.length === 0 ? (
          <p className="start-note row-line" style={{ paddingTop: 14 }}>Inget nytt just nu.</p>
        ) : (
          <ul className="notif-rows">
            {latest.map(n => {
              const pass = n.passId ? passes.find(p => p.id === n.passId) : undefined
              const time = new Date(n.time)
              const when = Number.isNaN(time.getTime()) ? '' : relativeDay(time)
              return (
                <li key={n.id}>
                  <button type="button" className="notif-row row-line" onClick={() => openNotification(n)}>
                    <span style={{ fontWeight: 500 }}>
                      {n.title}
                      {!n.read && <span className="sr-only"> (oläst)</span>}
                    </span>
                    <span className="muted">{[pass?.title, when].filter(Boolean).join(', ')}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button type="button" className="link-btn" onClick={() => goTo('notiser')}>Alla notiser</button>
      </aside>
    </div>
  )
}

function NextAssignment({ pass, role, browseLabel, onOpen, onBrowse }: {
  pass?: PassData; role: string; browseLabel: string; onOpen: (p: PassData) => void; onBrowse: () => void
}) {
  if (!pass) {
    return (
      <div className="next">
        <div className="next-text">
          <span>Ditt nästa uppdrag</span>
          <span className="muted">Du har inget bokat uppdrag just nu.</span>
          <button type="button" className="link-btn" onClick={onBrowse}>{browseLabel}</button>
        </div>
      </div>
    )
  }
  const date = parseLocalDate(pass.date)
  const meta = [formatTime(pass.time), pass.plats, role].filter(Boolean).join(', ')
  return (
    <div className="next">
      <div className="date-arch" aria-hidden="true">
        <span className="date-arch-day">{date.getDate()}</span>
        <span className="date-arch-month serif">{shortMonth(date)}</span>
      </div>
      <div className="next-text">
        <span className="next-kicker">Ditt nästa uppdrag</span>
        <span className="next-title">{pass.title}</span>
        <span className="sr-only">{weekday(date, 'long')} {date.getDate()} {shortMonth(date)},</span>
        <span className="muted next-meta">{meta}</span>
        <button type="button" className="link-btn" onClick={() => onOpen(pass)}>
          Visa passet<span className="sr-only"> {pass.title}</span>
        </button>
      </div>
    </div>
  )
}

function PassRow({ pass, booked, role, onTake }: {
  pass: PassData; booked: boolean; role: string; onTake: (p: PassData) => void
}) {
  const date = parseLocalDate(pass.date)
  const left = pass.spots - pass.filled
  const extra = booked ? role : `${left} ${left === 1 ? 'plats' : 'platser'} kvar`
  const meta = [formatTime(pass.time), pass.plats, extra].filter(Boolean).join(' · ')
  return (
    <li className="pass-row row-line">
      <span className="pass-row-day">
        <span className="pass-row-num">{date.getDate()}</span>
        <span className="pass-row-wd wd-long">{weekday(date, 'long')}</span>
        <span className="pass-row-wd wd-short" aria-hidden="true">{weekday(date, 'short')}</span>
      </span>
      <span className="pass-row-text">
        <span className="pass-row-title">{pass.title}</span>
        <span className="muted pass-row-meta">{meta}</span>
      </span>
      {booked ? (
        <span className="booked-pill">
          <Icon name="Check" size={16} />
          Du är bokad
        </span>
      ) : (
        <button type="button" className="btn btn-primary take-btn" onClick={() => onTake(pass)}>
          Ta passet<span className="sr-only">: {pass.title}</span>
        </button>
      )}
    </li>
  )
}

function AdminOverview({ upcoming, ideellaCount, unread, showChurches, churchRows, onGo, onManage }: {
  upcoming: PassData[]
  ideellaCount: number
  unread: number
  showChurches: boolean
  churchRows: { id?: number; index: number; name: string; admin: string; active: number }[]
  onGo: (page: string) => void
  onManage: (index: number) => void
}) {
  const withSpots = upcoming.filter(p => p.filled < p.spots).length
  const lines = [
    { label: 'Kommande pass med lediga platser', value: withSpots, action: 'Visa pass', page: 'pass' },
    { label: 'Ideella i församlingen', value: ideellaCount, action: 'Visa personal', page: 'personal' },
    { label: 'Olästa notiser', value: unread, action: 'Visa notiser', page: 'notiser' },
  ]
  return (
    <section aria-labelledby="start-admin" className="start-section">
      <h2 id="start-admin" className="start-h2">Överblick <span className="serif">för församlingen</span></h2>
      <ul className="overview-rows">
        {lines.map(line => (
          <li key={line.label} className="overview-row row-line">
            <span className="overview-text">
              <span>{line.label}</span>
              <span className="overview-value">{line.value}</span>
            </span>
            <button type="button" className="link-btn" onClick={() => onGo(line.page)}>{line.action}</button>
          </li>
        ))}
      </ul>

      {showChurches && (
        <div className="week" style={{ marginTop: 18 }}>
          <h3 className="week-label">Församlingar</h3>
          <ul className="overview-rows">
            {churchRows.map(c => (
              <li key={c.id ?? c.index} className="overview-row row-line">
                <span className="overview-text" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className="muted">{c.active} aktiva pass{c.admin ? ` · Admin: ${c.admin}` : ''}</span>
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onManage(c.index)}>
                  Hantera<span className="sr-only"> {c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
