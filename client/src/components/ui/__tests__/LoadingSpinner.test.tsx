import { render, screen, act } from '@testing-library/react';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner delay mount (2026-11-15 防闪)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('延迟期内不渲染 spinner,到点后显示(默认 250ms)', () => {
    render(<LoadingSpinner />);
    expect(screen.queryByText(/loading/i)).toBeNull();
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('delayMs=0 立即显示(测试/首屏场景逃生口)', () => {
    render(<LoadingSpinner delayMs={0} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('延迟期占位保留 min-h,不产生布局跳动(CLS)', () => {
    const { container } = render(<LoadingSpinner />);
    const placeholder = container.firstElementChild as HTMLElement;
    expect(placeholder.className).toContain('min-h-[200px]');
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
  });
});
