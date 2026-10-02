import { describe, expect, it } from 'vitest'
import { navigationForRole } from '@/lib/navigation'
const pages = (permissions: Parameters<typeof navigationForRole>[1]) => navigationForRole('anstalld', permissions).map(item => item.id)
describe('meny vid församlingsbyte', () => {
  it('behåller gruppsidan när anställd har gruppbehörighet i målförsamlingen', () => {
    expect(pages({ kan_hantera_grupper: true })).toContain('grupper')
    expect(pages({ kan_hantera_grupper: false })).not.toContain('grupper')
  })
  it('ger samma personalsida för båda personalbehörigheterna', () => {
    expect(pages({ kan_se_personal: true })).toContain('personal')
    expect(pages({ kan_lagg_till_personal: true })).toContain('personal')
    expect(pages({})).not.toContain('personal')
  })
  it('visar bara utskick när målförsamlingen tillåter dem', () => {
    expect(pages({ kan_skicka_utskick: true })).toContain('utskick')
    expect(pages({})).not.toContain('utskick')
  })
  it('en ideell får inte administratörssidor av personalflaggor', () => {
    expect(navigationForRole('ideell', { kan_hantera_grupper: true }).map(item => item.id)).not.toContain('grupper')
  })
  it('församlings- och pastoratsadmin behåller sina vanliga menyer', () => {
    expect(navigationForRole('fadmin').map(item => item.id)).toContain('behorigheter')
    expect(navigationForRole('padmin').map(item => item.id)).toContain('forsamlingar')
  })
})
