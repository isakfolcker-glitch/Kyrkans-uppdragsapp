// Demo-cookien innehåller en hash av lösenordet i stället för lösenordet i klartext.
export async function demoToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`kyrkouppdrag-demo:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
