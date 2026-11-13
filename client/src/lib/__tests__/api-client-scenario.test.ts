import { api, apiClient } from '../api-client';

const payload = {
  project_id: 'project-1',
  person_id: 'person-1',
  role_id: 'role-1',
  allocation_percentage: 20,
  assignment_date_mode: 'fixed' as const,
  start_date: '2026-03-01',
  end_date: '2026-03-31',
};

describe('api-client scenario binding', () => {
  const originalAdapter = apiClient.defaults.adapter;

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    localStorage.clear();
  });

  test('explicit per-request scenario wins over the global scenario', async () => {
    localStorage.setItem('currentScenario', JSON.stringify({ id: 'global-scenario' }));
    let captured: any;
    apiClient.defaults.adapter = (async (config: any) => {
      captured = config;
      return {
        data: { success: true, data: {}, requestId: 'test', message: 'ok' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }) as any;

    await api.assignments.create(payload as any, { scenarioId: 'draft-scenario' });

    expect(captured.headers.get('X-Scenario-Id')).toBe('draft-scenario');
  });

  test('no explicit scenario falls back to the global context', async () => {
    localStorage.setItem('currentScenario', JSON.stringify({ id: 'global-scenario' }));
    let captured: any;
    apiClient.defaults.adapter = (async (config: any) => {
      captured = config;
      return {
        data: { success: true, data: {}, requestId: 'test', message: 'ok' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }) as any;

    await api.assignments.create(payload as any);

    expect(captured.headers.get('X-Scenario-Id')).toBe('global-scenario');
  });
});
