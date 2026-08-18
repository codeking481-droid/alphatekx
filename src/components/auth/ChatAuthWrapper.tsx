import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, isGoogleSignupPending } from '../../lib/auth'

function Gate({ children }: PropsWithChildren) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [graceExpired, setGraceExpired] = useState(false)
  const isOAuthPending = isGoogleSignupPending()

  // Give OAuth flow time to complete — Google redirect strips fragments
  // and onAuthStateChange needs a moment to fire after setSession.
  useEffect(() => {
    if (loading || user || !isOAuthPending) return
    const timer = window.setTimeout(() => setGraceExpired(true), 4000)
    return () => clearTimeout(timer)
  }, [loading, user, isOAuthPending])

  // Also reset grace if loading finishes with a user
  useEffect(() => {
    if (user) setGraceExpired(false)
  }, [user])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0A0A0A]">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 animate-pulse rounded-full bg-[#D6FF00]/10" />
          <p className="text-[12px] text-white/20">
            {isOAuthPending ? 'Completing sign in...' : 'Loading...'}
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    // If OAuth is still pending (Google redirect just happened), show spinner
    // instead of redirecting — the session may still be restoring.
    if (isOAuthPending && !graceExpired) {
      return (
        <div className="grid min-h-screen place-items-center bg-[#0A0A0A]">
          <div className="flex flex-col items-center gap-4">
            <div className="size-10 animate-pulse rounded-full bg-[#D6FF00]/10" />
            <p className="text-[12px] text-white/20">Completing sign in...</p>
          </div>
        </div>
      )
    }
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

export default function ChatAuthWrapper({ children }: PropsWithChildren) {
  return <Gate>{children}</Gate>
}
