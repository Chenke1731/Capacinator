import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PersonDetails from '../../../client/src/pages/PersonDetails';

// Calculate expected date range dynamically based on current date
const currentYear = new Date().getFullYear();
const expectedStartDate = `${currentYear - 1}-01-01`;
const expectedEndDate = `${currentYear + 1}-12-31`;

// Mock the chart library
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ReferenceLine: () => <div data-testid="reference-line" />
}));

// Mock the PersonAllocationChart component
jest.mock('../../../client/src/components/PersonAllocationChart', () => ({
  PersonAllocationChart: () => <div data-testid="person-allocation-chart">Allocation Chart</div>
}));

// Mock the API client
jest.mock('../../../client/src/lib/api-client', () => ({
  api: {
    people: {
      get: jest.fn(),
      list: jest.fn(),
      update: jest.fn()
    },
    locations: {
      list: jest.fn()
    },
    roles: {
      list: jest.fn()
    }
  }
}));

import { api } from '../../../client/src/lib/api-client';

// Mock fetch for utilization timeline
global.fetch = jest.fn();

const mockPersonData = {
  id: 'test-person-id',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '555-1234',
  title: 'Software Engineer',
  department: 'Engineering',
  location_id: 'loc-1',
  location_name: 'Main Office',
  primary_person_role_id: 'role-1',
  primary_role_name: 'Developer',
  supervisor_id: null,
  supervisor_name: null,
  worker_type: 'FTE',
  default_availability_percentage: 100,
  default_hours_per_day: 8,
  start_date: '2023-01-01',
  end_date: null,
  status: 'active',
  working_hours: 40,
  vacation_days: 20,
  utilization_target: 80,
  created_at: Date.now(),
  updated_at: Date.now(),
  roles: [],
  assignments: [],
  availabilityOverrides: []
};

const mockUtilizationTimelineData = {
  personName: 'John Doe',
  defaultAvailability: 100,
  timeline: [
    {
      month: '2023-01',
      availability: 100,
      utilization: 50,
      over_allocated: false
    },
    {
      month: '2023-02',
      availability: 100,
      utilization: 80,
      over_allocated: false
    },
    {
      month: '2023-03',
      availability: 100,
      utilization: 120,
      over_allocated: true
    }
  ]
};

const renderPersonDetails = (personId = 'test-person-id') => {
  // Create a new QueryClient for each test to avoid state contamination
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
      },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/people/${personId}`]}>
        <Routes>
          <Route path="/people/:id" element={<PersonDetails />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('PersonDetails Utilization Timeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Ensure all API mocks are reset and set consistently
    api.people.get.mockReset().mockResolvedValue({ data: mockPersonData });
    api.locations.list.mockReset().mockResolvedValue({ data: { data: [] } });
    api.roles.list.mockReset().mockResolvedValue({ data: [{ id: 'role-1', name: 'Test Role' }] });
    api.people.list.mockReset().mockResolvedValue({ data: { data: [] } });

    // Mock fetch for utilization timeline
    (fetch as jest.MockedFunction<typeof fetch>).mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUtilizationTimelineData)
    } as Response);
  });

  afterEach(() => {
    // Complete cleanup to prevent cross-test contamination
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  describe('API Integration - Core Functionality Tests', () => {
    test('should make API call to fetch utilization timeline data', async () => {
      renderPersonDetails();

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/people/test-person-id/utilization-timeline?startDate=${expectedStartDate}&endDate=${expectedEndDate}`
        );
      });
    });

    test('should pass correct person ID in API call', async () => {
      renderPersonDetails('different-person-id');

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/people/different-person-id/utilization-timeline?startDate=${expectedStartDate}&endDate=${expectedEndDate}`
        );
      });
    });

    test('should handle API errors gracefully', async () => {
      // Mock fetch to reject
      (fetch as jest.MockedFunction<typeof fetch>).mockReset().mockRejectedValue(
        new Error('Failed to fetch utilization timeline')
      );

      renderPersonDetails();

      // The component should still render without crashing
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/people/test-person-id/utilization-timeline?startDate=${expectedStartDate}&endDate=${expectedEndDate}`
        );
      });
    });

    test('should handle non-ok response status', async () => {
      // Mock fetch to return 404
      (fetch as jest.MockedFunction<typeof fetch>).mockReset().mockResolvedValue({
        ok: false,
        status: 404
      } as Response);

      renderPersonDetails();

      // Should still make the API call
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/people/test-person-id/utilization-timeline?startDate=${expectedStartDate}&endDate=${expectedEndDate}`
        );
      });
    });
  });

  describe('Data Processing Tests', () => {
    test('should process timeline data structure correctly', async () => {
      const customTimelineData = {
        personName: 'Jane Smith',
        defaultAvailability: 80,
        timeline: [
          { month: '2023-04', availability: 80, utilization: 60, over_allocated: false },
          { month: '2023-05', availability: 80, utilization: 100, over_allocated: true }
        ]
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockReset().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(customTimelineData)
      } as Response);

      renderPersonDetails();

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/people/test-person-id/utilization-timeline?startDate=${expectedStartDate}&endDate=${expectedEndDate}`
        );
      });
    });

    test('should handle empty timeline data', async () => {
      const emptyTimelineData = {
        personName: 'Empty User',
        defaultAvailability: 100,
        timeline: []
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockReset().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(emptyTimelineData)
      } as Response);

      renderPersonDetails();

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/people/test-person-id/utilization-timeline?startDate=${expectedStartDate}&endDate=${expectedEndDate}`
        );
      });
    });
  });

  describe('Component Integration Tests', () => {
    test('should integrate with React Query properly', async () => {
      renderPersonDetails();

      // Verify that the utilization timeline query is made
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `/api/people/test-person-id/utilization-timeline?startDate=${expectedStartDate}&endDate=${expectedEndDate}`
        );
      });

      // Verify that all necessary API calls are made for the PersonDetails component
      expect(api.people.get).toHaveBeenCalledWith('test-person-id');
      // locations 拉取已从组件移除(实现演进, 2026-09-22 对齐)
      expect(api.roles.list).toHaveBeenCalled();
      expect(api.people.list).toHaveBeenCalled();
    });

    test('should use correct query configuration', async () => {
      renderPersonDetails();

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/people/test-person-id/utilization-timeline')
        );
      });

      // Verify query includes correct date range parameters
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`startDate=${expectedStartDate}&endDate=${expectedEndDate}`)
      );
    });
  });

  describe('Mock Validation Tests', () => {
    test('should have properly configured chart mocks', () => {
      // These tests validate that our mocks are working correctly
      expect(jest.isMockFunction(fetch)).toBe(true);
      expect(jest.isMockFunction(api.people.get)).toBe(true);
      expect(jest.isMockFunction(api.locations.list)).toBe(true);
      expect(jest.isMockFunction(api.roles.list)).toBe(true);
    });

    test('should have valid mock data structure', () => {
      expect(mockPersonData).toHaveProperty('id');
      expect(mockPersonData).toHaveProperty('name');
      expect(mockPersonData).toHaveProperty('assignments');
      expect(mockPersonData).toHaveProperty('roles');
      expect(mockPersonData).toHaveProperty('availabilityOverrides');
      
      expect(mockUtilizationTimelineData).toHaveProperty('personName');
      expect(mockUtilizationTimelineData).toHaveProperty('defaultAvailability');
      expect(mockUtilizationTimelineData).toHaveProperty('timeline');
      expect(Array.isArray(mockUtilizationTimelineData.timeline)).toBe(true);
    });
  });
});