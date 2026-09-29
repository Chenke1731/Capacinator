import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './i18n';
import { UserProvider, useUser } from './contexts/UserContext';
import { ScenarioProvider } from './contexts/ScenarioContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Toaster } from './components/ui/toaster';
import ErrorBoundary from './components/ErrorBoundary';
import './globals.css';
import './App.css';

// P8 code-splitting: every route is its own chunk — the first screen no
// longer parses 27 unrelated pages (recharts lands with Dashboard only).
// Named exports get mapped to a default for lazy().
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const ProjectNew = lazy(() => import('./pages/ProjectNew').then(m => ({ default: m.ProjectNew })));
const PersonDetails = lazy(() => import('./pages/PersonDetails'));
const PersonNew = lazy(() => import('./pages/PersonNew').then(m => ({ default: m.PersonNew })));
const RoleDetails = lazy(() => import('./pages/RoleDetails'));
const ProjectTypeDetails = lazy(() => import('./pages/ProjectTypeDetails'));
const ProjectsUnified = lazy(() => import('./pages/ProjectsUnified'));
const Iterations = lazy(() => import('./pages/Iterations'));
const PeopleUnified = lazy(() => import('./pages/PeopleUnified'));
const Assignments = lazy(() => import('./pages/Assignments'));
const Scenarios = lazy(() => import('./pages/Scenarios').then(m => ({ default: m.Scenarios })));
const AuditLog = lazy(() => import('./pages/AuditLog').then(m => ({ default: m.AuditLog })));
const ReportsUnified = lazy(() => import('./pages/ReportsUnified'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./components/NotFound').then(m => ({ default: m.NotFound })));
const ImportUnified = lazy(() => import('./pages/ImportUnified'));
const Locations = lazy(() => import('./pages/Locations').then(m => ({ default: m.Locations })));
const Components = lazy(() => import('./pages/Components').then(m => ({ default: m.Components })));

/** Route-level loading shell (suspense fallback) */
const PageLoading = () => (
  <div className="page-container" role="status" aria-busy="true">
    <div style={{ padding: '4rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>…</div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      // switching windows back must not refire every active query —
      // that was perceived as random stutter
      refetchOnWindowFocus: false,
    },
  },
});

// Per-page boundary wrapper: a crashing page renders the error card in
// the Layout content area while the shell (nav) stays alive (I1);
// Suspense covers the lazy chunk load on first visit (P8).
const page = (node: React.ReactNode) => (
  <ErrorBoundary>
    <Suspense fallback={<PageLoading />}>{node}</Suspense>
  </ErrorBoundary>
);

const AppContent: React.FC = () => {
  // ⚡CapaDebug: dev 专属诊断面板(热键 Ctrl+Shift+D);动态导入使 release
  // 构建经 DCE 整包剔除(验证: dist 内 grep 不到面板标记)
  const [DevPanel, setDevPanel] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV) {
      import('./debug/BoardDiagnostics').then((m) => setDevPanel(() => m.BoardDiagnostics));
    }
  }, []);
  const { isLoggedIn } = useUser();

  return (
    <>
      {DevPanel && <DevPanel />}
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={page(<Dashboard />)} />
          <Route path="/projects" element={page(<ProjectsUnified />)} />
          <Route path="/projects/new" element={page(<ProjectNew />)} />
          <Route path="/projects/:id" element={page(<ProjectDetail />)} />
          <Route path="/iterations" element={page(<Iterations />)} />
          <Route path="/roadmap" element={<Navigate to="/projects?tab=roadmap" replace />} />
          <Route path="/people" element={page(<PeopleUnified />)} />
          <Route path="/people/new" element={page(<PersonNew />)} />
          <Route path="/people/:id" element={page(<PersonDetails />)} />
          <Route path="/roles" element={<Navigate to="/people" replace />} />
          <Route path="/roles/:id" element={page(<RoleDetails />)} />
          <Route path="/resource-templates" element={<Navigate to="/people" replace />} />
          <Route path="/allocations" element={<Navigate to="/people" replace />} />
          <Route path="/project-types" element={<Navigate to="/projects" replace />} />
          <Route path="/project-types/:id" element={page(<ProjectTypeDetails />)} />
          <Route path="/assignments" element={page(<Assignments />)} />
          <Route path="/assignments/:id" element={<Navigate to="/assignments" replace />} />
          <Route path="/scenarios" element={page(<Scenarios />)} />
          <Route path="/availability" element={<Navigate to="/people" replace />} />
          <Route path="/audit-log" element={page(<AuditLog />)} />
          <Route path="/reports" element={page(<ReportsUnified />)} />
          <Route path="/import" element={page(<ImportUnified />)} />
          <Route path="/locations" element={page(<Locations />)} />
          <Route path="/components" element={page(<Components />)} />
          <Route path="/settings" element={page(<Settings />)} />
          <Route path="*" element={page(<NotFound />)} />
        </Routes>
      </Layout>
      {!isLoggedIn && <Login />}
    </>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UserProvider>
          <ScenarioProvider>
            <Router>
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
            </Router>
          </ScenarioProvider>
        </UserProvider>
      </ThemeProvider>
      <Toaster />
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}

export default App;
