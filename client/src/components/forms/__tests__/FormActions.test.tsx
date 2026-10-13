import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormActions } from '../FormActions';

describe('FormActions', () => {
  const defaultProps = {
    isSubmitting: false,
    isEditing: false,
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders cancel and submit buttons', () => {
    render(<FormActions {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('shows Create text when not editing', () => {
    render(<FormActions {...defaultProps} isEditing={false} />);

    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('shows Update text when editing', () => {
    render(<FormActions {...defaultProps} isEditing={true} />);

    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });

  it('shows custom create text', () => {
    render(<FormActions {...defaultProps} createText="Add Person" />);

    expect(screen.getByRole('button', { name: 'Add Person' })).toBeInTheDocument();
  });

  it('shows custom update text', () => {
    render(
      <FormActions {...defaultProps} isEditing={true} updateText="Save Changes" />
    );

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('shows custom cancel text', () => {
    render(<FormActions {...defaultProps} cancelText="Discard" />);

    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(<FormActions {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables submit button when isSubmitting is true', () => {
    render(<FormActions {...defaultProps} isSubmitting={true} />);

    const submitButton = screen.getByRole('button', { name: /creating/i });
    expect(submitButton).toBeDisabled();
  });

  it('shows Creating... text when submitting and not editing', () => {
    render(<FormActions {...defaultProps} isSubmitting={true} />);

    expect(screen.getByText('Creating...')).toBeInTheDocument();
  });

  it('shows Updating... text when submitting and editing', () => {
    render(
      <FormActions {...defaultProps} isSubmitting={true} isEditing={true} />
    );

    expect(screen.getByText('Updating...')).toBeInTheDocument();
  });

  it('shows spinner when submitting', () => {
    render(<FormActions {...defaultProps} isSubmitting={true} />);

    // The Spinner component uses a Loader2 icon with animate-spin
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('cancel button is not disabled when submitting', () => {
    render(<FormActions {...defaultProps} isSubmitting={true} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).not.toBeDisabled();
  });

  it('submit button has type="submit"', () => {
    render(<FormActions {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: 'Create' });
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  it('cancel button has type="button"', () => {
    render(<FormActions {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toHaveAttribute('type', 'button');
  });
});
