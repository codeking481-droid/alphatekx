import type { PropsWithChildren } from 'react'
import WorkspaceLayout from '../workspace/WorkspaceLayout'
import AuthGate from './AuthGate'

export default function ProtectedPage({ children }: PropsWithChildren) {
  return <AuthGate><WorkspaceLayout>{children}</WorkspaceLayout></AuthGate>
}
