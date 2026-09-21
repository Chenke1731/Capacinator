import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { Button } from './button';
import { Spinner } from './spinner';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  itemsPerPage?: number;
  loading?: boolean;
  emptyMessage?: string;
  rowClassName?: (row: T) => string | undefined;
}

type SortDirection = 'asc' | 'desc' | null;

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  itemsPerPage = 10,
  loading = false,
  emptyMessage,
  rowClassName
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const sortedData = useMemo(() => {
    // Ensure data is always an array
    const safeData = Array.isArray(data) ? data : [];

    if (!sortColumn || !sortDirection) return safeData;

    return [...safeData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (typeof aValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (typeof aValue === 'number') {
        return sortDirection === 'asc' 
          ? aValue - bValue
          : bValue - aValue;
      }

      if (aValue instanceof Date) {
        return sortDirection === 'asc'
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }

      return 0;
    });
  }, [data, sortColumn, sortDirection]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(current => {
        if (current === 'asc') return 'desc';
        if (current === 'desc') return null;
        return 'asc';
      });
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getValue = (row: T, key: string): any => {
    if (key.includes('.')) {
      return key.split('.').reduce((obj, k) => obj?.[k], row);
    }
    return row[key];
  };

  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ChevronsUpDown className="ml-2 h-4 w-4" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="ml-2 h-4 w-4" />
      : <ChevronDown className="ml-2 h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-primary" />
          <p className="text-sm text-muted-foreground">{t('common:loadingData')}</p>
        </div>
      </div>
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">{emptyMessage ?? t('common:noData')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key as string}
                  style={{ width: column.width }}
                  className={cn(
                    column.sortable && "cursor-pointer select-none hover:bg-muted/50"
                  )}
                  onClick={() => column.sortable && handleSort(column.key as string)}
                >
                  <div className="flex items-center">
                    <span>{column.header}</span>
                    {column.sortable && renderSortIcon(column.key as string)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((row, index) => (
              <TableRow
                key={index}
                onClick={(e) => {
                  // clicks on interactive controls are their own interaction —
                  // don't hijack them with row navigation (it used to remount
                  // inline-edit inputs mid-focus, making typing impossible)
                  const target = e.target as HTMLElement;
                  if (target.closest('input, select, textarea, button, [role="button"], .table-actions')) {
                    return;
                  }
                  onRowClick?.(row);
                }}
                className={cn(
                  onRowClick && "cursor-pointer hover:bg-muted/50",
                  rowClassName?.(row)
                )}
              >
                {columns.map((column) => (
                  <TableCell key={column.key as string}>
                    {column.render
                      ? column.render(getValue(row, column.key as string), row)
                      : getValue(row, column.key as string)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            {t('common:showing', {
              from: ((currentPage - 1) * itemsPerPage) + 1,
              to: Math.min(currentPage * itemsPerPage, sortedData.length),
              total: sortedData.length,
            })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
              <span className="ml-1">{t('common:first')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-1">{t('common:previous')}</span>
            </Button>
            <span className="text-sm">
              {t('common:pageInfo', { page: currentPage, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <span className="mr-1">{t('common:next')}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <span className="mr-1">{t('common:last')}</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}