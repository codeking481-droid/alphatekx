import { createHmac } from 'node:crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { supabaseServiceHeaders } from './supabaseHeaders.mjs'

function firebaseCredential() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()
  if (raw) return cert(JSON.parse(raw))
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim()
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim()
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
  if (!projectId || !clientEmail || !privateKey) return null
  return cert({ projectId, clientEmail, privateKey })
}

function firebaseAuth() {
  if (!getApps().length) {
    const credential = firebaseCredential()
    if (!credential) throw new Error('Phone verification is not configured')
    initializeApp({ credential })
  }
  return getAuth()
}

function serviceHeaders(service, extra = {}) {
  return supabaseServiceHeaders(service, extra)
}

function phoneFingerprint(phone, secret) {
  return createHmac('sha256', secret).update(String(phone)).digest('hex')
}

function maskedPhone(phone) {
  const value = String(phone)
  return value.length > 5 ? `${value.slice(0, 3)}••••${value.slice(-3)}` : 'verified phone'
}

async function linkedUser(config, fingerprint) {
  const response = await fetch(`${config.url}/rest/v1/phone_auth_links?phone_fingerprint=eq.${fingerprint}&select=*`, {
    headers: serviceHeaders(config.service),
  })
  if (!response.ok) throw new Error('Phone authentication migration is not installed')
  return (await response.json())?.[0] || null
}

async function createSupabasePhoneUser(config, firebaseUser, fingerprint) {
  const email = `phone-${fingerprint.slice(0, 24)}@phone.alphatekx.local`
  const response = await fetch(`${config.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders(config.service),
    body: JSON.stringify({
      email,
      email_confirm: true,
      phone: firebaseUser.phone_number,
      phone_confirm: true,
      user_metadata: { auth_source: 'firebase_phone', phone_verified: true },
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.id) throw new Error(body.message || 'Could not create the phone account')
  const record = {
    phone_fingerprint: fingerprint,
    user_id: body.id,
    internal_email: email,
    firebase_uid: firebaseUser.uid,
    verified_at: new Date().toISOString(),
  }
  const saved = await fetch(`${config.url}/rest/v1/phone_auth_links`, {
    method: 'POST',
    headers: serviceHeaders(config.service, { Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  })
  if (!saved.ok) throw new Error('Could not save the verified phone account')
  return record
}

async function magicLinkToken(config, email) {
  const response = await fetch(`${config.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: serviceHeaders(config.service),
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  const body = await response.json().catch(() => ({}))
  const tokenHash = body.hashed_token || body.properties?.hashed_token
  if (!response.ok || !tokenHash) throw new Error(body.message || 'Could not finish phone sign-in')
  return tokenHash
}

export async function verifyFirebasePhoneAndCreateSession(idToken, config, addCredits) {
  if (!idToken) throw new Error('Firebase verification token is required')
  if (!config?.url || !config?.service) throw new Error('Supabase server authentication is not configured')
  const firebaseUser = await firebaseAuth().verifyIdToken(idToken, true)
  if (!firebaseUser.phone_number) throw new Error('Firebase did not confirm a phone number')

  const fingerprint = phoneFingerprint(firebaseUser.phone_number, config.service)
  let link = await linkedUser(config, fingerprint)
  if (!link) link = await createSupabasePhoneUser(config, firebaseUser, fingerprint)

  const user = { id: link.user_id, email: link.internal_email }
  const creditResult = await addCredits(user, 10, config, {
    reference: `firebase-phone:${fingerprint}`,
    type: 'welcome',
    reason: 'Verified phone welcome credits',
    metadata: { source: 'firebase_phone', phoneFingerprint: fingerprint },
  })
  const tokenHash = await magicLinkToken(config, link.internal_email)
  return {
    tokenHash,
    otpType: 'magiclink',
    credits: Number(creditResult.remaining) || 0,
    phone: maskedPhone(firebaseUser.phone_number),
  }
}

