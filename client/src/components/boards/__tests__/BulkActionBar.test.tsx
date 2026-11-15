import { render, screen, fireEvent } from '@testing-library/react';
import { BulkActionBar } from '../BulkActionBar';

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined })
}));

const baseProps = {
  pending: false,
  onClear: jest.fn(),
  onBatchUpdate: jest.fn(),
  onBatchDelete: jest.fn(),
  allTags: [] as Array<{ id: string | number; name: string; color_code?: string | null }>,
  tagsOnSelection: new Set<string>(),
  selectionRows: [] as Array<Record<string, any>>,
  visibleIds: new Set<string>(),
  onClearHidden: jest.fn(),
  onLocate: jest.fn()
};

/** 2026-11-15 B1-7: 删除确认的隐藏计数插值守卫（14deff8 引入的新键） */
describe('BulkActionBar 删除确认 hidden 计数', () => {
  it('hidden>0：确认态含 "· N hidden"', () => {
    render(<BulkActionBar {...baseProps} count={7} visibleCount={3} />);
    const btn = screen.getByTestId('bulk-delete-btn');
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/·\s*4 hidden/);
  });

  it('hidden=0：走旧键，不含 hidden 字样', () => {
    render(<BulkActionBar {...baseProps} count={5} visibleCount={5} />);
    const btn = screen.getByTestId('bulk-delete-btn');
    fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Delete 5\?/);
    expect(btn.textContent).not.toMatch(/hidden/i);
  });
});
