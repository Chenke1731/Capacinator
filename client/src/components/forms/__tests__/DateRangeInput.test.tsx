import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangeInput } from '../DateRangeInput';

describe('DateRangeInput', () => {
  const defaultProps = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    onStartDateChange: jest.fn(),
    onEndDateChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders start and end date inputs', () => {
    render(<DateRangeInput {...defaultProps} />);

    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it('displays initial date values', () => {
    render(<DateRangeInput {...defaultProps} />);

    const startInput = screen.getByLabelText(/start date/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/end date/i) as HTMLInputElement;

    expect(startInput.value).toBe('2024-01-01');
    expect(endInput.value).toBe('2024-12-31');
  });

  it('calls onStartDateChange when start date changes', () => {
    render(<DateRangeInput {...defaultProps} />);

    const startInput = screen.getByLabelText(/start date/i);
    fireEvent.change(startInput, { target: { value: '2024-02-01' } });

    expect(defaultProps.onStartDateChange).toHaveBeenCalledWith('2024-02-01');
  });

  it('calls onEndDateChange when end date changes', () => {
    render(<DateRangeInput {...defaultProps} />);

    const endInput = screen.getByLabelText(/end date/i);
    fireEvent.change(endInput, { target: { value: '2024-11-30' } });

    expect(defaultProps.onEndDateChange).toHaveBeenCalledWith('2024-11-30');
  });

  it('shows custom labels', () => {
    render(
      <DateRangeInput
        {...defaultProps}
        startLabel="Project Start"
        endLabel="Project End"
      />
    );

    expect(screen.getByText('Project Start')).toBeInTheDocument();
    expect(screen.getByText('Project End')).toBeInTheDocument();
  });

  it('shows required indicators when required is true', () => {
    render(<DateRangeInput {...defaultProps} required />);

    const requiredIndicators = screen.getAllByText('*');
    expect(requiredIndicators).toHaveLength(2);
  });

  it('shows error messages for both fields', () => {
    render(
      <DateRangeInput
        {...defaultProps}
        startError="Start date is required"
        endError="End date must be after start"
      />
    );

    expect(screen.getByText('Start date is required')).toBeInTheDocument();
    expect(screen.getByText('End date must be after start')).toBeInTheDocument();
  });

  it('disables inputs when disabled prop is true', () => {
    render(<DateRangeInput {...defaultProps} disabled />);

    const startInput = screen.getByLabelText(/start date/i);
    const endInput = screen.getByLabelText(/end date/i);

    expect(startInput).toBeDisabled();
    expect(endInput).toBeDisabled();
  });

  it('handles ISO datetime strings by extracting date part', () => {
    render(
      <DateRangeInput
        {...defaultProps}
        startDate="2024-01-15T10:30:00Z"
        endDate="2024-06-30T23:59:59Z"
      />
    );

    const startInput = screen.getByLabelText(/start date/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/end date/i) as HTMLInputElement;

    expect(startInput.value).toBe('2024-01-15');
    expect(endInput.value).toBe('2024-06-30');
  });
});
