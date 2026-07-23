import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
const Landing = lazy(() => import('./pages/Landing'))
import About from './pages/About'
import { AuthProvider } from './lib/auth'

const AuthRoute = lazy(() => import('./pages/AuthRoute'))
const ProtectedPage = lazy(() => import('./components/auth/ProtectedPage'))
const Home = lazy(() => import('./pages/Home'))
const Automations = lazy(() => import('./pages/Agents'))
const ActiveAutomations = lazy(() => import('./pages/ActiveAutomations'))
const Connectors = lazy(() => import('./pages/Connectors'))
const History = lazy(() => import('./pages/History'))
const Settings = lazy(() => import('./pages/Settings'))
const Admin = lazy(() => import('./pages/Admin'))
const AdminAgents = lazy(() => import('./pages/AdminAgents'))
const AdminWithdrawals = lazy(() => import('./pages/AdminWithdrawals'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const ContentPage = lazy(() => import('./pages/ContentPage'))

const loader = <div className="grid min-h-screen place-items-center bg-[#0B0215] text-sm text-zinc-500">Loading AlphaTekx...</div>
const suspended = (page: ReactNode) => <Suspense fallback={loader}>{page}</Suspense>
const protectedPage = (page: ReactNode) => suspended(<ProtectedPage>{suspended(page)}</ProtectedPage>)

// Backward-compatible aliases and retired product routes redirect to the dashboard.
const toDashboard = <Navigate to="/dashboard" replace />
const toSettings = <Navigate to="/settings" replace />
const toAutomations = <Navigate to="/automations" replace />

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthProvider>{suspended(<Landing />)}</AuthProvider>} />
      <Route path="/about" element={<About />} />
      <Route path="/auth" element={suspended(<AuthRoute />)} />

      {/* Core authenticated product */}
      <Route path="/dashboard" element={protectedPage(<Home />)} />
      <Route path="/automations" element={protectedPage(<Automations />)} />
      <Route path="/active-automations" element={protectedPage(<ActiveAutomations />)} />
      <Route path="/active-automations/:id" element={protectedPage(<ActiveAutomations />)} />
      <Route path="/history" element={protectedPage(<History />)} />
      <Route path="/connected-apps" element={protectedPage(<Connectors />)} />
      <Route path="/connectors" element={protectedPage(<Connectors />)} />
      <Route path="/settings" element={protectedPage(<Settings />)} />
      <Route path="/help" element={<ContentPage slug="help" />} />

      {/* Admin */}
      <Route path="/admin" element={protectedPage(<Admin />)} />
      <Route path="/admin/agents" element={protectedPage(<AdminAgents />)} />
      <Route path="/admin/withdrawals" element={protectedPage(<AdminWithdrawals />)} />

      {/* Public */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/contact" element={<ContentPage slug="contact" />} />
      <Route path="/status" element={<ContentPage slug="status" />} />
      <Route path="/cookie-policy" element={<ContentPage slug="cookie-policy" />} />
      <Route path="/updates" element={<ContentPage slug="updates" />} />

      {/* Backward-compatible redirect: /agents -> /automations */}
      <Route path="/agents" element={toAutomations} />
      <Route path="/agents/:id" element={<Navigate to="/active-automations" replace />} />

      {/* Retired product routes - redirect safely to dashboard */}
      <Route path="/workspace" element={toDashboard} />
      <Route path="/home" element={toDashboard} />
      <Route path="/missions" element={toDashboard} />
      <Route path="/projects" element={toDashboard} />
      <Route path="/memory" element={toDashboard} />
      <Route path="/brain" element={toDashboard} />
      <Route path="/chat" element={toDashboard} />
      <Route path="/standards" element={toDashboard} />
      <Route path="/builder" element={toDashboard} />
      <Route path="/build-start" element={toDashboard} />
      <Route path="/marketplace" element={toDashboard} />
      <Route path="/marketplace/new" element={toDashboard} />
      <Route path="/marketplace/:id" element={toDashboard} />
      <Route path="/store" element={toDashboard} />
      <Route path="/launch" element={toDashboard} />
      <Route path="/creations" element={toDashboard} />
      <Route path="/vault" element={toDashboard} />
      <Route path="/workers" element={toDashboard} />
      <Route path="/account" element={toSettings} />
      <Route path="/account/revenue" element={toSettings} />
      <Route path="/settings/api-keys" element={toSettings} />

      <Route path="*" element={toDashboard} />
    </Routes>
  )
}
