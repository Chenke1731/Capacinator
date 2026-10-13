// 全局 jest + jest-dom side-effect(2026-10-13 批清): jest-dom 6.x 只增强
// 全局 jest.Matchers,@jest/globals 具名导入拿到的是未增强的另一套类型
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { AllocationSlider } from '../AllocationSlider';

describe('AllocationSlider', () => {
  const defaultProps = {
    value: 50,
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with current value displayed', () => {
    render(<AllocationSlider {...defaultProps} />);

    expect(screen.getByText(/allocation.*50%/i)).toBeInTheDocument();
  });

  it('renders slider with correct value', () => {
    render(<AllocationSlider {...defaultProps} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('50');
  });

  it('calls onChange when slider value changes', () => {
    render(<AllocationSlider {...defaultProps} />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '75' } });

    expect(defaultProps.onChange).toHaveBeenCalledWith(75);
  });

  it('shows custom label', () => {
    render(<AllocationSlider {...defaultProps} label="Team Allocation" />);

    expect(screen.getByText(/team allocation.*50%/i)).toBeInTheDocument();
  });

  it('shows required indicator when required is true', () => {
    render(<AllocationSlider {...defaultProps} required />);

    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows error message when error is provided', () => {
    render(
      <AllocationSlider
        {...defaultProps}
        error="Allocation must be at least 10%"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Allocation must be at least 10%'
    );
  });

  it('disables slider when disabled is true', () => {
    render(<AllocationSlider {...defaultProps} disabled />);

    const slider = screen.getByRole('slider');
    expect(slider).toBeDisabled();
  });

  it('respects custom min, max, and step values', () => {
    render(
      <AllocationSlider
        {...defaultProps}
        value={25}
        min={10}
        max={90}
        step={10}
      />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '10');
    expect(slider).toHaveAttribute('max', '90');
    expect(slider).toHaveAttribute('step', '10');
  });

  it('shows guide markers with min and max values', () => {
    render(
      <AllocationSlider {...defaultProps} min={0} max={100} />
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows available capacity when provided', () => {
    render(
      <AllocationSlider {...defaultProps} value={30} availableCapacity={50} />
    );

    expect(screen.getByText('50% available')).toBeInTheDocument();
  });

  it('shows over-allocation warning when value exceeds available capacity', () => {
    render(
      <AllocationSlider {...defaultProps} value={80} availableCapacity={50} />
    );

    expect(
      screen.getByText(/over-allocated by 30%.*available: 50%/i)
    ).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    render(
      <AllocationSlider {...defaultProps} required error="Error" />
    );

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-required', 'true');
    expect(slider).toHaveAttribute('aria-invalid', 'true');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(slider).toHaveAttribute('aria-valuetext', '50 percent');
  });
});
