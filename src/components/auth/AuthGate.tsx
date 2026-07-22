import type { PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export default function AuthGate({ children }: PropsWithChildren) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-white"><div className="w-full max-w-sm animate-pulse space-y-3 px-5"><div className="mx-auto size-12 rounded-full bg-white/10"/><div className="h-5 rounded bg-white/10"/><div className="h-12 rounded-xl bg-white/[.06]"/></div></div>
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />
  return children
}
