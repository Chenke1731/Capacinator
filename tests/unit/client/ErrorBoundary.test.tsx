/**
 * ErrorBoundary contract (I1, optimization plan 2026-09-28): the app
 * ships zero error boundaries today — any runtime render exception
 * takes down the whole page to a white screen (has happened for real:
 * the ReportsTabContent ClipboardList ReferenceError). One root-level
 * boundary turns "app vanishes" into "error card + retry"; per-route
 * boundaries keep the nav alive when a single page dies.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../../client/src/components/ErrorBoundary';

// React logs every caught-by-boundary error through console.error; keep
// the test output clean without asserting on React internals.
let errorSpy: jest.SpyInstance;
beforeAll(() => { errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => { errorSpy.mockRestore(); });

// Controlled bomb: crashes on every render while `armed` is true.
const Bomb = ({ armed, children }: { armed: boolean; children?: React.ReactNode }) => {
  if (armed) throw new Error('kaboom-render');
  return <div>{children ?? 'recovered-content'}</div>;
};

describe('ErrorBoundary (I1)', () => {
  it('renders a fallback card instead of a white screen when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb armed />
      </ErrorBoundary>
    );
    // The error card must state something went wrong and offer a retry.
    expect(screen.getByRole('button', { name: /try again|重试/i })).toBeInTheDocument();
  });

  it('isolates the blast radius: siblings outside the boundary keep rendering', () => {
    render(
      <div>
        <nav>global-nav-should-survive</nav>
        <ErrorBoundary>
          <Bomb armed />
        </ErrorBoundary>
      </div>
    );
    expect(screen.getByText('global-nav-should-survive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again|重试/i })).toBeInTheDocument();
  });

  it('retry resets the boundary — a child that renders fine next time recovers', () => {
    let armed = true;
    const App = () => (
      <ErrorBoundary>
        <Bomb armed={armed} />
      </ErrorBoundary>
    );
    const { rerender } = render(<App />);
    expect(screen.getByRole('button', { name: /try again|重试/i })).toBeInTheDocument();

    armed = false;
    rerender(<App />);
    // Still showing fallback: rerender alone must not clear the error —
    // only an explicit retry does.
    expect(screen.getByRole('button', { name: /try again|重试/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again|重试/i }));
    rerender(<App />);
    expect(screen.getByText('recovered-content')).toBeInTheDocument();
  });
});
