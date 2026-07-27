import { getApp, getApps, initializeApp } from 'firebase/app'
import { ConfirmationResult, getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'

const config = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || ''),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || ''),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || ''),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || ''),
}

export const firebasePhoneConfigured = Object.values(config).every(Boolean)

let verifier: RecaptchaVerifier | null = null

function phoneAuth() {
  if (!firebasePhoneConfigured) throw new Error('Phone signup is not configured yet')
  const app = getApps().length ? getApp() : initializeApp(config)
  return getAuth(app)
}

export async function sendFirebasePhoneCode(phone: string): Promise<ConfirmationResult> {
  const auth = phoneAuth()
  verifier?.clear()
  verifier = new RecaptchaVerifier(auth, 'firebase-recaptcha', {
    size: 'invisible',
    callback: () => undefined,
  })
  return signInWithPhoneNumber(auth, phone, verifier)
}

export async function finishFirebasePhoneSignIn(confirmation: ConfirmationResult, code: string) {
  const credential = await confirmation.confirm(code)
  return credential.user.getIdToken(true)
}

