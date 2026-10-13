import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FormSection } from '../FormSection';

describe('FormSection', () => {
  it('renders label and children', () => {
    render(
      <FormSection label="Name" htmlFor="name-input">
        <input id="name-input" data-testid="input" />
      </FormSection>
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByTestId('input')).toBeInTheDocument();
  });

  it('shows required indicator when required prop is true', () => {
    render(
      <FormSection label="Email" required htmlFor="email">
        <input id="email" />
      </FormSection>
    );

    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
  });

  it('does not show required indicator when required prop is false', () => {
    render(
      <FormSection label="Description" htmlFor="description">
        <textarea id="description" />
      </FormSection>
    );

    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('displays error message when error prop is provided', () => {
    render(
      <FormSection label="Name" error="Name is required" htmlFor="name">
        <input id="name" />
      </FormSection>
    );

    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveTextContent('Name is required');
  });

  it('does not display error when error prop is not provided', () => {
    render(
      <FormSection label="Name" htmlFor="name">
        <input id="name" />
      </FormSection>
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays description when provided', () => {
    render(
      <FormSection
        label="Name"
        htmlFor="name"
        description="Enter your full name"
      >
        <input id="name" />
      </FormSection>
    );

    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
  });

  it('associates label with input via htmlFor', () => {
    render(
      <FormSection label="Username" htmlFor="username">
        <input id="username" />
      </FormSection>
    );

    const label = screen.getByText('Username');
    expect(label).toHaveAttribute('for', 'username');
  });
});
