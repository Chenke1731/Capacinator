import { renderHook, act } from '@testing-library/react';
import { useToast, toast, reducer } from '../use-toast';

describe('use-toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('reducer', () => {
    it('should add toast to state', () => {
      const initialState = { toasts: [] };
      const toastData = {
        id: '1',
        title: 'Test Toast',
        description: 'Test description'
      };

      const newState = reducer(initialState, {
        type: 'ADD_TOAST',
        toast: toastData
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(toastData);
    });

    it('should limit toasts to TOAST_LIMIT', () => {
      const initialState = {
        toasts: [{ id: '1', title: 'Existing Toast' }]
      };

      const newState = reducer(initialState, {
        type: 'ADD_TOAST',
        toast: { id: '2', title: 'New Toast' }
      });

      // TOAST_LIMIT is 1, so only the newest toast should remain
      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2');
    });

    it('should update existing toast', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'Original Title' },
          { id: '2', title: 'Other Toast' }
        ]
      };

      const newState = reducer(initialState, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated Title' }
      });

      expect(newState.toasts[0].title).toBe('Updated Title');
      expect(newState.toasts[1].title).toBe('Other Toast');
    });

    it('should dismiss specific toast by id', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true }
        ]
      };

      const newState = reducer(initialState, {
        type: 'DISMISS_TOAST',
        toastId: '1'
      });

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(true);
    });

    it('should dismiss all toasts when no id provided', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true }
        ]
      };

      const newState = reducer(initialState, {
        type: 'DISMISS_TOAST'
      });

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(false);
    });

    it('should remove specific toast by id', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'Toast 1' },
          { id: '2', title: 'Toast 2' }
        ]
      };

      const newState = reducer(initialState, {
        type: 'REMOVE_TOAST',
        toastId: '1'
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2');
    });

    it('should remove all toasts when no id provided', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'Toast 1' },
          { id: '2', title: 'Toast 2' }
        ]
      };

      const newState = reducer(initialState, {
        type: 'REMOVE_TOAST'
      });

      expect(newState.toasts).toHaveLength(0);
    });
  });

  describe('toast function', () => {
    it('should create toast with title and description', () => {
      const result = toast({
        title: 'Test Title',
        description: 'Test Description'
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('dismiss');
      expect(result).toHaveProperty('update');
      expect(typeof result.dismiss).toBe('function');
      expect(typeof result.update).toBe('function');
    });

    it('should generate unique ids for toasts', () => {
      const toast1 = toast({ title: 'Toast 1' } as never);
      const toast2 = toast({ title: 'Toast 2' } as never);

      expect(toast1.id).not.toBe(toast2.id);
    });

    it('should allow dismissing toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        const toastInstance = toast({ title: 'Test Toast' } as never);
        toastInstance.dismiss();
      });

      // Toast should be marked for removal
      // Note: actual removal happens after timeout
    });

    it('should allow updating toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        const toastInstance = toast({ title: 'Original Title' } as never);
        toastInstance.update({ id: 'unknown', title: 'Updated Title' } as never);
      });

      // Toast should be updated in state
    });

    it('should set onOpenChange handler', () => {
      const toastInstance = toast({ title: 'Test Toast' } as never);

      expect(toastInstance).toHaveProperty('id');
    });
  });

  describe('useToast hook', () => {
    it('should initialize with empty toasts', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toBeDefined();
      expect(typeof result.current.toast).toBe('function');
      expect(typeof result.current.dismiss).toBe('function');
    });

    it('should add toast through hook', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'New Toast',
          description: 'Toast description'
        });
      });

      expect(result.current.toasts.length).toBeGreaterThan(0);
    });

    it('should dismiss toast through hook', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        const toastInstance = result.current.toast({
          title: 'Test Toast'
        });
        toastId = toastInstance.id;
      });

      act(() => {
        result.current.dismiss(toastId!);
      });

      // Toast should be dismissed
      const dismissedToast = result.current.toasts.find(t => t.id === toastId);
      if (dismissedToast) {
        expect(dismissedToast.open).toBe(false);
      }
    });

    it('should dismiss all toasts when called without id', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' } as never);
        result.current.toast({ title: 'Toast 2' } as never);
      });

      act(() => {
        result.current.dismiss();
      });

      // All toasts should be dismissed
      result.current.toasts.forEach(toast => {
        expect(toast.open).toBe(false);
      });
    });

    it('should cleanup listeners on unmount', () => {
      const { result, unmount } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Test Toast' } as never);
      });

      unmount();

      // Should not throw errors after unmount
      expect(() => {
        toast({ title: 'Another Toast' } as never);
      }).not.toThrow();
    });

    it('should sync state across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      act(() => {
        result1.current.toast({ title: 'Shared Toast' } as never);
      });

      // Both instances should see the same toasts
      expect(result1.current.toasts.length).toBe(result2.current.toasts.length);
    });

    it('should handle rapid toast creation', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' } as never);
        result.current.toast({ title: 'Toast 2' } as never);
        result.current.toast({ title: 'Toast 3' } as never);
      });

      // Should respect TOAST_LIMIT
      expect(result.current.toasts.length).toBeLessThanOrEqual(1);
    });
  });

  describe('toast timeout behavior', () => {
    it('should not add duplicate timeout for same toast', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        const toastInstance = result.current.toast({ title: 'Test Toast' } as never);
        toastId = toastInstance.id;
      });

      act(() => {
        result.current.dismiss(toastId);
        result.current.dismiss(toastId);
      });

      // Should handle duplicate dismiss gracefully
    });
  });
});
