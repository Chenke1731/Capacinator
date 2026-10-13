import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FormValidationErrors } from '../FormValidationErrors';

describe('FormValidationErrors', () => {
  it('renders nothing when hasErrors is false', () => {
    const { container } = render(<FormValidationErrors hasErrors={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders alert when hasErrors is true', () => {
    render(<FormValidationErrors hasErrors={true} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays default error message', () => {
    render(<FormValidationErrors hasErrors={true} />);

    expect(
      screen.getByText('Please fix the errors below before submitting.')
    ).toBeInTheDocument();
  });

  it('displays custom error message when provided', () => {
    render(
      <FormValidationErrors
        hasErrors={true}
        message="There are validation errors in the form."
      />
    );

    expect(
      screen.getByText('There are validation errors in the form.')
    ).toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(<FormValidationErrors hasErrors={true} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('renders alert icon', () => {
    render(<FormValidationErrors hasErrors={true} />);

    // The AlertTriangle icon should be present (has aria-hidden)
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies custom className', () => {
    render(
      <FormValidationErrors hasErrors={true} className="custom-class" />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('custom-class');
  });
});
