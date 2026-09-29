import { describe, expect, it } from 'vitest'
import { validatePassForm } from '@/lib/passValidation'

describe('validatePassForm', () => {
  it('kräver de viktigaste fälten', () => {
    expect(validatePassForm({
      title: '   ',
      date: '',
      timeStart: '',
      plats: '',
      spots: 0,
      groups: [],
    })).toEqual({
      title: 'Ange en titel.',
      date: 'Välj ett datum.',
      timeStart: 'Välj en starttid.',
      plats: 'Ange en plats.',
      spots: 'Antal platser måste vara minst 1.',
      groups: 'Välj minst en grupp.',
    })
  })

  it('godkänner ett komplett pass', () => {
    expect(validatePassForm({
      title: 'Söndagsgudstjänst',
      date: '2026-10-04',
      timeStart: '10:00',
      plats: 'Domkyrkan',
      spots: 3,
      groups: ['kyrkvard'],
    })).toEqual({})
  })

  it('accepterar inte bara blanksteg i titel eller plats', () => {
    const errors = validatePassForm({
      title: ' ',
      date: '2026-10-04',
      timeStart: '10:00',
      plats: '   ',
      spots: 1,
      groups: ['kyrkvard'],
    })

    expect(errors.title).toBe('Ange en titel.')
    expect(errors.plats).toBe('Ange en plats.')
  })
})
