import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DetailTable, DetailTableColumn } from '../DetailTable';

// Mock the table components
jest.mock('../table', () => ({
  Table: ({ children, ...props }: any) => <table {...props}>{children}</table>,
  TableHeader: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TableBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TableHead: ({ children, ...props }: any) => <th {...props}>{children}</th>,
  TableRow: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TableCell: ({ children, colSpan, className, ...props }: any) => (
    <td colSpan={colSpan} className={className} {...props}>
      {children}
    </td>
  ),
}));

jest.mock('../button', () => ({
  Button: ({ children, onClick, variant, size, className, title, ...props }: any) => (
    <button
      onClick={onClick}
      className={`btn ${variant || ''} ${size || ''} ${className || ''}`.trim()}
      title={title}
      {...props}
    >
      {children}
    </button>
  ),
}));

describe('DetailTable Component', () => {
  interface TestItem {
    id: number;
    name: string;
    value: string;
    status: 'active' | 'inactive';
    amount: number;
  }

  const mockData: TestItem[] = [
    { id: 1, name: 'Item One', value: 'Value 1', status: 'active', amount: 100 },
    { id: 2, name: 'Item Two', value: 'Value 2', status: 'inactive', amount: 200 },
    { id: 3, name: 'Item Three', value: 'Value 3', status: 'active', amount: 300 },
  ];

  const columns: DetailTableColumn<TestItem>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (item) => item.name,
    },
    {
      key: 'value',
      header: 'Value',
      render: (item) => item.value,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <span className={item.status === 'active' ? 'text-green' : 'text-gray'}>
          {item.status}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (item) => `$${item.amount}`,
      width: '100px',
    },
  ];

  describe('Basic Rendering', () => {
    test('renders table with correct headers', () => {
      const onEdit = jest.fn();
      render(<DetailTable data={mockData} columns={columns} onEdit={onEdit} />);

      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(5); // 4 columns + Actions column
      expect(headers[0]).toHaveTextContent('Name');
      expect(headers[1]).toHaveTextContent('Value');
      expect(headers[2]).toHaveTextContent('Status');
      expect(headers[3]).toHaveTextContent('Amount');
      expect(headers[4]).toHaveTextContent('Actions');
    });

    test('renders data rows correctly', () => {
      render(<DetailTable data={mockData} columns={columns} />);

      expect(screen.getByText('Item One')).toBeInTheDocument();
      expect(screen.getByText('Value 1')).toBeInTheDocument();
      expect(screen.getByText('$100')).toBeInTheDocument();

      expect(screen.getByText('Item Two')).toBeInTheDocument();
      expect(screen.getByText('Value 2')).toBeInTheDocument();
      expect(screen.getByText('$200')).toBeInTheDocument();
    });

    test('renders custom content from render functions', () => {
      render(<DetailTable data={mockData} columns={columns} />);

      const activeElements = screen.getAllByText('active');
      expect(activeElements).toHaveLength(2);
      activeElements.forEach((el) => {
        expect(el).toHaveClass('text-green');
      });

      const inactiveElements = screen.getAllByText('inactive');
      expect(inactiveElements).toHaveLength(1);
      inactiveElements.forEach((el) => {
        expect(el).toHaveClass('text-gray');
      });
    });

    test('applies column widths correctly', () => {
      render(<DetailTable data={mockData} columns={columns} />);

      const headers = screen.getAllByRole('columnheader');
      expect(headers[3]).toHaveStyle({ width: '100px' });
    });

    test('renders empty state when no data', () => {
      render(<DetailTable data={[]} columns={columns} />);

      expect(screen.getByText('No data available')).toBeInTheDocument();
      const emptyCell = screen.getByRole('cell');
      expect(emptyCell).toHaveAttribute('colspan', '5'); // 4 columns + actions
    });

    test('renders custom empty message', () => {
      render(
        <DetailTable
          data={[]}
          columns={columns}
          emptyMessage="No items found"
        />
      );

      expect(screen.getByText('No items found')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    test('renders edit and delete buttons by default', () => {
      const onEdit = jest.fn();
      const onDelete = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      );

      const editButtons = screen.getAllByTitle('Edit');
      const deleteButtons = screen.getAllByTitle('Delete');

      expect(editButtons).toHaveLength(3);
      expect(deleteButtons).toHaveLength(3);
    });

    test('calls onEdit with correct item', async () => {
      const onEdit = jest.fn();
      const user = userEvent.setup();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onEdit={onEdit}
        />
      );

      const firstEditButton = screen.getAllByTitle('Edit')[0];
      await user.click(firstEditButton);

      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onEdit).toHaveBeenCalledWith(mockData[0]);
    });

    test('calls onDelete with correct item', async () => {
      const onDelete = jest.fn();
      const user = userEvent.setup();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onDelete={onDelete}
        />
      );

      const secondDeleteButton = screen.getAllByTitle('Delete')[1];
      await user.click(secondDeleteButton);

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(mockData[1]);
    });

    test('renders only edit buttons when onDelete is not provided', () => {
      const onEdit = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onEdit={onEdit}
        />
      );

      expect(screen.getAllByTitle('Edit')).toHaveLength(3);
      expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    });

    test('renders only delete buttons when onEdit is not provided', () => {
      const onDelete = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onDelete={onDelete}
        />
      );

      expect(screen.getAllByTitle('Delete')).toHaveLength(3);
      expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    });

    test('does not render actions column when canEdit is false', () => {
      const onEdit = jest.fn();
      const onDelete = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onEdit={onEdit}
          onDelete={onDelete}
          canEdit={false}
        />
      );

      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(4); // Only data columns, no actions
      expect(screen.queryByText('Actions')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    });

    test('does not render actions column when no action handlers provided', () => {
      render(<DetailTable data={mockData} columns={columns} />);

      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(4); // Only data columns, no actions
      expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    });
  });

  describe('Add Button', () => {
    test('renders add button when onAdd is provided', () => {
      const onAdd = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onAdd={onAdd}
        />
      );

      expect(screen.getByText('Add New')).toBeInTheDocument();
    });

    test('renders custom add button text', () => {
      const onAdd = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onAdd={onAdd}
          addButtonText="Create Item"
        />
      );

      expect(screen.getByText('Create Item')).toBeInTheDocument();
    });

    test('calls onAdd when add button is clicked', async () => {
      const onAdd = jest.fn();
      const user = userEvent.setup();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onAdd={onAdd}
        />
      );

      const addButton = screen.getByText('Add New');
      await user.click(addButton);

      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    test('does not render add button when onAdd is not provided', () => {
      render(<DetailTable data={mockData} columns={columns} />);

      expect(screen.queryByText('Add New')).not.toBeInTheDocument();
    });

    test('does not render add button when canEdit is false', () => {
      const onAdd = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onAdd={onAdd}
          canEdit={false}
        />
      );

      expect(screen.queryByText('Add New')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles items without id property', () => {
      interface ItemWithoutId {
        key: string;
        name: string;
      }

      const dataWithoutId = [
        { key: 'a', name: 'Item A' },
        { key: 'b', name: 'Item B' },
      ] as any; // Cast to any to bypass TypeScript constraint

      const columnsForNoId: DetailTableColumn<ItemWithoutId>[] = [
        {
          key: 'name',
          header: 'Name',
          render: (item) => item.name,
        },
      ];

      render(<DetailTable data={dataWithoutId as never} columns={columnsForNoId as never} />);

      expect(screen.getByText('Item A')).toBeInTheDocument();
      expect(screen.getByText('Item B')).toBeInTheDocument();
    });

    test('handles empty columns array', () => {
      render(<DetailTable data={mockData} columns={[]} />);

      // Should render table with only action column if handlers provided
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });

    test('handles null or undefined values in render functions', () => {
      const dataWithNulls = [
        { id: 1, name: null, value: undefined },
      ] as any;

      const columnsWithNullHandling: DetailTableColumn<any>[] = [
        {
          key: 'name',
          header: 'Name',
          render: (item) => item.name || 'N/A',
        },
        {
          key: 'value',
          header: 'Value',
          render: (item) => item.value ?? 'No value',
        },
      ];

      render(<DetailTable data={dataWithNulls} columns={columnsWithNullHandling} />);

      expect(screen.getByText('N/A')).toBeInTheDocument();
      expect(screen.getByText('No value')).toBeInTheDocument();
    });

    test('applies delete button styling', () => {
      const onDelete = jest.fn();

      render(
        <DetailTable
          data={mockData}
          columns={columns}
          onDelete={onDelete}
        />
      );

      const deleteButtons = screen.getAllByTitle('Delete');
      deleteButtons.forEach((button) => {
        expect(button).toHaveClass('text-destructive');
      });
    });

    test('renders correct colspan for empty state with no actions', () => {
      render(
        <DetailTable
          data={[]}
          columns={columns}
          canEdit={false}
        />
      );

      const emptyCell = screen.getByRole('cell');
      expect(emptyCell).toHaveAttribute('colspan', '4'); // Only data columns
    });

    test('handles large datasets efficiently', () => {
      const largeData = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: `Value ${i}`,
        status: i % 2 === 0 ? 'active' : 'inactive' as const,
        amount: i * 100,
      }));

      render(<DetailTable data={largeData as never} columns={columns as never} />);

      expect(screen.getByText('Item 0')).toBeInTheDocument();
      expect(screen.getByText('Item 99')).toBeInTheDocument();
    });
  });
});