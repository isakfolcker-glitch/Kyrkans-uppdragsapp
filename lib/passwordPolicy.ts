// Delad lösenordspolicy – används både i klientformulär (styrkemätare) och
// server-API:er (sista kontroll innan lösenord sparas hos Supabase).

export const PASSWORD_MIN_LENGTH = 10

export interface PasswordChecks {
  length: boolean
  lower: boolean
  upper: boolean
  number: boolean
  symbol: boolean
}

export function checkPassword(password: string): PasswordChecks {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    lower: /[a-zà-ö]/.test(password),
    upper: /[A-ZÀ-Ö]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(password),
  }
}

function categoryCount(c: PasswordChecks): number {
  return [c.lower, c.upper, c.number, c.symbol].filter(Boolean).length
}

// 0 = tomt/för kort, 1 = svagt, 2 = ok, 3 = bra, 4 = starkt
export function passwordScore(password: string): number {
  const c = checkPassword(password)
  if (!password) return 0
  if (!c.length) return Math.min(1, categoryCount(c))
  return Math.max(1, categoryCount(c))
}

export const PASSWORD_SCORE_LABELS = ['För kort', 'Svagt', 'Okej', 'Bra', 'Starkt']
export const PASSWORD_SCORE_COLORS = ['#D3D1C7', '#FF785A', '#BC8E4C', '#28A88E', '#00554B']

export function isPasswordStrongEnough(password: string): boolean {
  const c = checkPassword(password)
  return c.length && categoryCount(c) >= 3
}

// Returnerar felmeddelande på svenska, eller null om lösenordet är godkänt.
export function passwordError(password: string): string | null {
  if (!password) return 'Ange ett lösenord.'
  const c = checkPassword(password)
  if (!c.length) return `Lösenordet måste vara minst ${PASSWORD_MIN_LENGTH} tecken.`
  if (categoryCount(c) < 3) {
    return 'Lösenordet är för svagt. Blanda stora och små bokstäver, siffror och/eller symboler.'
  }
  return null
}
