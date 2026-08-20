import type { PropsWithChildren } from 'react'
import AuthGate from './AuthGate'

export default function ProtectedPage({ children }: PropsWithChildren) {
  return <AuthGate>{children}</AuthGate>
}
