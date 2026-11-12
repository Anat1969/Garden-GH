import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
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

// אחרי עדכון גרסה, קבצי קוד ישנים כבר לא קיימים בשרת. במקום דף ריק: טעינה מחדש אחת של הגרסה החדשה
function lazyRetry<T extends { default: ComponentType }>(load: () => Promise<T>) {
  return lazy(async () => {
    try {
      const m = await load()
      sessionStorage.removeItem('gh-reloaded')
      return m
    } catch (e) {
      if (!sessionStorage.getItem('gh-reloaded')) {
        sessionStorage.setItem('gh-reloaded', '1')
        window.location.reload()
        return new Promise<T>(() => undefined)
      }
      throw e
    }
  })
}

const PermitTab = lazyRetry(() => import('./pages/PermitTab'))
const PlanTab = lazyRetry(() => import('./pages/PlanTab'))
const DimsTab = lazyRetry(() => import('./pages/DimsTab'))
const ModelTab = lazyRetry(() => import('./pages/ModelTab'))
const DesignTab = lazyRetry(() => import('./pages/DesignTab'))
const BriefTab = lazyRetry(() => import('./pages/BriefTab'))
const Guide = lazyRetry(() => import('./pages/Guide'))
const SheetPage = lazyRetry(() => import('./pages/SheetPage'))
const SheetRender = lazyRetry(() => import('./pages/SheetPage').then((m) => ({ default: m.SheetRender })))

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <div className="card">
          <div className="state" role="alert">
            <div className="h-section">הדף לא נטען</div>
            <div>ייתכן שיש גרסה חדשה של האפליקציה.</div>
            <button className="btn primary" onClick={() => window.location.reload()}>
              טעינה מחדש
            </button>
          </div>
        </div>
      )
    return this.props.children
  }
}

export default function App() {
  const loc = useLocation()
  return (
    <>
      <TopBar />
      <main>
        <PageBoundary key={loc.pathname}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/sheet-render" element={<SheetRender />} />
            <Route path="/p/:id" element={<ProjectLayout />}>
              <Route index element={<Overview />} />
              <Route path="permit" element={<PermitTab />} />
              <Route path="dims" element={<DimsTab />} />
              <Route path="brief" element={<BriefTab />} />
              <Route path="design" element={<DesignTab />} />
              <Route path="plan" element={<PlanTab />} />
              <Route path="model" element={<ModelTab />} />
              <Route path="bom" element={<BomTab />} />
              <Route path="phases" element={<PhasesTab />} />
              <Route path="sheet" element={<SheetPage />} />
              <Route path="variants" element={<VariantsTab />} />
            </Route>
            <Route path="/prices" element={<Prices />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </PageBoundary>
      </main>
      <footer className="footer">תכנון גינה · {'הערכה בלבד עד לאישור מול מחירון מעודכן וספק.'}</footer>
      <ToastHost />
    </>
  )
}
