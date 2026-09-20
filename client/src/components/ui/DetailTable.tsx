import React from 'react';
import { useTranslation } from 'react-i18next';
import { Edit2, Trash2, Plus } from 'lucide-react';
import { Button } from './button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

export interface DetailTableColumn<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  width?: string;
}

interface DetailTableProps<T> {
  data: T[];
  columns: DetailTableColumn<T>[];
  onAdd?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  addButtonText?: string;
  emptyMessage?: string;
  canEdit?: boolean;
}

export function DetailTable<T extends { id: string | number }>({
  data,
  columns,
  onAdd,
  onEdit,
  onDelete,
  addButtonText,
  emptyMessage,
  canEdit = true
}: DetailTableProps<T>) {
  const { t } = useTranslation();

  return (
    <div className="detail-table-container">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} style={{ width: column.width }}>
                {column.header}
              </TableHead>
            ))}
            {canEdit && (onEdit || onDelete) && (
              <TableHead style={{ width: '100px' }}>{t('common:actions')}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (canEdit ? 1 : 0)} className="text-center">
                <div className="py-8 text-muted-foreground">
                  {emptyMessage ?? t('common:noData')}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, index) => (
              <TableRow key={item.id || `row-${index}`}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    {column.render(item)}
                  </TableCell>
                ))}
                {canEdit && (onEdit || onDelete) && (
                  <TableCell>
                    <div className="flex gap-2">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(item)}
                          title={t('common:edit')}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(item)}
                          title={t('common:delete')}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      
      {canEdit && onAdd && (
        <div className="mt-4">
          <Button onClick={onAdd} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            {addButtonText ?? t('common:addNew')}
          </Button>
        </div>
      )}
    </div>
  );
}