/**
 * Hälsning efter tid på dygnet: God morgon (05–09), God dag (10–17),
 * annars God kväll.
 */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 10) return 'God morgon'
  if (hour >= 10 && hour < 18) return 'God dag'
  return 'God kväll'
}

/** Förnamnet ur ett fullständigt namn, eller tom sträng om namn saknas. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}
