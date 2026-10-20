import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { Loading, ToastHost } from './components/ui'
import Home from './pages/Home'
import Projects from './pages/Projects'
import ProjectLayout from './pages/ProjectLayout'
import Overview from './pages/Overview'
import BomTab from './pages/BomTab'
import PhasesTab from './pages/PhasesTab'
import VariantsTab from './pages/VariantsTab'
import Prices from './pages/Prices'
import NotFound from './pages/NotFound'

const PermitTab = lazy(() => import('./pages/PermitTab'))
const PlanTab = lazy(() => import('./pages/PlanTab'))
const DimsTab = lazy(() => import('./pages/DimsTab'))
const ModelTab = lazy(() => import('./pages/ModelTab'))

export default function App() {
  return (
    <>
      <TopBar />
      <main>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/p/:id" element={<ProjectLayout />}>
              <Route index element={<Overview />} />
              <Route path="permit" element={<PermitTab />} />
              <Route path="dims" element={<DimsTab />} />
              <Route path="plan" element={<PlanTab />} />
              <Route path="model" element={<ModelTab />} />
              <Route path="bom" element={<BomTab />} />
              <Route path="phases" element={<PhasesTab />} />
              <Route path="variants" element={<VariantsTab />} />
            </Route>
            <Route path="/prices" element={<Prices />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="footer">Garden-GH · {'הערכה בלבד עד לאישור מול מחירון מעודכן וספק.'}</footer>
      <ToastHost />
    </>
  )
}
