export default function IntegritetspolicyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FFEBE1', padding: '40px 20px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', borderRadius: 20, padding: '40px 48px', boxShadow: '0 4px 24px rgba(125,0,55,0.08)', border: '1px solid rgba(125,0,55,0.08)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #FFEBE1' }}>
          <div style={{ width: 48, height: 48, background: '#7D0037', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, flexShrink: 0 }}>✝</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#000', margin: 0 }}>Integritetspolicy</h1>
            <p style={{ fontSize: 13, color: '#5F5E5A', margin: '4px 0 0' }}>Kyrkans uppdragsapp · Senast uppdaterad: {new Date().toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <Section title="1. Personuppgiftsansvarig">
          <p>Personuppgiftsansvarig för behandlingen av dina personuppgifter är den församling eller det pastorat inom Svenska kyrkan som bjudit in dig till appen. Kontakta din lokala administratör för frågor om dina uppgifter.</p>
        </Section>

        <Section title="2. Vilka uppgifter samlar vi in?">
          <p>Vi samlar in följande personuppgifter när du använder appen:</p>
          <ul>
            <li><strong>Identitetsuppgifter:</strong> Namn, e-postadress</li>
            <li><strong>Kontaktuppgifter:</strong> Mobilnummer</li>
            <li><strong>Säkerhetsuppgifter:</strong> Namn och telefonnummer till kontaktperson i nödsituation</li>
            <li><strong>Demografiska uppgifter:</strong> Födelseår</li>
            <li><strong>Tjänsteuppgifter:</strong> Roll i organisationen, uppdragsgrupper, bokningar</li>
            <li><strong>Tekniska uppgifter:</strong> Inloggningstidpunkter (hanteras av Supabase Auth)</li>
          </ul>
        </Section>

        <Section title="3. Varför behandlar vi dina uppgifter?">
          <p>Vi behandlar dina personuppgifter för följande ändamål:</p>
          <ul>
            <li><strong>Administrera ditt konto</strong> – för att du ska kunna logga in och använda appen (rättslig grund: avtal)</li>
            <li><strong>Koordinera frivilligarbete</strong> – för att boka och planera uppdrag (rättslig grund: berättigat intresse)</li>
            <li><strong>Skicka notiser och påminnelser</strong> – e-post om pass och bokningar (rättslig grund: samtycke via notis-inställningar)</li>
            <li><strong>Säkerhet</strong> – kontaktperson i nödsituation används bara vid faktiska nödsituationer (rättslig grund: vitalt intresse)</li>
          </ul>
        </Section>

        <Section title="4. Hur länge sparar vi dina uppgifter?">
          <p>Dina uppgifter sparas så länge du har ett aktivt konto i appen. Du kan när som helst begära radering (se avsnitt 6). Uppgifter i bokningshistorik kan sparas i upp till 12 månader efter avslutad tjänst för administrativa ändamål.</p>
        </Section>

        <Section title="5. Vem delar vi dina uppgifter med?">
          <p>Vi delar dina uppgifter med följande underleverantörer (personuppgiftsbiträden):</p>
          <ul>
            <li><strong>Supabase Inc.</strong> – databaslagring och autentisering. Data lagras i EU (Frankfurt, eu-central-1). <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Supabase integritetspolicy</a></li>
            <li><strong>Vercel Inc.</strong> – webbhosting. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Vercel integritetspolicy</a></li>
            <li><strong>Resend Inc.</strong> – e-postutskick. <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Resend integritetspolicy</a></li>
          </ul>
          <p>Vi säljer aldrig dina uppgifter till tredje part.</p>
        </Section>

        <Section title="6. Dina rättigheter enligt GDPR">
          <p>Du har följande rättigheter:</p>
          <ul>
            <li><strong>Rätt till tillgång (art. 15)</strong> – begär en kopia av dina uppgifter via "Exportera mina uppgifter" i din profil</li>
            <li><strong>Rätt till rättelse (art. 16)</strong> – rätta felaktiga uppgifter direkt i din profil</li>
            <li><strong>Rätt till radering (art. 17)</strong> – radera ditt konto och alla uppgifter via "Radera mitt konto" i din profil</li>
            <li><strong>Rätt till dataportabilitet (art. 20)</strong> – ladda ned dina uppgifter som JSON via "Exportera mina uppgifter"</li>
            <li><strong>Rätt att invända (art. 21)</strong> – kontakta din lokala administratör</li>
          </ul>
        </Section>

        <Section title="7. Cookies">
          <p>Appen använder endast nödvändiga sessionscookies för inloggning (hanteras av Supabase Auth). Inga spårnings- eller marknadsföringscookies används.</p>
        </Section>

        <Section title="8. Klagomål">
          <p>Om du anser att vi behandlar dina personuppgifter felaktigt har du rätt att lämna klagomål till <a href="https://www.imy.se" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Integritetsskyddsmyndigheten (IMY)</a>.</p>
        </Section>

        <div style={{ marginTop: 32, padding: 20, background: '#FFEBE1', borderRadius: 12, fontSize: 13, color: '#5F5E5A', lineHeight: 1.6 }}>
          📧 Frågor om din integritet? Kontakta din lokala församlingsadministratör eller pastoratsadministratör.
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a href="/dashboard" style={{ color: '#7D0037', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Tillbaka till appen</a>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#7D0037', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #FFEBE1' }}>{title}</h2>
      <div style={{ fontSize: 14, color: '#2C2C2A', lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}
