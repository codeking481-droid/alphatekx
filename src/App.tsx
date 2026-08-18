import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ContactUs from './components/ContactUs'
import Landing from './pages/Landing'
import About from './pages/About'
import { AuthProvider } from './lib/auth'

const AuthRoute = lazy(() => import('./pages/AuthRoute'))
const ProtectedPage = lazy(() => import('./components/auth/ProtectedPage'))
const AlphaChat = lazy(() => import('./pages/AlphaChat'))
const Home = lazy(() => import('./pages/Home'))
const ScanPage = lazy(() => import('./pages/ScanPage'))
const RestorePage = lazy(() => import('./pages/RestorePage'))
const MarketPage = lazy(() => import('./pages/MarketPage'))
const MarketplaceNew = lazy(() => import('./pages/MarketplaceNew'))
const Automations = lazy(() => import('./pages/Agents'))
const ActiveAutomations = lazy(() => import('./pages/ActiveAutomations'))
const Connectors = lazy(() => import('./pages/Connectors'))
const History = lazy(() => import('./pages/History'))
const Settings = lazy(() => import('./pages/Settings'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const ContentPage = lazy(() => import('./pages/ContentPage'))
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'))
const PublicBuilderProject = lazy(() => import('./pages/PublicBuilderProject'))
const FoundersLegacy = lazy(() => import('./pages/FoundersLegacy'))
const Admin = lazy(() => import('./pages/Admin'))
const AdminAgents = lazy(() => import('./pages/AdminAgents'))
const AdminWithdrawals = lazy(() => import('./pages/AdminWithdrawals'))

const loader = <div className="workspace-living-bg grid min-h-screen place-items-center text-sm font-bold text-slate-300"><span className="skeleton rounded-xl px-6 py-3">Loading AlphaTekx…</span></div>
const suspended = (page: ReactNode) => <Suspense fallback={loader}>{page}</Suspense>
const protectedPage = (page: ReactNode) => suspended(<ProtectedPage>{suspended(page)}</ProtectedPage>)

// Backward-compatible aliases and retired product routes redirect to the Alpha HQ.
const toDashboard = <Navigate to="/agen" replace />
const toSettings = <Navigate to="/settings" replace />
const toAutomations = <Navigate to="/automations" replace />

function LandingRoute() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  if (query.has('error') || query.has('error_code') || query.has('error_description')) {
    return <Navigate to={`/auth${location.search}`} replace />
  }
  return <AuthProvider><Landing /></AuthProvider>
}

export default function App() {
  return (
    <>
      <div className="aurora-blob aurora-blob-one" aria-hidden="true"/>
      <div className="aurora-blob aurora-blob-two" aria-hidden="true"/>
      <div className="aurora-blob aurora-blob-three" aria-hidden="true"/>
      <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/about" element={<About />} />
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />

      {/* Core authenticated product */}
      <Route path="/chat" element={suspended(<AlphaChat />)} />
      <Route path="/agen" element={<Navigate to="/chat" replace />} />
      <Route path="/dashboard" element={<Navigate to="/chat" replace />} />
      <Route path="/onboarding" element={<Navigate to="/chat" replace />} />
      <Route path="/scan" element={protectedPage(<ScanPage />)} />
      <Route path="/restore" element={protectedPage(<RestorePage />)} />
      <Route path="/market" element={protectedPage(<MarketPage />)} />
      <Route path="/marketplace/new" element={protectedPage(<MarketplaceNew />)} />
      <Route path="/automations" element={protectedPage(<Automations />)} />
      <Route path="/active-automations" element={protectedPage(<ActiveAutomations />)} />
      <Route path="/active-automations/:id" element={protectedPage(<ActiveAutomations />)} />
      <Route path="/history" element={protectedPage(<History />)} />
      <Route path="/connected-apps" element={protectedPage(<Connectors />)} />
      <Route path="/connectors" element={protectedPage(<Connectors />)} />
      <Route path="/apps" element={protectedPage(<Connectors />)} />
      <Route path="/media-library" element={protectedPage(<MediaLibrary />)} />
      <Route path="/marketplace" element={protectedPage(<MarketPage />)} />
      <Route path="/marketplace/:id" element={protectedPage(<MarketPage />)} />
      <Route path="/builder" element={<Navigate to="/active-automations" replace />} />
      <Route path="/builder/*" element={<Navigate to="/active-automations" replace />} />
      <Route path="/leads" element={toDashboard} />
      <Route path="/ceo" element={toDashboard} />
      <Route path="/settings" element={protectedPage(<Settings />)} />
      <Route path="/help" element={protectedPage(<ContentPage slug="help" workspace />)} />

      {/* Admin */}
      <Route path="/admin" element={protectedPage(<Admin />)} />
      <Route path="/admin/agents" element={protectedPage(<AdminAgents />)} />
      <Route path="/admin/withdrawals" element={protectedPage(<AdminWithdrawals />)} />
      <Route path="/admin/features" element={toDashboard} />

      {/* Public */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/contact" element={<ContentPage slug="contact" />} />
      <Route path="/status" element={<ContentPage slug="status" />} />
      <Route path="/cookie-policy" element={<ContentPage slug="cookie-policy" />} />
      <Route path="/updates" element={<ContentPage slug="updates" />} />
      <Route path="/founders-legacy" element={suspended(<FoundersLegacy />)} />
      <Route path="/b/:slug" element={suspended(<PublicBuilderProject />)} />

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
      <Route path="/build-start" element={toDashboard} />
      <Route path="/store" element={toDashboard} />
      <Route path="/launch" element={toDashboard} />
      <Route path="/creations" element={toDashboard} />
      <Route path="/vault" element={toDashboard} />
      <Route path="/workers" element={toDashboard} />
      <Route path="/account" element={toSettings} />
      <Route path="/account/revenue" element={toSettings} />
      <Route path="/settings/api-keys" element={toSettings} />

      <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
      <ContactUs />
    </>
  )
}
