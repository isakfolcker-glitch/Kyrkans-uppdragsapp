// Kommentarer på ett pass. Se docs/plan-pass-kommentarer.md.
// Läsa och skriva: bokade, ansvariga, vaktmästaren och admin för passets församling.
// Kommentarer sparas med användarens egen klient så att databasens regler (RLS och
// trigger i migration 018) alltid gäller. Service role används bara för namn,
// notiser och mail, efter att behörigheten kontrollerats här.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAccessPassThread, loadPassThreadAudience, unauthorized, forbidden } from '@/lib/authz'
import { commentRecipients, shouldEmail, commentPreview, validCommentBody, type CommentRecipient } from '@/lib/comments/notify'
import { loadThread, loadOne, parseId, dbErrorStatus } from '@/lib/comments/server'
import { sendCommentNotice } from '@/lib/email'

type Ctx = { params: Promise<{ id: string }> }

const MAX_MENTIONS = 50

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { caller, supabase } = await getCaller()
  if (!caller) return unauthorized()

  const passId = parseId((await params).id)
  if (!passId) return NextResponse.json({ error: 'Ogiltigt pass' }, { status: 400 })
  if (!(await canAccessPassThread(caller, passId, supabase))) return forbidden()

  const audience = await loadPassThreadAudience(passId)
  if (!audience) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })

  const thread = await loadThread(supabase, audience)
  if (!thread) return NextResponse.json({ error: 'Kunde inte hämta kommentarerna' }, { status: 500 })
  return NextResponse.json(thread)
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { caller, supabase } = await getCaller()
  if (!caller) return unauthorized()

  const passId = parseId((await params).id)
  if (!passId) return NextResponse.json({ error: 'Ogiltigt pass' }, { status: 400 })
  if (!(await canAccessPassThread(caller, passId, supabase))) return forbidden()

  const input = await req.json().catch(() => null) as { body?: unknown; parentId?: unknown; mentionIds?: unknown } | null
  const text = validCommentBody(input?.body)
  if (!text) return NextResponse.json({ error: 'Kommentaren måste vara 1 till 2000 tecken.' }, { status: 400 })

  // Svar: bara på en kommentar på samma pass, som inte själv är ett svar och inte är borttagen
  let parentId: number | null = null
  let parentAuthorId: string | null = null
  if (input?.parentId != null) {
    if (typeof input.parentId !== 'number' || !Number.isSafeInteger(input.parentId) || input.parentId <= 0) {
      return NextResponse.json({ error: 'Ogiltig kommentar att svara på.' }, { status: 400 })
    }
    const { data: parent } = await supabase
      .from('pass_messages')
      .select('id, pass_id, parent_id, author_id, deleted_at')
      .eq('id', input.parentId)
      .maybeSingle()
    if (!parent || parent.pass_id !== passId || parent.parent_id != null) {
      return NextResponse.json({ error: 'Det går bara att svara på en kommentar på samma pass.' }, { status: 400 })
    }
    if (parent.deleted_at != null) {
      return NextResponse.json({ error: 'Kommentaren är borttagen.' }, { status: 400 })
    }
    parentId = parent.id
    parentAuthorId = parent.author_id
  }

  const audience = await loadPassThreadAudience(passId)
  if (!audience) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })

  // @nämningar: bara personer med åtkomst till passet, tyst filtrerat
  const mentionIds = Array.isArray(input?.mentionIds)
    ? Array.from(new Set(input.mentionIds.filter((m): m is string => typeof m === 'string')))
        .filter(m => m !== caller.id && audience.members.has(m))
        .slice(0, MAX_MENTIONS)
    : []

  const { data: created, error } = await supabase
    .from('pass_messages')
    .insert({ pass_id: passId, author_id: caller.id, author_name: caller.name, body: text, parent_id: parentId })
    .select('id')
    .single()
  if (error || !created) {
    return NextResponse.json({ error: 'Kunde inte spara kommentaren.' }, { status: dbErrorStatus(error?.code) })
  }
  const commentId = created.id as number

  let savedMentions: string[] = []
  if (mentionIds.length) {
    const { error: mErr } = await supabase
      .from('pass_message_mentions')
      .insert(mentionIds.map(profile_id => ({ message_id: commentId, profile_id })))
    if (mErr) console.error('[kommentarer] Kunde inte spara nämningar:', mErr.message)
    else savedMentions = mentionIds
  }

  await notifyForComment({
    passId, commentId, text, parentId, parentAuthorId,
    authorId: caller.id, authorName: caller.name,
    mentionIds: savedMentions, audience, supabase,
  })

  const message = await loadOne(supabase, audience, commentId)
  if (!message) return NextResponse.json({ error: 'Kommentaren sparades men kunde inte hämtas.' }, { status: 500 })
  return NextResponse.json(message, { status: 201 })
}

