'use client'
import { useId } from 'react'
import { useApp } from '@/lib/appStore'
import { membershipLabel, organizationGroups } from '@/lib/organizationContext'
import Icon from '@/components/ui/Icon'

/** The active congregation always stays visible, including on mobile. */
export default function OrganizationSwitcher() {
  const { churches, pastorat, availableChurches, currentChurchId, currentMembership, setChurch, isKiosk, page } = useApp()
  const churchSelectId = useId()
  const pastoratSelectId = useId()
  const churchId = currentChurchId()
  const church = availableChurches.find(item => item.id === churchId)
  const groups = organizationGroups(availableChurches, pastorat)
  const activeGroup = groups.find(group => group.churches.some(item => item.id === churchId))
  const overview = ['pastorat', 'forsamlingar', 'kyrkor'].includes(page)
  const selectChurch = (targetId: number) => {
    if (!availableChurches.some(item => item.id === targetId)) return
    const index = churches.findIndex(item => item.id === targetId)
    if (index >= 0) setChurch(index)
  }
  if (isKiosk()) return null

  return (
    <section className="organization-context" aria-label="Aktiv församling och pastorat">
      <div className="organization-current">
        <Icon name="BuildingChurch" size={24} />
        <div className="organization-current-copy">
          <span className="organization-eyebrow">{overview ? 'Vald församling för pass och personal' : 'Du arbetar i'}</span>
          <strong>{church?.name ?? 'Ingen församling vald'}</strong>
          <span className="organization-parent">{activeGroup?.name ?? 'Välj en församling för att komma igång'}</span>
        </div>
        {church && <span className="organization-role">{membershipLabel(currentMembership())}</span>}
      </div>
      {availableChurches.length > 1 && (
        <div className="organization-selectors">
          {groups.length > 1 && <div className="organization-select-field">
            <label htmlFor={pastoratSelectId}>Byt pastorat</label>
            <select id={pastoratSelectId} value={activeGroup?.key ?? ''} onChange={event => {
              const target = groups.find(group => group.key === event.target.value)?.churches[0]
              if (target?.id !== undefined) selectChurch(target.id)
            }}>
              {!activeGroup && <option value="" disabled>Välj pastorat</option>}
              {groups.map(group => <option key={group.key} value={group.key}>{group.name}</option>)}
            </select>
          </div>}
          <div className="organization-select-field">
            <label htmlFor={churchSelectId}>Byt församling</label>
            <select id={churchSelectId} value={churchId || ''} onChange={event => selectChurch(Number(event.target.value))}>
              {!church && <option value="" disabled>Välj församling</option>}
              {groups.map(group => <optgroup key={group.key} label={group.name}>{group.churches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}
            </select>
          </div>
        </div>
      )}
      <p className="organization-scope">{page === 'pastorat' ? 'Systemöversikten visar alla pastorat.' : overview ? 'Översikten visar de församlingar du får administrera.' : 'Pass, grupper och personal visas för den valda församlingen.'}</p>
    </section>
  )
}
