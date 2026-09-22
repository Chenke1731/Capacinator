import { renderHook, act } from '@testing-library/react';
import { useModal } from '../useModal';

describe('useModal', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleTraceSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleTraceSpy = jest.spyOn(console, 'trace').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleTraceSpy.mockRestore();
  });

  it('should initialize with default closed state', () => {
    const { result } = renderHook(() => useModal());

    expect(result.current.isOpen).toBe(false);
  });

  it('should initialize with custom initial state', () => {
    const { result } = renderHook(() => useModal(true));

    expect(result.current.isOpen).toBe(true);
  });

  it('should open modal when open() is called', () => {
    const { result } = renderHook(() => useModal());

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('should close modal when close() is called', () => {
    const { result } = renderHook(() => useModal(true));

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('should toggle modal state when toggle() is called', () => {
    const { result } = renderHook(() => useModal());

    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('should maintain stable callback references', () => {
    const { result, rerender } = renderHook(() => useModal());

    const initialOpen = result.current.open;
    const initialClose = result.current.close;
    const initialToggle = result.current.toggle;

    // Force re-render
    rerender();

    expect(result.current.open).toBe(initialOpen);
    expect(result.current.close).toBe(initialClose);
    expect(result.current.toggle).toBe(initialToggle);
  });

  it('should return all required properties', () => {
    const { result } = renderHook(() => useModal());

    expect(result.current).toHaveProperty('isOpen');
    expect(result.current).toHaveProperty('open');
    expect(result.current).toHaveProperty('close');
    expect(result.current).toHaveProperty('toggle');
    expect(typeof result.current.open).toBe('function');
    expect(typeof result.current.close).toBe('function');
    expect(typeof result.current.toggle).toBe('function');
  });

  it('should handle multiple open calls gracefully', () => {
    const { result } = renderHook(() => useModal());

    act(() => {
      result.current.open();
      result.current.open();
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('should handle multiple close calls gracefully', () => {
    const { result } = renderHook(() => useModal(true));

    act(() => {
      result.current.close();
      result.current.close();
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
  });
});
