import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SearchableSelect } from '../SearchableSelect';

// Note: Radix UI Select uses pointer capture APIs that aren't available in jsdom.
// These tests focus on the static rendering and props without opening the dropdown.
// Full interaction tests would require a real browser environment (e.g., Playwright).

describe('SearchableSelect', () => {
  const defaultProps = {
    id: 'test-select',
    label: 'Select Option',
    value: '',
    onChange: jest.fn(),
    options: [
      { value: '1', label: 'Option 1' },
      { value: '2', label: 'Option 2' },
      { value: '3', label: 'Option 3' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', () => {
    render(<SearchableSelect {...defaultProps} />);

    expect(screen.getByText('Select Option')).toBeInTheDocument();
  });

  it('shows placeholder when no value selected', () => {
    render(<SearchableSelect {...defaultProps} placeholder="Choose one" />);

    expect(screen.getByText('Choose one')).toBeInTheDocument();
  });

  it('shows required indicator when required is true', () => {
    render(<SearchableSelect {...defaultProps} required />);

    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
  });

  it('shows error message when error is provided', () => {
    render(<SearchableSelect {...defaultProps} error="Selection is required" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Selection is required');
  });

  it('shows description when provided', () => {
    render(
      <SearchableSelect {...defaultProps} description="Choose the best option" />
    );

    expect(screen.getByText('Choose the best option')).toBeInTheDocument();
  });

  it('disables select when disabled is true', () => {
    render(<SearchableSelect {...defaultProps} disabled />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();
  });

  it('has correct ARIA attributes for accessibility', () => {
    render(
      <SearchableSelect {...defaultProps} required error="Error" />
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-required', 'true');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
  });

  it('associates label with select via id', () => {
    render(<SearchableSelect {...defaultProps} />);

    const label = screen.getByText('Select Option');
    expect(label).toHaveAttribute('for', 'test-select');
  });

  it('applies custom className', () => {
    render(<SearchableSelect {...defaultProps} className="custom-class" />);

    // The className should be applied to the container div
    const container = screen.getByText('Select Option').closest('div');
    expect(container).toHaveClass('custom-class');
  });

  it('renders with empty options array', () => {
    render(<SearchableSelect {...defaultProps} options={[]} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not show error when hasErrors is false', () => {
    render(<SearchableSelect {...defaultProps} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
