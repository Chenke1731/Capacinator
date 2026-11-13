/**
 * I02e：旧书签 ?tab=utilization 一次性兼容。
 *
 * 旧告警链接/书签指向 /people?tab=utilization；统一页无该 tab，旧行为由
 * UnifiedTabComponent 静默删参 → 落到全量人员列表（"点进去没筛选"）。
 * 兼容规则：tab=utilization → 删除 tab，无显式 status 时补
 * status=over-allocated；已有 status 保留。
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

jest.mock('../../../client/src/pages/People', () => ({
  __esModule: true,
  default: () => <div data-testid="people-page" />,
}));
jest.mock('../../../client/src/pages/Roles', () => ({
  __esModule: true,
  default: () => <div data-testid="roles-page" />,
}));
jest.mock('../../../client/src/pages/Availability', () => ({
  __esModule: true,
  default: () => <div data-testid="availability-page" />,
}));
jest.mock('../../../client/src/components/ui/UnifiedTabComponent', () => ({
  UnifiedTabComponent: ({ tabs, defaultTab }: any) => (
    <div data-testid="tabs">
      {tabs.map((tab: any) => (
        <span key={tab.id}>{tab.id === defaultTab ? `*${tab.id}` : tab.id}</span>
      ))}
    </div>
  ),
}));

import PeopleUnified from '../../../client/src/pages/PeopleUnified';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PeopleUnified />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('PeopleUnified legacy tab compatibility (I02e)', () => {
  test('tab=utilization → status=over-allocated 并渲染人员页', async () => {
    renderAt('/people?tab=utilization');

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=over-allocated');
    });
    expect(screen.getByTestId('tabs')).toHaveTextContent('*people');
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('tab=utilization');
  });

  test('显式 status 优先于旧 tab 映射', async () => {
    renderAt('/people?tab=utilization&status=available');

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=available');
    });
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('tab=utilization');
  });

  test('合法 tab=roles 原样保留', async () => {
    renderAt('/people?tab=roles');

    await waitFor(() => {
      expect(screen.getByTestId('tabs')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=roles');
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('status=');
  });
});
