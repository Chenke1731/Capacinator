import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AuditLog } from '../AuditLog';
import { apiClient } from '../../lib/api-client';

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Mock the UI components
jest.mock('../../components/ui/DataTable', () => ({
  DataTable: ({ data, columns, loading, emptyMessage }: any) => {
    if (loading && (!data || data.length === 0)) {
      return <div data-testid="loading">Loading...</div>;
    }
    
    return (
      <div data-testid="data-table">
        {data.length === 0 ? (
          <div>{emptyMessage}</div>
        ) : (
          <table>
            <thead>
              <tr>
                {columns.map((col: any) => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((row: any, index: number) => (
                <tr key={row.id || index}>
                  {columns.map((col: any) => (
                    <td key={col.key}>
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  },
}));

jest.mock('../../components/ui/FilterBar', () => ({
  FilterBar: ({ filters, values, onChange }: any) => (
    <div data-testid="filter-bar">
      <select
        value={values.tableName}
        onChange={(e) => onChange('tableName', e.target.value)}
        data-testid="table-filter"
      >
        <option value="">All Tables</option>
        <option value="people">People</option>
        <option value="projects">Projects</option>
        <option value="roles">Roles</option>
        <option value="assignments">Assignments</option>
        <option value="availability">Availability</option>
      </select>
      <select
        value={values.action}
        onChange={(e) => onChange('action', e.target.value)}
        data-testid="action-filter"
      >
        <option value="">All Actions</option>
        <option value="CREATE">Create</option>
        <option value="UPDATE">Update</option>
        <option value="DELETE">Delete</option>
      </select>
      <input
        placeholder="User ID"
        value={values.changedBy}
        onChange={(e) => onChange('changedBy', e.target.value)}
        data-testid="changed-by-input"
      />
      <input
        placeholder="Record ID"
        value={values.recordId}
        onChange={(e) => onChange('recordId', e.target.value)}
        data-testid="record-id-input"
      />
    </div>
  ),
}));

jest.mock('../../components/ui/CustomCard', () => ({
  Card: ({ children }: any) => <div className="card">{children}</div>,
}));

jest.mock('../../components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
}));

jest.mock('../../components/ui/ErrorMessage', () => ({
  ErrorMessage: ({ message }: any) => (
    <div data-testid="error-message">{message}</div>
  ),
}));

// Silence console errors in tests
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('AuditLog Page', () => {
  const mockAuditEntries = [
    {
      id: 'audit-1',
      table_name: 'projects',
      record_id: 'proj-1',
      action: 'CREATE',
      changed_by: 'user123',
      old_values: null,
      new_values: { name: 'New Project', status: 'active' },
      changed_fields: ['name', 'status'],
      request_id: 'req-123',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      comment: 'Initial project creation',
      changed_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 'audit-2',
      table_name: 'people',
      record_id: 'person-1',
      action: 'UPDATE',
      changed_by: 'admin456',
      old_values: { role: 'Developer', location: 'NYC' },
      new_values: { role: 'Senior Developer', location: 'NYC' },
      changed_fields: ['role'],
      request_id: 'req-124',
      ip_address: '192.168.1.2',
      user_agent: 'Chrome/96.0',
      comment: null,
      changed_at: '2024-01-15T14:45:00Z',
    },
    {
      id: 'audit-3',
      table_name: 'assignments',
      record_id: 'assign-1',
      action: 'DELETE',
      changed_by: null,
      old_values: { project_id: 'proj-1', person_id: 'person-1' },
      new_values: null,
      changed_fields: null,
      request_id: null,
      ip_address: null,
      user_agent: null,
      comment: null,
      changed_at: '2024-01-16T09:00:00Z',
    },
  ];

  const mockStats = {
    totalEntries: 150,
    entriesByAction: {
      CREATE: 50,
      UPDATE: 75,
      DELETE: 25,
    },
    entriesByTable: {
      projects: 40,
      people: 35,
      assignments: 30,
      roles: 25,
      availability: 20,
    },
    oldestEntry: '2024-01-01T00:00:00Z',
    newestEntry: '2024-01-16T09:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn();
    window.alert = jest.fn();

    // Setup default mock responses
    (apiClient.get as jest.Mock).mockImplementation((url) => {
      if (url.includes('/audit/stats')) {
        return Promise.resolve({ data: { data: mockStats } });
      }
      if (url.includes('/audit/search')) {
        return Promise.resolve({ data: { data: mockAuditEntries } });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  describe('Table Rendering', () => {
    test('renders audit log table with correct headers', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveTextContent('Date/Time');
      expect(headers[1]).toHaveTextContent('Table');
      expect(headers[2]).toHaveTextContent('Action');
      expect(headers[3]).toHaveTextContent('Changed By');
      expect(headers[4]).toHaveTextContent('Fields Changed');
      expect(headers[5]).toHaveTextContent('Actions');
    });

    test('displays audit entry data correctly', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        const table = screen.getByTestId('data-table');
        expect(within(table).getByText('projects')).toBeInTheDocument();
      });

      const table = screen.getByTestId('data-table');
      expect(within(table).getByText('people')).toBeInTheDocument();
      expect(within(table).getByText('assignments')).toBeInTheDocument();
    });

    test('displays action badges with correct styling', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        const table = screen.getByTestId('data-table');
        expect(within(table).getByText('CREATE')).toBeInTheDocument();
      });

      const table = screen.getByTestId('data-table');
      expect(within(table).getByText('UPDATE')).toBeInTheDocument();
      expect(within(table).getByText('DELETE')).toBeInTheDocument();
    });

    test('displays changed by information', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('user123')).toBeInTheDocument();
      });

      expect(screen.getByText('admin456')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument(); // For null changed_by
    });

    test('displays changed fields', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('name, status')).toBeInTheDocument();
      });

      expect(screen.getByText('role')).toBeInTheDocument();
    });

    test('shows loading state', async () => {
      (apiClient.get as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<AuditLog />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    test('shows error state', async () => {
      (apiClient.get as jest.Mock).mockRejectedValue(
        new Error('Failed to load audit data')
      );

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    test('handles empty audit entries', async () => {
      (apiClient.get as jest.Mock).mockImplementation((url) => {
        if (url.includes('/audit/stats')) {
          return Promise.resolve({ data: { data: mockStats } });
        }
        if (url.includes('/audit/search')) {
          return Promise.resolve({ data: { data: [] } });
        }
      });

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('No audit entries found')).toBeInTheDocument();
      });
    });
  });

  describe('Statistics Display', () => {
    test('displays audit statistics', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('Audit Statistics')).toBeInTheDocument();
      });

      expect(screen.getByText('150')).toBeInTheDocument(); // Total entries
      
      // Multiple elements might have these values
      const fiftyElements = screen.getAllByText('50');
      expect(fiftyElements.length).toBeGreaterThan(0); // CREATE count
      
      expect(screen.getByText('75')).toBeInTheDocument(); // UPDATE count
      
      const twentyFiveElements = screen.getAllByText('25');
      expect(twentyFiveElements.length).toBeGreaterThan(0); // DELETE count
    });

    test('displays date range', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText(/Date Range/)).toBeInTheDocument();
      });

      // Date range should be displayed - check for either format
      const dateElements = screen.getAllByText(/202[34]/); // Matches 2023 or 2024
      expect(dateElements.length).toBeGreaterThan(0);
    });

    test('displays table breakdown', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('By Table')).toBeInTheDocument();
      });

      // Check that table counts are displayed
      expect(screen.getByText('40')).toBeInTheDocument(); // projects count
      expect(screen.getByText('35')).toBeInTheDocument(); // people count
    });
  });

  describe('Actions', () => {
    test('renders action buttons for each entry', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Details')[0]).toBeInTheDocument();
      });

      const detailsButtons = screen.getAllByText('Details');
      const undoButtons = screen.getAllByText('Undo');

      expect(detailsButtons).toHaveLength(3);
      // Only non-DELETE entries have undo buttons
      expect(undoButtons).toHaveLength(2);
    });

    test('toggles expanded entry details', async () => {
      const user = userEvent.setup();
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Details')[0]).toBeInTheDocument();
      });

      // Click details button
      await user.click(screen.getAllByText('Details')[0]);

      // Should show expanded details
      expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
      expect(screen.getByText('ID:')).toBeInTheDocument();
      expect(screen.getByText('audit-1')).toBeInTheDocument();
    });

    test('handles undo action with confirmation', async () => {
      const user = userEvent.setup();
      (window.confirm as jest.Mock).mockReturnValue(true);
      (window.alert as jest.Mock).mockImplementation(() => {});
      (apiClient.post as jest.Mock).mockResolvedValue({});

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Undo')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Undo')[0]);

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to undo the last change to this record?'
      );
      expect(apiClient.post).toHaveBeenCalledWith(
        '/audit/undo/projects/proj-1',
        { comment: undefined }
      );
      
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Change undone successfully');
      });
    });

    test('cancels undo when not confirmed', async () => {
      const user = userEvent.setup();
      (window.confirm as jest.Mock).mockReturnValue(false);

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Undo')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Undo')[0]);

      expect(apiClient.post).not.toHaveBeenCalled();
    });

    test('shows error when undo fails', async () => {
      const user = userEvent.setup();
      (window.confirm as jest.Mock).mockReturnValue(true);
      (window.alert as jest.Mock).mockImplementation(() => {});
      (apiClient.post as jest.Mock).mockRejectedValue({
        response: { data: { error: 'Cannot undo this change' } },
      });

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Undo')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Undo')[0]);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          'Failed to undo change: Cannot undo this change'
        );
      });
    });

    test('I01v/R4：INTAKE_* 行不渲染撤销按钮（仅 CREATE/UPDATE 可撤销）', async () => {
      const intakeRow = {
        ...mockAuditEntries[0],
        id: 'audit-intake',
        table_name: 'demand_intake',
        record_id: 'intake-1',
        action: 'INTAKE_CREATE',
        changed_by: null,
        old_values: null,
        new_values: { title: '录入' },
        changed_fields: null,
      };
      (apiClient.get as jest.Mock).mockImplementation((url) => {
        if (url.includes('/audit/stats')) {
          return Promise.resolve({ data: { data: mockStats } });
        }
        if (url.includes('/audit/search')) {
          return Promise.resolve({ data: { data: [intakeRow, mockAuditEntries[0]] } });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Details')).toHaveLength(2);
      });

      // 两行中只有 CREATE 行有撤销入口
      expect(screen.getAllByText('Undo')).toHaveLength(1);
      expect(screen.getByText('Intake captured')).toBeInTheDocument();
    });

    test('I01v/R4：undone:false 时提示不支持撤销（不再谎报成功）', async () => {
      const user = userEvent.setup();
      (window.confirm as jest.Mock).mockReturnValue(true);
      (window.alert as jest.Mock).mockImplementation(() => {});
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: { success: true, data: { undone: false } },
      });

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Undo')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Undo')[0]);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('This action cannot be undone');
      });
      expect(window.alert).not.toHaveBeenCalledWith('Change undone successfully');
    });
  });

  describe('Filtering', () => {
    test('filters by table name', async () => {
      const user = userEvent.setup();
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('table-filter')).toBeInTheDocument();
      });

      const tableFilter = screen.getByTestId('table-filter');
      await user.selectOptions(tableFilter, 'people');

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('tableName=people')
        );
      });
    });

    test('filters by action type', async () => {
      const user = userEvent.setup();
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('action-filter')).toBeInTheDocument();
      });

      const actionFilter = screen.getByTestId('action-filter');
      await user.selectOptions(actionFilter, 'UPDATE');

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('action=UPDATE')
        );
      });
    });

    test('filters by changed by user', async () => {
      const user = userEvent.setup();
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('changed-by-input')).toBeInTheDocument();
      });

      const changedByInput = screen.getByTestId('changed-by-input');
      await user.type(changedByInput, 'user123');

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('changedBy=user123')
        );
      });
    });

    test('filters by record ID', async () => {
      const user = userEvent.setup();
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('record-id-input')).toBeInTheDocument();
      });

      const recordIdInput = screen.getByTestId('record-id-input');
      await user.type(recordIdInput, 'proj-1');

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('recordId=proj-1')
        );
      });
    });
  });

  describe('Pagination', () => {
    test('handles pagination navigation', async () => {
      const user = userEvent.setup();
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      
      // Check initial pagination info
      expect(screen.getByText(/Showing 1 - 3/)).toBeInTheDocument();
      
      // Just verify the button exists and is clickable
      await user.click(nextButton);
    });

    test('disables previous button at first page', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('Previous')).toBeInTheDocument();
      });

      const previousButton = screen.getByText('Previous');
      expect(previousButton).toBeDisabled();
    });

    test('disables next button when less than limit entries', async () => {
      (apiClient.get as jest.Mock).mockImplementation((url) => {
        if (url.includes('/audit/stats')) {
          return Promise.resolve({ data: { data: mockStats } });
        }
        if (url.includes('/audit/search')) {
          // Return less than limit (50) entries
          return Promise.resolve({ data: { data: mockAuditEntries.slice(0, 2) } });
        }
      });

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    test('handles entries with null values', async () => {
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Entry 3 has null values
      expect(screen.getByText('System')).toBeInTheDocument(); // null changed_by
      expect(screen.getByText('N/A')).toBeInTheDocument(); // null changed_fields
    });

    test('handles invalid dates gracefully', async () => {
      const entriesWithInvalidDate = [{
        ...mockAuditEntries[0],
        changed_at: 'invalid-date',
      }];

      (apiClient.get as jest.Mock).mockImplementation((url) => {
        if (url.includes('/audit/stats')) {
          return Promise.resolve({ data: { data: mockStats } });
        }
        if (url.includes('/audit/search')) {
          return Promise.resolve({ data: { data: entriesWithInvalidDate } });
        }
      });

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Date')).toBeInTheDocument();
      });
    });

    test('formats JSON values correctly in expanded view', async () => {
      const user = userEvent.setup();
      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getAllByText('Details')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Details')[0]);

      // Should show formatted JSON
      expect(screen.getByText('New Values')).toBeInTheDocument();
      expect(screen.getByText(/name.*New Project/)).toBeInTheDocument();
    });

    test('handles API errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (apiClient.get as jest.Mock).mockRejectedValue(new Error('API Error'));

      render(<AuditLog />);

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });

      consoleError.mockRestore();
    });
  });
});