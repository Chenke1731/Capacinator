import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CriticalAlertsPanel } from '../CriticalAlertsPanel';

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  AlertTriangle: ({ className, 'aria-hidden': ariaHidden }: any) => (
    <svg className={className} aria-hidden={ariaHidden} data-testid="alert-triangle-icon" />
  ),
  Clock: ({ className, 'aria-hidden': ariaHidden }: any) => (
    <svg className={className} aria-hidden={ariaHidden} data-testid="clock-icon" />
  ),
  Users: ({ className, 'aria-hidden': ariaHidden }: any) => (
    <svg className={className} aria-hidden={ariaHidden} data-testid="users-icon" />
  ),
  TrendingDown: ({ className, 'aria-hidden': ariaHidden }: any) => (
    <svg className={className} aria-hidden={ariaHidden} data-testid="trending-down-icon" />
  ),
  ExternalLink: ({ className, 'aria-hidden': ariaHidden }: any) => (
    <svg className={className} aria-hidden={ariaHidden} data-testid="external-link-icon" />
  ),
  ChevronRight: ({ className, 'aria-hidden': ariaHidden }: any) => (
    <svg className={className} aria-hidden={ariaHidden} data-testid="chevron-right-icon" />
  )
}));

describe('CriticalAlertsPanel', () => {
  const mockAlerts = [
    {
      id: 'alert-1',
      type: 'capacity_gap' as const,
      severity: 'critical' as const,
      title: 'Capacity Gap Detected',
      description: '5 projects need more resources',
      actionText: 'View Capacity Report',
      navigationPath: '/capacity',
      count: 5
    },
    {
      id: 'alert-2',
      type: 'project_risk' as const,
      severity: 'high' as const,
      title: 'Project at Risk',
      description: 'Project X is behind schedule',
      actionText: 'View Project Details',
      navigationPath: '/projects/x'
    },
    {
      id: 'alert-3',
      type: 'deadline_warning' as const,
      severity: 'medium' as const,
      title: 'Upcoming Deadline',
      description: 'Milestone due soon',
      actionText: 'View Timeline',
      navigationPath: '/timeline',
      dueDate: '2025-12-31'
    },
    {
      id: 'alert-4',
      type: 'over_allocation' as const,
      severity: 'critical' as const,
      title: 'Over Allocation',
      description: '3 team members over-allocated',
      actionText: 'View Allocations',
      navigationPath: '/allocations',
      count: 3
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty State', () => {
    it('displays healthy state when no alerts', () => {
      render(<CriticalAlertsPanel alerts={[]} />);

      expect(screen.getByText('System Status')).toBeInTheDocument();
      expect(screen.getByText('All Systems Healthy')).toBeInTheDocument();
      expect(screen.getByText('No critical capacity issues detected')).toBeInTheDocument();
    });

    it('renders Users icon in healthy state', () => {
      render(<CriticalAlertsPanel alerts={[]} />);

      expect(screen.getByTestId('users-icon')).toBeInTheDocument();
    });

    it('applies custom className in empty state', () => {
      const { container } = render(<CriticalAlertsPanel alerts={[]} className="custom-class" />);

      const panel = container.querySelector('.dashboard-alerts-panel.custom-class');
      expect(panel).toBeInTheDocument();
    });
  });

  describe('Alert Rendering', () => {
    it('displays all alerts', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      expect(screen.getByText('Capacity Gap Detected')).toBeInTheDocument();
      expect(screen.getByText('Project at Risk')).toBeInTheDocument();
      expect(screen.getByText('Upcoming Deadline')).toBeInTheDocument();
      expect(screen.getByText('Over Allocation')).toBeInTheDocument();
    });

    it('displays alert descriptions', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      expect(screen.getByText('5 projects need more resources')).toBeInTheDocument();
      expect(screen.getByText('Project X is behind schedule')).toBeInTheDocument();
      expect(screen.getByText('Milestone due soon')).toBeInTheDocument();
      expect(screen.getByText('3 team members over-allocated')).toBeInTheDocument();
    });

    it('displays action text for each alert', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      expect(screen.getByText('View Capacity Report')).toBeInTheDocument();
      expect(screen.getByText('View Project Details')).toBeInTheDocument();
      expect(screen.getByText('View Timeline')).toBeInTheDocument();
      expect(screen.getByText('View Allocations')).toBeInTheDocument();
    });

    it('displays count badge when count is provided', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const countBadges = screen.getAllByText(/^[0-9]+$/);
      expect(countBadges.length).toBeGreaterThanOrEqual(2); // At least 2 alerts have counts
    });

    it('displays due date when provided', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      // Check for "Due:" text
      const dueDateText = screen.getByText(/Due:/);
      expect(dueDateText).toBeInTheDocument();
    });

    it('formats due date correctly', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      // Check that the date is formatted as a localized string
      const formattedDate = new Date('2025-12-31').toLocaleDateString();
      expect(screen.getByText(new RegExp(formattedDate))).toBeInTheDocument();
    });

    it('displays alert count in header', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      expect(screen.getByText('4 issues requiring attention')).toBeInTheDocument();
    });

    it('uses singular form for single alert', () => {
      render(<CriticalAlertsPanel alerts={[mockAlerts[0]]} />);

      expect(screen.getByText('1 issue requiring attention')).toBeInTheDocument();
    });

    it('applies custom className when alerts present', () => {
      const { container } = render(
        <CriticalAlertsPanel alerts={mockAlerts} className="custom-class" />
      );

      const panel = container.querySelector('.dashboard-alerts-panel.custom-class');
      expect(panel).toBeInTheDocument();
    });
  });

  describe('Alert Icons', () => {
    it('renders correct icon for capacity_gap alert', () => {
      const alerts = [mockAlerts[0]];
      render(<CriticalAlertsPanel alerts={alerts} />);

      expect(screen.getByTestId('users-icon')).toBeInTheDocument();
    });

    it('renders correct icon for project_risk alert', () => {
      const alerts = [mockAlerts[1]];
      render(<CriticalAlertsPanel alerts={alerts} />);

      expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
    });

    it('renders correct icon for deadline_warning alert', () => {
      const alerts = [mockAlerts[2]];
      render(<CriticalAlertsPanel alerts={alerts} />);

      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    });

    it('renders correct icon for over_allocation alert', () => {
      const alerts = [mockAlerts[3]];
      render(<CriticalAlertsPanel alerts={alerts} />);

      expect(screen.getByTestId('trending-down-icon')).toBeInTheDocument();
    });

    /* G2（2026-11-15 盲评候选）：四型告警的图标色必须走 --status-* token——
       此前 project_risk 直书 orange 浅色 3.35:1（B1-3/D1 修复），本断言防回退 */
    it('assigns status-token color class per alert type (G2)', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const expected: Array<[RegExp, string]> = [
        [/Capacity Gap Detected/, 'text-[var(--status-danger-text)]'],
        [/Project at Risk/, 'text-[var(--status-risk-text)]'],
        [/Upcoming Deadline/, 'text-[var(--status-warning-text)]'],
        [/Over Allocation/, 'text-[var(--status-danger-text)]'],
      ];
      for (const [titleRe, tokenClass] of expected) {
        const title = screen.getByText(titleRe);
        const item = title.closest('[role="listitem"]');
        const icon = item?.querySelector('svg');
        expect(icon?.getAttribute('class')).toContain(tokenClass);
      }
    });

    it('renders ChevronRight icon for all alerts', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const chevronIcons = screen.getAllByTestId('chevron-right-icon');
      expect(chevronIcons.length).toBe(mockAlerts.length);
    });

    it('renders ExternalLink icon for all alerts', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const externalLinkIcons = screen.getAllByTestId('external-link-icon');
      expect(externalLinkIcons.length).toBe(mockAlerts.length);
    });
  });

  describe('Alert Sorting', () => {
    it('sorts alerts by severity (critical first)', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const alertTitles = screen.getAllByRole('heading', { level: 5 }); // AlertTitle renders as h5

      // Critical alerts should come first
      expect(alertTitles[0]).toHaveTextContent('Capacity Gap Detected'); // critical
      expect(alertTitles[1]).toHaveTextContent('Over Allocation'); // critical
    });

    it('places high severity after critical', () => {
      const alerts = [
        { ...mockAlerts[2], severity: 'medium' as const },
        { ...mockAlerts[1], severity: 'high' as const },
        { ...mockAlerts[0], severity: 'critical' as const }
      ];

      render(<CriticalAlertsPanel alerts={alerts} />);

      const alertTitles = screen.getAllByRole('heading', { level: 5 });

      expect(alertTitles[0]).toHaveTextContent('Capacity Gap Detected'); // critical
      expect(alertTitles[1]).toHaveTextContent('Project at Risk'); // high
      expect(alertTitles[2]).toHaveTextContent('Upcoming Deadline'); // medium
    });

    it('places medium severity last', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const alertTitles = screen.getAllByRole('heading', { level: 5 });

      // Medium alert should be last
      expect(alertTitles[alertTitles.length - 1]).toHaveTextContent('Upcoming Deadline');
    });
  });

  describe('Navigation', () => {
    it('navigates when alert is clicked', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const firstAlert = screen.getByText('Capacity Gap Detected');
      fireEvent.click(firstAlert);

      expect(mockNavigate).toHaveBeenCalledWith('/capacity');
    });

    it('navigates to correct path for each alert', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const secondAlert = screen.getByText('Project at Risk');
      fireEvent.click(secondAlert);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/x');
    });

    it('navigates with Enter key', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const firstAlert = screen.getByText('Capacity Gap Detected').closest('[role="listitem"]');
      expect(firstAlert).toBeInTheDocument();

      if (firstAlert) {
        fireEvent.keyDown(firstAlert, { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith('/capacity');
      }
    });

    it('navigates with Space key', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const firstAlert = screen.getByText('Capacity Gap Detected').closest('[role="listitem"]');
      expect(firstAlert).toBeInTheDocument();

      if (firstAlert) {
        fireEvent.keyDown(firstAlert, { key: ' ' });
        expect(mockNavigate).toHaveBeenCalledWith('/capacity');
      }
    });

    it('does not navigate with other keys', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const firstAlert = screen.getByText('Capacity Gap Detected').closest('[role="listitem"]');
      expect(firstAlert).toBeInTheDocument();

      if (firstAlert) {
        fireEvent.keyDown(firstAlert, { key: 'Escape' });
        expect(mockNavigate).not.toHaveBeenCalled();
      }
    });
  });

  describe('Accessibility', () => {
    it('has proper role attributes', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem').length).toBe(mockAlerts.length);
    });

    it('has proper aria-label for list', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const list = screen.getByRole('list');
      expect(list).toHaveAttribute('aria-label', 'Critical capacity planning alerts');
    });

    it('has proper aria-label for each alert', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const firstAlert = screen.getByLabelText(/critical alert: Capacity Gap Detected/i);
      expect(firstAlert).toBeInTheDocument();
    });

    it('all alerts are keyboard accessible', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const alerts = screen.getAllByRole('listitem');
      alerts.forEach((alert) => {
        expect(alert).toHaveAttribute('tabIndex', '0');
      });
    });

    it('icons have aria-hidden attribute', () => {
      render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const allIcons = [
        ...screen.getAllByTestId('users-icon'),
        ...screen.getAllByTestId('alert-triangle-icon'),
        ...screen.getAllByTestId('clock-icon'),
        ...screen.getAllByTestId('trending-down-icon'),
        ...screen.getAllByTestId('chevron-right-icon'),
        ...screen.getAllByTestId('external-link-icon')
      ];

      allIcons.forEach((icon) => {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles alerts without count', () => {
      const alertsWithoutCount = mockAlerts.filter((a) => !a.count);
      render(<CriticalAlertsPanel alerts={alertsWithoutCount} />);

      expect(screen.getByText('Project at Risk')).toBeInTheDocument();
    });

    it('handles alerts without due date', () => {
      const alertsWithoutDueDate = mockAlerts.filter((a) => !a.dueDate);
      render(<CriticalAlertsPanel alerts={alertsWithoutDueDate} />);

      const dueDateElements = screen.queryAllByText(/Due:/);
      expect(dueDateElements.length).toBe(0);
    });

    it('handles single alert', () => {
      render(<CriticalAlertsPanel alerts={[mockAlerts[0]]} />);

      expect(screen.getByText('Capacity Gap Detected')).toBeInTheDocument();
      expect(screen.getByText('1 issue requiring attention')).toBeInTheDocument();
    });

    it('handles empty className', () => {
      const { container } = render(<CriticalAlertsPanel alerts={mockAlerts} />);

      const panel = container.querySelector('.dashboard-alerts-panel');
      expect(panel).toBeInTheDocument();
    });

    it('renders without className prop', () => {
      const { container } = render(<CriticalAlertsPanel alerts={mockAlerts} />);

      expect(container.querySelector('.dashboard-alerts-panel')).toBeInTheDocument();
    });
  });
});
