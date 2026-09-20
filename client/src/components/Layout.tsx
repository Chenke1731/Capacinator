import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  BarChart3,
  Settings,
  GitBranch,
  ClipboardList,
  History,
  MapPin,
  ArrowUpDown,
} from 'lucide-react';
import { AppHeader } from './AppHeader';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { nameKey: 'navigation:dashboard', href: '/dashboard', icon: LayoutDashboard },
  { nameKey: 'navigation:projects', href: '/projects', icon: FolderKanban },
  { nameKey: 'navigation:people', href: '/people', icon: Users },
  { nameKey: 'navigation:assignments', href: '/assignments', icon: ClipboardList },
  { nameKey: 'navigation:scenarios', href: '/scenarios', icon: GitBranch },
  { nameKey: 'navigation:reports', href: '/reports', icon: BarChart3 },
  { nameKey: 'navigation:importExport', href: '/import', icon: ArrowUpDown },
  { nameKey: 'navigation:locations', href: '/locations', icon: MapPin },
  { nameKey: 'navigation:auditLog', href: '/audit-log', icon: History },
  { nameKey: 'navigation:settings', href: '/settings', icon: Settings },
];

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="layout">
      <AppHeader />

      <div className="layout-body">
        <nav className="sidebar">
          <div className="sidebar-header">
            <img src="/capacinator_inator_transparent_logo.png" alt="Capacinator" className="logo-icon" />
            <div className="logo-text">Capacinator</div>
          </div>

          <ul className="nav-list">
            {navigation.map((item) => {
              const Icon = item.icon;
              const name = t(item.nameKey);

              return (
                <li key={item.href}>
                  <NavLink
                    to={item.href}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? 'active' : ''}`
                    }
                  >
                    <Icon className="nav-icon" size={20} />
                    <span>{name}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>

          <div className="sidebar-footer">
            <div className="version">v1.0.0</div>
          </div>
        </nav>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}