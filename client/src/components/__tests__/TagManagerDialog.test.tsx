import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { TagManagerDialog } from '../tags/TagManagerDialog';
import { api } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  api: {
    tags: {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockedTags = api.tags.list as jest.Mock;
const mockedUpdate = api.tags.update as jest.Mock;

const TAGS = [
  { id: 1, name: 'Reserved', color: '#f59e0b', description: null, project_count: 2 },
  { id: 2, name: 'Urgent', color: null, description: null, project_count: 0 }
];

const renderDialog = (open = true) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TagManagerDialog isOpen={open} onClose={jest.fn()} />
    </QueryClientProvider>
  );
};

describe('TagManagerDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTags.mockResolvedValue({ data: { data: TAGS } });
    mockedUpdate.mockResolvedValue({ data: { data: { ...TAGS[1], name: 'Urgent v2' } } });
  });

  test('lists tags with usage counts', async () => {
    renderDialog();
    expect(await screen.findByText('Reserved')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText(/used by 2 projects/)).toBeInTheDocument();
    expect(screen.getByText(/used by 0 projects/)).toBeInTheDocument();
  });

  test('clicking a tag starts rename; Enter commits via the update API', async () => {
    renderDialog();
    await screen.findByText('Urgent');

    await userEvent.click(screen.getByText('Urgent'));
    const input = screen.getByTestId('tag-rename-2');
    await userEvent.clear(input);
    await userEvent.type(input, 'Urgent v2{Enter}');

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(2, { name: 'Urgent v2' });
    });
  });

  test('delete asks for confirmation first', async () => {
    renderDialog();
    await screen.findByText('Reserved');

    const deleteBtn = screen.getAllByTitle('Delete')[0];
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Delete "Reserved"\?/)).toBeInTheDocument();
    });
  });
});
