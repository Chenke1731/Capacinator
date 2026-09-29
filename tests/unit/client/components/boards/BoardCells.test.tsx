import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleCell } from '../../../../../client/src/components/boards/BoardCells';

const createTestProject = (overrides = {}) => ({
  id: 'test-project-1',
  name: 'Test Project',
  iteration: {
    start: '2026-10-01',
    end: '2026-11-30',
    workdays: 40,
    months: 2
  },
  ...overrides
});

const createTestPerson = (roleName: string) => ({
  id: 'person-1',
  person_name: 'Test Person',
  allocation_pct: 50
});

describe('RoleCell', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
  });

  const renderWithQuery = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  describe('popover lifecycle', () => {
    it('opens popover on cell click', async () => {
      const user = userEvent.setup();
      const project = createTestProject();
      const person = createTestPerson('SE');

      renderWithQuery(
        <RoleCell project={project} roleName="se" person={person} pm={1.5} onSaved={() => {}} />
      );

      const cell = screen.getByRole('button', { name: /Test Person/ });
      await user.click(cell);

      await waitFor(() => {
        expect(document.querySelector('.role-pop')).toBeInTheDocument();
      });
    });

    it('does not close popover when clicking inside popover', async () => {
      const user = userEvent.setup();
      const project = createTestProject();
      const person = createTestPerson('SE');

      renderWithQuery(
        <RoleCell project={project} roleName="se" person={person} pm={1.5} onSaved={() => {}} />
      );

      const cell = screen.getByRole('button', { name: /Test Person/ });
      await user.click(cell);

      await waitFor(() => {
        expect(document.querySelector('.role-pop')).toBeInTheDocument();
      });

      const input = screen.getByRole('spinbutton');
      await user.click(input);

      // Popover should still be open after clicking input
      await waitFor(() => {
        expect(document.querySelector('.role-pop')).toBeInTheDocument();
      });

      // Can type into input
      await user.clear(input);
      await user.type(input, '2.5');
      expect(input).toHaveValue(2.5);
    });

    it('closes popover when clicking outside', async () => {
      const user = userEvent.setup();
      const project = createTestProject();
      const person = createTestPerson('SE');

      renderWithQuery(
        <RoleCell project={project} roleName="se" person={person} pm={1.5} onSaved={() => {}} />
      );

      const cell = screen.getByRole('button', { name: /Test Person/ });
      await user.click(cell);

      await waitFor(() => {
        expect(document.querySelector('.role-pop')).toBeInTheDocument();
      });

      // Click outside (on body)
      await user.click(document.body);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('closes popover on Escape key', async () => {
      const user = userEvent.setup();
      const project = createTestProject();
      const person = createTestPerson('SE');

      renderWithQuery(
        <RoleCell project={project} roleName="se" person={person} pm={1.5} onSaved={() => {}} />
      );

      const cell = screen.getByRole('button', { name: /Test Person/ });
      await user.click(cell);

      await waitFor(() => {
        expect(document.querySelector('.role-pop')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('popoverClass consistency', () => {
    it('uses fixed popoverClass regardless of roleName', async () => {
      const user = userEvent.setup();
      const project = createTestProject();

      // Test SE role
      const sePerson = createTestPerson('SE');
      const { unmount: unmountSE } = renderWithQuery(
        <RoleCell project={project} roleName="se" person={sePerson} pm={1.5} onSaved={() => {}} />
      );

      const seCell = screen.getByRole('button', { name: /Test Person/ });
      await user.click(seCell);

      await waitFor(() => {
        expect(document.querySelector('.role-pop')).toHaveClass('role-pop');
      });

      unmountSE();

      // Test MDE role
      const mdePerson = createTestPerson('MDE');
      renderWithQuery(
        <RoleCell project={project} roleName="mde" person={mdePerson} pm={0.5} onSaved={() => {}} />
      );

      const mdeCell = screen.getByRole('button', { name: /Test Person/ });
      await user.click(mdeCell);

      await waitFor(() => {
        expect(document.querySelector('.role-pop')).toHaveClass('role-pop');
      });
    });
  });
});
