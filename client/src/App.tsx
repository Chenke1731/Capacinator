import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './i18n';
import { UserProvider, useUser } from './contexts/UserContext';
import { ScenarioProvider } from './contexts/ScenarioContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetail } from './pages/ProjectDetail';
import { ProjectNew } from './pages/ProjectNew';
import PersonDetails from './pages/PersonDetails';
import { PersonNew } from './pages/PersonNew';
import RoleDetails from './pages/RoleDetails';
import ProjectTypeDetails from './pages/ProjectTypeDetails';
import ProjectsUnified from './pages/ProjectsUnified';
import PeopleUnified from './pages/PeopleUnified';
import Assignments from './pages/Assignments';
import { Scenarios } from './pages/Scenarios';
import { AuditLog } from './pages/AuditLog';
import ReportsUnified from './pages/ReportsUnified';
import Settings from './pages/Settings';
import { NotFound } from './components/NotFound';
import ImportUnified from './pages/ImportUnified';
import { Locations } from './pages/Locations';
import { Toaster } from './components/ui/toaster';
import './globals.css';
import './App.css';

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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsUnified />} />
          <Route path="/projects/new" element={<ProjectNew />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/roadmap" element={<Navigate to="/projects?tab=roadmap" replace />} />
          <Route path="/people" element={<PeopleUnified />} />
          <Route path="/people/new" element={<PersonNew />} />
          <Route path="/people/:id" element={<PersonDetails />} />
          <Route path="/roles" element={<Navigate to="/people" replace />} />
          <Route path="/roles/:id" element={<RoleDetails />} />
          <Route path="/resource-templates" element={<Navigate to="/people" replace />} />
          <Route path="/allocations" element={<Navigate to="/people" replace />} />
          <Route path="/project-types" element={<Navigate to="/projects" replace />} />
          <Route path="/project-types/:id" element={<ProjectTypeDetails />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/assignments/:id" element={<Navigate to="/assignments" replace />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/availability" element={<Navigate to="/people" replace />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/reports" element={<ReportsUnified />} />
          <Route path="/import" element={<ImportUnified />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
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
              <AppContent />
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
