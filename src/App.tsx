import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import About from './pages/About'

const AuthRoute = lazy(() => import('./pages/AuthRoute'))
const ProtectedPage = lazy(() => import('./components/auth/ProtectedPage'))
const Builder = lazy(() => import('./pages/Builder'))
const Creations = lazy(() => import('./pages/Creations'))
const Home = lazy(() => import('./pages/Home'))
const Launch = lazy(() => import('./pages/Launch'))
const Marketplace = lazy(() => import('./pages/Marketplace'))
const Account = lazy(() => import('./pages/Account'))
const Revenue = lazy(() => import('./pages/Revenue'))
const Creator = lazy(() => import('./pages/Creator'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const BuildStart = lazy(() => import('./pages/BuildStart'))

const loader = <div className="grid min-h-screen place-items-center bg-[#FAFAFA] text-sm text-gray-500">Loading AlphaTekx...</div>
const suspended = (page: ReactNode) => <Suspense fallback={loader}>{page}</Suspense>
const protectedPage = (page: ReactNode) => suspended(<ProtectedPage>{suspended(page)}</ProtectedPage>)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/about" element={<About />} />
      <Route path="/auth" element={suspended(<AuthRoute />)} />
      <Route path="/workspace" element={protectedPage(<Home />)} />
      <Route path="/mission/:id" element={protectedPage(<Builder />)} />
      <Route path="/builder" element={protectedPage(<BuildStart />)} />
      <Route path="/marketplace" element={protectedPage(<Marketplace />)} />
      <Route path="/vault" element={protectedPage(<Creations />)} />
      <Route path="/creations" element={<Navigate to="/vault" replace />} />
      <Route path="/launch" element={protectedPage(<Launch />)} />
      <Route path="/account" element={protectedPage(<Account />)} />
      <Route path="/account/revenue" element={protectedPage(<Revenue />)} />
      <Route path="/creator/:id" element={protectedPage(<Creator />)} />
      <Route path="/settings/api-keys" element={protectedPage(<ApiKeys />)} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  )
}
