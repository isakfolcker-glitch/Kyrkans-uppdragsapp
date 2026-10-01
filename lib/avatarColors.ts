// Avatarfärger sparas per person och bokning i databasen (av_color, ac_color).
// Äldre värden är lila, gröna eller blå. De ändras inte i databasen, utan
// mappas här till den varma paletten när de visas.

/** Förval för nya avatarer: beige bakgrund med vinröd text. */
export const DEFAULT_AV = '#FFEBE1'
export const DEFAULT_AC = '#7D0037'

// Varma bakgrunder. Vinröd text har minst 6:1 i kontrast mot alla.
const WARM_BG = ['#FFEBE1', '#FFC3AA', '#F3E3CC', '#FFDCCB'] as const
const WARM_FG = ['#7D0037', '#000', '#000000'] as const

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

/** Bakgrundsfärg för en avatar, alltid i varm palett. */
export function avBg(value: string | null | undefined): string {
  const v = norm(value)
  const hit = WARM_BG.find(c => c === v)
  if (hit) return hit
  if (!v) return DEFAULT_AV
  // Samma gamla färg ger alltid samma nya färg, så personer går att skilja åt.
  let sum = 0
  for (const ch of v) sum = (sum + ch.charCodeAt(0)) % 997
  return WARM_BG[sum % WARM_BG.length]
}

/** Textfärg för en avatar: vinrött, eller svart om det redan var svart. */
export function avFg(value: string | null | undefined): string {
  const v = norm(value)
  return WARM_FG.some(c => c === v) ? (v === '#7D0037' ? '#7D0037' : '#000') : DEFAULT_AC
}
