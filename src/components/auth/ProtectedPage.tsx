import type { PropsWithChildren } from 'react'
import { AuthProvider } from '../../lib/auth'
import WorkspaceLayout from '../workspace/WorkspaceLayout'
import AuthGate from './AuthGate'

export default function ProtectedPage({ children }: PropsWithChildren) {
  return <AuthProvider><AuthGate><WorkspaceLayout>{children}</WorkspaceLayout></AuthGate></AuthProvider>
}