// ---------- Notiser och mail ----------

async function notifyForComment(opts: {
  passId: number
  commentId: number
  text: string
  parentId: number | null
  parentAuthorId: string | null
  authorId: string
  authorName: string
  mentionIds: string[]
  audience: NonNullable<Awaited<ReturnType<typeof loadPassThreadAudience>>>
  supabase: Awaited<ReturnType<typeof getCaller>>['supabase']
}) {
  const { audience } = opts
  const isReply = opts.parentId != null

  // Andra som skrivit i samma tråd (kommentaren och dess svar)
  let threadAuthorIds: string[] = []
  if (isReply) {
    const { data } = await opts.supabase
      .from('pass_messages')
      .select('author_id')
      .or(`id.eq.${opts.parentId},parent_id.eq.${opts.parentId}`)
      .is('deleted_at', null)
    threadAuthorIds = (data ?? []).map(r => r.author_id as string | null).filter((x): x is string => !!x)
  }

  const recipients: CommentRecipient[] = commentRecipients({
    authorId: opts.authorId,
    responsibleIds: audience.responsibleIds,
    vkId: audience.vkId,
    threadAuthorIds,
    mentionedIds: opts.mentionIds,
    parentAuthorId: opts.parentAuthorId,
    bookedIds: audience.bookedIds,
    churchAdminIds: audience.churchAdminIds,
    authorIsStaff: audience.members.get(opts.authorId)?.isStaff ?? false,
    isReply,
  }).filter(r => audience.members.has(r.profileId)) // bara de som har åtkomst till passet
  if (!recipients.length) return

  const title = audience.title
  const preview = commentPreview(opts.text)
  const titleFor = (type: CommentRecipient['type']) => {
    if (type === 'comment_mention') return `${opts.authorName} nämnde dig på "${title}"`
    if (type === 'comment_reply') return `${opts.authorName} svarade på din kommentar på "${title}"`
    return isReply ? `Nytt svar på "${title}"` : `Ny kommentar på "${title}"`
  }

  const admin = createAdminClient()
  const { data: notifs, error } = await admin
    .from('notifications')
    .insert(recipients.map(r => ({
      user_id: r.profileId,
      type: r.type,
      title: titleFor(r.type),
      body: `${opts.authorName}: ${preview}`,
      pass_id: opts.passId,
      comment_id: opts.commentId,
    })))
    .select('id, user_id, type')
  if (error || !notifs) {
    console.error('[kommentarer] Kunde inte skapa notiser:', error?.message)
    return
  }

  // Mail bara vid @nämning eller svar, se shouldEmail
  const mailable = notifs.filter(n => n.type === 'comment_mention' || n.type === 'comment_reply')
  if (!mailable.length) return
  const ids = mailable.map(n => n.user_id as string)

  const [{ data: people }, { data: settings }, { data: sent }] = await Promise.all([
    admin.from('profiles').select('id, name, email').in('id', ids),
    admin.from('notif_settings').select('profile_id, kommentar_mail').in('profile_id', ids),
    admin.from('notifications').select('user_id, emailed_at')
      .eq('pass_id', opts.passId).in('user_id', ids).not('emailed_at', 'is', null),
  ])

  const lastMail = new Map<string, string>()
  for (const s of sent ?? []) {
    const prev = lastMail.get(s.user_id)
    if (!prev || Date.parse(s.emailed_at) > Date.parse(prev)) lastMail.set(s.user_id, s.emailed_at)
  }
  const mailOn = new Map((settings ?? []).map(s => [s.profile_id as string, s.kommentar_mail !== false]))
  const person = new Map((people ?? []).map(p => [p.id as string, p]))
  const now = new Date()
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard?pass=${opts.passId}`

  const tasks = mailable.map(async n => {
    const p = person.get(n.user_id)
    if (!p?.email) return
    const ok = shouldEmail({
      type: n.type,
      kommentarMail: mailOn.get(n.user_id) ?? true,
      lastEmailedAt: lastMail.get(n.user_id) ?? null,
      now,
    })
    if (!ok) return
    await sendCommentNotice({
      to: p.email, name: p.name, passTitle: title, authorName: opts.authorName,
      kind: n.type === 'comment_mention' ? 'mention' : 'reply', url,
    })
    await admin.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', n.id)
  })

  const results = await Promise.allSettled(tasks)
  for (const r of results) {
    if (r.status === 'rejected') console.error('[kommentarer] Mail kunde inte skickas:', r.reason)
  }
}
