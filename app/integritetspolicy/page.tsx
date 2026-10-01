export default function IntegritetspolicyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FFEBE1' }}>
      <header className="auth-head" style={{ padding: '24px 24px 34px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>Kyrkouppdrag</span>
          <h1 className="auth-title">Integritets<span className="serif">policy</span></h1>
          <p className="auth-lead">Senast uppdaterad 29 september 2026</p>
        </div>
      </header>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 48px' }}>

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
            <li><strong>Kommentarer:</strong> Det du skriver i kommentarer på pass, och om du nämns av någon annan</li>
            <li><strong>Tekniska uppgifter:</strong> Inloggningstidpunkter (hanteras av Supabase Auth)</li>
          </ul>
        </Section>

        <Section title="3. Varför behandlar vi dina uppgifter?">
          <p>Vi behandlar dina personuppgifter för följande ändamål:</p>
          <ul>
            <li><strong>Administrera ditt konto</strong>, för att du ska kunna logga in och använda appen (rättslig grund: avtal)</li>
            <li><strong>Koordinera frivilligarbete</strong>, för att boka och planera uppdrag (rättslig grund: berättigat intresse)</li>
            <li><strong>Skicka notiser och påminnelser</strong>, e-post om pass och bokningar (rättslig grund: samtycke via notis-inställningar)</li>
            <li><strong>Säkerhet</strong>, kontaktperson i nödsituation används bara vid faktiska nödsituationer (rättslig grund: vitalt intresse)</li>
          </ul>
          <p>Kommentarer på ett pass kan läsas av de som är bokade på passet, passets ansvariga och vaktmästare samt administratörer för församlingen och pastoratet. De ser ditt namn, men aldrig din e-post eller ditt telefonnummer. Tar du bort ditt konto raderas dina kommentarer. Har någon svarat på en kommentar blir den i stället anonym, så att svaret finns kvar.</p>
        </Section>

        <Section title="4. Hur länge sparar vi dina uppgifter?">
          <p>Dina uppgifter sparas så länge du har ett aktivt konto i appen. Du kan när som helst begära radering (se avsnitt 6). Uppgifter i bokningshistorik kan sparas i upp till 12 månader efter avslutad tjänst för administrativa ändamål.</p>
        </Section>

        <Section title="5. Vem delar vi dina uppgifter med?">
          <p>Vi delar dina uppgifter med följande underleverantörer (personuppgiftsbiträden):</p>
          <ul>
            <li><strong>Supabase Inc.</strong>, databaslagring och autentisering. Data lagras i EU (Irland, eu-west-1). <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Supabase integritetspolicy</a></li>
            <li><strong>Vercel Inc.</strong>, webbhosting. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Vercel integritetspolicy</a></li>
            <li><strong>Brevo (Sendinblue SAS, Frankrike)</strong>, e-postutskick. <a href="https://www.brevo.com/legal/privacypolicy/" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Brevo integritetspolicy</a></li>
          </ul>
          <p>Vi säljer aldrig dina uppgifter till tredje part.</p>
        </Section>

        <Section title="6. Dina rättigheter enligt GDPR">
          <p>Du har följande rättigheter:</p>
          <ul>
            <li><strong>Rätt till tillgång (art. 15)</strong>, begär en kopia av dina uppgifter via ”Exportera mina uppgifter” i din profil</li>
            <li><strong>Rätt till rättelse (art. 16)</strong>, rätta felaktiga uppgifter direkt i din profil</li>
            <li><strong>Rätt till radering (art. 17)</strong>, radera ditt konto och alla uppgifter via ”Radera mitt konto” i din profil</li>
            <li><strong>Rätt till dataportabilitet (art. 20)</strong>, ladda ned dina uppgifter som JSON via ”Exportera mina uppgifter”</li>
            <li><strong>Rätt att invända (art. 21)</strong>, kontakta din lokala administratör</li>
          </ul>
        </Section>

        <Section title="7. Cookies">
          <p>Appen använder endast nödvändiga sessionscookies för inloggning (hanteras av Supabase Auth). Inga spårnings- eller marknadsföringscookies används.</p>
        </Section>

        <Section title="8. Klagomål">
          <p>Om du anser att vi behandlar dina personuppgifter felaktigt har du rätt att lämna klagomål till <a href="https://www.imy.se" target="_blank" rel="noreferrer" style={{ color: '#7D0037' }}>Integritetsskyddsmyndigheten (IMY)</a>.</p>
        </Section>

        <div className="panel" style={{ marginTop: 32, fontSize: 16, color: '#000', lineHeight: 1.6 }}>
          Frågor om din integritet? Kontakta din lokala församlingsadministratör eller pastoratsadministratör.
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a href="/dashboard" style={{ color: '#7D0037', fontSize: 16, fontWeight: 500, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Tillbaka till appen</a>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 500, color: '#7D0037', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(125,0,55,0.18)' }}>{title}</h2>
      <div className="policy-text" style={{ fontSize: 16, color: '#000', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}
