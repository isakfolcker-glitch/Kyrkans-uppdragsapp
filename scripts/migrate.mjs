import pg from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { Client } = pg

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.xfjizomwxcavkuvweqfx',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await client.connect()
  console.log('✓ Ansluten till databasen')

  const files = ['001_initial_schema.sql', '002_rls_policies.sql']
  for (const file of files) {
    const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', file), 'utf8')
    console.log(`Kör ${file}...`)
    await client.query(sql)
    console.log(`✓ ${file} klar`)
  }

  await client.end()
  console.log('\n✅ Databasen är klar!')
}

run().catch(e => { console.error('❌ Fel:', e.message); process.exit(1) })
