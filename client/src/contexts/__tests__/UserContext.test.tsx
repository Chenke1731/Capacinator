import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Unmock UserContext to test the real implementation
jest.unmock('../UserContext');

// Mock the api-client module
jest.mock('../../lib/api-client', () => ({
  api: {
    auth: {
      me: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
    },
  },
  saveAuthTokens: jest.fn(),
  clearAuthTokens: jest.fn(),
  isAuthenticated: jest.fn(),
}));

import { UserProvider, useUser } from '../UserContext';
import { Person } from '../../types';
import { api, isAuthenticated, saveAuthTokens, clearAuthTokens } from '../../lib/api-client';

// Cast mocks for TypeScript
const mockIsAuthenticated = isAuthenticated as jest.Mock;
const mockAuthMe = api.auth.me as jest.Mock;
const mockAuthLogin = api.auth.login as jest.Mock;
const mockAuthLogout = api.auth.logout as jest.Mock;
const mockSaveAuthTokens = saveAuthTokens as jest.Mock;
const mockClearAuthTokens = clearAuthTokens as jest.Mock;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock console.error to suppress expected error logs
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('UserContext', () => {
  const mockUser: Person = {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    roles: [],
    worker_type: 'FTE' as never,
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    created_at: '2025-01-01',
    updated_at: '2025-01-01'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    consoleErrorSpy.mockClear();

    // Reset localStorage mock to return null by default
    localStorageMock.getItem.mockReturnValue(null);

    // Default mock implementations
    mockIsAuthenticated.mockReturnValue(false);
    mockAuthMe.mockResolvedValue({ data: { user: mockUser } });
    mockAuthLogin.mockResolvedValue({
      data: {
        user: mockUser,
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token'
      }
    });
    mockAuthLogout.mockResolvedValue({});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  // Helper component to test the hook
  function TestComponent() {
    const { currentUser, isLoggedIn, setCurrentUser, logout, isLoading } = useUser();

    return (
      <div>
        <div data-testid="current-user">
          {currentUser ? currentUser.name : 'No user'}
        </div>
        <div data-testid="is-logged-in">{isLoggedIn ? 'yes' : 'no'}</div>
        <div data-testid="is-loading">{isLoading ? 'loading' : 'ready'}</div>
        <button onClick={() => setCurrentUser(mockUser)}>Login</button>
        <button onClick={() => logout()}>Logout</button>
        <button onClick={() => setCurrentUser(null)}>Clear User</button>
      </div>
    );
  }

  const renderWithProvider = async (component: React.ReactElement) => {
    const result = render(<UserProvider>{component}</UserProvider>);
    // Wait for initial loading to complete
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });
    return result;
  };

  describe('Provider Initialization', () => {
    it('renders children', async () => {
      // Use a direct render here since the child doesn't have is-loading
      render(<UserProvider><div data-testid="child">Test Child</div></UserProvider>);
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('initializes with no user when not authenticated', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');
    });

    it('loads user from API when authenticated', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockAuthMe.mockResolvedValue({ data: { user: mockUser } });

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('yes');
    });

    it('handles API errors gracefully and clears state', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockAuthMe.mockRejectedValue(new Error('Unauthorized'));

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      expect(mockClearAuthTokens).toHaveBeenCalled();
    });

    it('handles null from localStorage gracefully', async () => {
      localStorageMock.getItem.mockReturnValue(null);
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');
    });
  });

  describe('Setting Current User', () => {
    it('sets current user via login API', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');
      });
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('yes');
      expect(mockAuthLogin).toHaveBeenCalledWith('user-1');
      expect(mockSaveAuthTokens).toHaveBeenCalledWith('mock-access-token', 'mock-refresh-token');
    });

    it('updates isLoggedIn when user is set', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-logged-in')).toHaveTextContent('yes');
      });
    });

    it('clears user when set to null via logout', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockAuthMe.mockResolvedValue({ data: { user: mockUser } });

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');

      const clearButton = screen.getByText('Clear User');
      await act(async () => {
        clearButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      });
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');
      expect(mockClearAuthTokens).toHaveBeenCalled();
    });

    it('allows changing users', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      const differentUser: Person = {
        id: 'user-2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        roles: [],
    worker_type: 'FTE' as never,
    default_availability_percentage: 100,
    default_hours_per_day: 8,
        created_at: '2025-01-02',
        updated_at: '2025-01-02'
      };

      function UpdateComponent() {
        const { setCurrentUser } = useUser();
        return (
          <button onClick={() => setCurrentUser(differentUser)}>Change User</button>
        );
      }

      render(
        <UserProvider>
          <TestComponent />
          <UpdateComponent />
        </UserProvider>
      );

      // Wait for initial loading
      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
      });

      // Login with first user
      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');
      });

      // Setup mock for second user
      mockAuthLogin.mockResolvedValue({
        data: {
          user: differentUser,
          accessToken: 'mock-access-token-2',
          refreshToken: 'mock-refresh-token-2'
        }
      });

      const changeButton = screen.getByText('Change User');
      await act(async () => {
        changeButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('Jane Smith');
      });
    });
  });

  describe('Logout Functionality', () => {
    it('logs out user and clears tokens', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockAuthMe.mockResolvedValue({ data: { user: mockUser } });

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('yes');

      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      });
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');
      expect(mockAuthLogout).toHaveBeenCalled();
      expect(mockClearAuthTokens).toHaveBeenCalled();
    });

    it('handles logout when no user is logged in', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('No user');

      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');
    });
  });

  describe('isLoggedIn Flag', () => {
    it('returns false when no user is set', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');
    });

    it('returns true when user is set', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-logged-in')).toHaveTextContent('yes');
      });
    });

    it('updates immediately when user changes', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      // Initially not logged in
      expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');

      // Login
      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-logged-in')).toHaveTextContent('yes');
      });

      // Logout
      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-logged-in')).toHaveTextContent('no');
      });
    });
  });

  describe('useUser Hook', () => {
    it('throws error when used outside UserProvider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      function InvalidComponent() {
        useUser();
        return null;
      }

      expect(() => {
        render(<InvalidComponent />);
      }).toThrow('useUser must be used within a UserProvider');

      consoleSpy.mockRestore();
    });

    it('provides all context values', async () => {
      function TestHookValues() {
        const context = useUser();
        return (
          <div>
            <div data-testid="has-current-user">
              {typeof context.currentUser !== 'undefined' ? 'yes' : 'no'}
            </div>
            <div data-testid="has-set-function">
              {typeof context.setCurrentUser === 'function' ? 'yes' : 'no'}
            </div>
            <div data-testid="has-logout-function">
              {typeof context.logout === 'function' ? 'yes' : 'no'}
            </div>
            <div data-testid="has-is-logged-in">
              {typeof context.isLoggedIn === 'boolean' ? 'yes' : 'no'}
            </div>
            <div data-testid="has-is-loading">
              {typeof context.isLoading === 'boolean' ? 'yes' : 'no'}
            </div>
            <div data-testid="has-login-function">
              {typeof context.login === 'function' ? 'yes' : 'no'}
            </div>
            <div data-testid="has-refresh-function">
              {typeof context.refreshUser === 'function' ? 'yes' : 'no'}
            </div>
            <div data-testid="is-loading">{context.isLoading ? 'loading' : 'ready'}</div>
          </div>
        );
      }

      await renderWithProvider(<TestHookValues />);

      expect(screen.getByTestId('has-current-user')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-set-function')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-logout-function')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-is-logged-in')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-is-loading')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-login-function')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-refresh-function')).toHaveTextContent('yes');
    });
  });

  describe('localStorage Persistence', () => {
    it('stores user in localStorage after login', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'capacinator_current_user',
          JSON.stringify(mockUser)
        );
      });
    });

    it('clears localStorage on logout', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockAuthMe.mockResolvedValue({ data: { user: mockUser } });

      await renderWithProvider(<TestComponent />);

      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('capacinator_current_user');
      });
    });

    it('handles empty string in localStorage', async () => {
      localStorageMock.getItem.mockReturnValue('');
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      // Empty string is falsy, so it should not try to parse
      expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
    });
  });

  describe('Multiple Consumers', () => {
    it('provides same user to multiple consumers', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      function Consumer1() {
        const { currentUser, isLoading } = useUser();
        return (
          <>
            <div data-testid="consumer-1">{currentUser?.name || 'No user'}</div>
            <div data-testid="consumer-1-loading">{isLoading ? 'loading' : 'ready'}</div>
          </>
        );
      }

      function Consumer2() {
        const { currentUser, isLoading } = useUser();
        return (
          <>
            <div data-testid="consumer-2">{currentUser?.name || 'No user'}</div>
            <div data-testid="consumer-2-loading">{isLoading ? 'loading' : 'ready'}</div>
          </>
        );
      }

      render(
        <UserProvider>
          <TestComponent />
          <Consumer1 />
          <Consumer2 />
        </UserProvider>
      );

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
      });

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      // Both consumers should update together - wrap in single waitFor to avoid race
      await waitFor(() => {
        expect(screen.getByTestId('consumer-1')).toHaveTextContent('John Doe');
        expect(screen.getByTestId('consumer-2')).toHaveTextContent('John Doe');
      }, { timeout: 5000 });
    });

    it('updates all consumers when user changes', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      function Consumer1() {
        const { currentUser, isLoading } = useUser();
        return (
          <>
            <div data-testid="consumer-1">{currentUser?.name || 'No user'}</div>
            <div data-testid="consumer-1-loading">{isLoading ? 'loading' : 'ready'}</div>
          </>
        );
      }

      function Consumer2() {
        const { isLoggedIn, isLoading } = useUser();
        return (
          <>
            <div data-testid="consumer-2">{isLoggedIn ? 'Logged in' : 'Not logged in'}</div>
            <div data-testid="consumer-2-loading">{isLoading ? 'loading' : 'ready'}</div>
          </>
        );
      }

      render(
        <UserProvider>
          <TestComponent />
          <Consumer1 />
          <Consumer2 />
        </UserProvider>
      );

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
      });

      // Login
      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      // Both consumers should update together - wrap in single waitFor to avoid race
      await waitFor(() => {
        expect(screen.getByTestId('consumer-1')).toHaveTextContent('John Doe');
        expect(screen.getByTestId('consumer-2')).toHaveTextContent('Logged in');
      }, { timeout: 5000 });

      // Logout
      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      // Both consumers should update together - wrap in single waitFor to avoid race
      await waitFor(() => {
        expect(screen.getByTestId('consumer-1')).toHaveTextContent('No user');
        expect(screen.getByTestId('consumer-2')).toHaveTextContent('Not logged in');
      }, { timeout: 5000 });
    });
  });

  describe('Edge Cases', () => {
    it('handles user object with missing fields', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      const partialUser = {
        id: 'user-1',
        name: 'Partial User'
      } as Person;

      mockAuthLogin.mockResolvedValue({
        data: {
          user: partialUser,
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token'
        }
      });

      function TestPartialUser() {
        const { currentUser, setCurrentUser, isLoading } = useUser();
        return (
          <div>
            <div data-testid="current-user">{currentUser?.name || 'No user'}</div>
            <div data-testid="is-loading">{isLoading ? 'loading' : 'ready'}</div>
            <button onClick={() => setCurrentUser(partialUser)}>Set Partial User</button>
          </div>
        );
      }

      render(<UserProvider><TestPartialUser /></UserProvider>);

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
      });

      const button = screen.getByText('Set Partial User');
      await act(async () => {
        button.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('Partial User');
      });
    });

    it('handles login API errors gracefully', async () => {
      mockIsAuthenticated.mockReturnValue(false);
      mockAuthLogin.mockRejectedValue(new Error('Login failed'));

      await renderWithProvider(<TestComponent />);

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      // When login fails, the user should still be set locally (legacy behavior)
      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');
      });
    });

    it('handles logout API errors gracefully', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockAuthMe.mockResolvedValue({ data: { user: mockUser } });
      mockAuthLogout.mockRejectedValue(new Error('Logout failed'));

      await renderWithProvider(<TestComponent />);

      expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');

      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      // Even if logout API fails, local state should be cleared
      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      });
      expect(mockClearAuthTokens).toHaveBeenCalled();
    });

    it('handles null and undefined gracefully', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await renderWithProvider(<TestComponent />);

      // Start with no user
      expect(screen.getByTestId('current-user')).toHaveTextContent('No user');

      // Login
      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('John Doe');
      });

      // Clear user
      const clearButton = screen.getByText('Clear User');
      await act(async () => {
        clearButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-user')).toHaveTextContent('No user');
      });
    });
  });
});
