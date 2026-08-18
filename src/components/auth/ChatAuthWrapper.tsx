import type { PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

function Gate({ children }: PropsWithChildren) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0A0A0A]">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 animate-pulse rounded-full bg-[#D6FF00]/10" />
          <div className="h-3 w-32 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

export default function ChatAuthWrapper({ children }: PropsWithChildren) {
  return <Gate>{children}</Gate>
}
