'use client';

import { REQUEST_STATUSES, STATUS_LABELS, type EvidenceRequestDto } from '@evidencechase/shared';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import { StatusBadge } from './status-badge';

type StatusFilter = 'ALL' | 'OVERDUE' | (typeof REQUEST_STATUSES)[number];

interface RequestsTableProps {
  requests: EvidenceRequestDto[];
  readOnly: boolean;
  onEdit: (request: EvidenceRequestDto) => void;
  onDelete: (request: EvidenceRequestDto) => void;
}

/** Text search covers the fields a manager would scan for: control, title and owner. */
function matchesSearch(request: EvidenceRequestDto, query: string): boolean {
  const haystack = [
    request.controlRef,
    request.title,
    request.ownerName ?? '',
    request.ownerEmail,
  ].join(' ');
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

export function RequestsTable({ requests, readOnly, onEdit, onDelete }: RequestsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'dueDate', desc: false }]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const filtered = useMemo(
    () =>
      requests.filter((request) => {
        if (statusFilter === 'OVERDUE') return request.isOverdue;
        return statusFilter === 'ALL' || request.status === statusFilter;
      }),
    [requests, statusFilter],
  );

  const columns = useMemo<ColumnDef<EvidenceRequestDto>[]>(
    () => [
      {
        accessorKey: 'controlRef',
        header: 'Control',
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'title',
        header: "What's needed",
        cell: ({ row }) => (
          <div className="min-w-48">
            <p className="font-medium">{row.original.title}</p>
            {row.original.instructions && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted">{row.original.instructions}</p>
            )}
          </div>
        ),
      },
      {
        id: 'owner',
        accessorFn: (request) => request.ownerName ?? request.ownerEmail,
        header: 'Owner',
        cell: ({ row }) => (
          <div>
            {row.original.ownerName && <p>{row.original.ownerName}</p>}
            <p className={cn(row.original.ownerName && 'text-xs text-muted')}>
              {row.original.ownerEmail}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'dueDate',
        header: 'Due',
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1 whitespace-nowrap">
            {formatDate(row.original.dueDate)}
            {row.original.isOverdue && <Badge tone="danger">Overdue</Badge>}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) =>
          readOnly ? null : (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.original.controlRef}`}
                onClick={() => onEdit(row.original)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.original.controlRef}`}
                disabled={row.original.hasSubmissions}
                title={
                  row.original.hasSubmissions
                    ? 'Requests with submitted evidence can’t be deleted'
                    : undefined
                }
                onClick={() => onDelete(row.original)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ),
      },
    ],
    [readOnly, onEdit, onDelete],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _columnId, query: string) => matchesSearch(row.original, query),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search control, title or owner"
            aria-label="Search requests"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          className="w-auto"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="ALL">All statuses</option>
          <option value="OVERDUE">Overdue</option>
          {REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-4 py-3 font-medium"
                      aria-sort={
                        sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                  No requests match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border align-top first:border-t-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Showing {rows.length} of {requests.length} request{requests.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
