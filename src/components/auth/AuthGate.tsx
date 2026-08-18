import { useEffect, useState, type PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, isGoogleSignupPending } from '../../lib/auth'

export default function AuthGate({ children }: PropsWithChildren) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [graceExpired, setGraceExpired] = useState(false)
  const isOAuthPending = isGoogleSignupPending()

  useEffect(() => {
    if (loading || user || !isOAuthPending) return
    const timer = window.setTimeout(() => setGraceExpired(true), 4000)
    return () => clearTimeout(timer)
  }, [loading, user, isOAuthPending])

  useEffect(() => {
    if (user) setGraceExpired(false)
  }, [user])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-white">
        <div className="w-full max-w-sm animate-pulse space-y-3 px-5">
          <div className="mx-auto size-12 rounded-full bg-violet-500/10" />
          <div className="h-5 rounded bg-violet-500/10" />
          <div className="h-12 rounded-xl bg-violet-500/10" />
        </div>
      </div>
    )
  }

  if (!user) {
    if (isOAuthPending && !graceExpired) {
      return (
        <div className="grid min-h-screen place-items-center bg-background text-white">
          <div className="flex flex-col items-center gap-4">
            <div className="size-10 animate-pulse rounded-full bg-violet-500/10" />
            <p className="text-[12px] text-white/20">Completing sign in...</p>
          </div>
        </div>
      )
    }
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />
  }

  return children
}
