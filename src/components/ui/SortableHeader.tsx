import { TASK_COLUMN_LABELS, type TaskColumnId } from '../../lib/taskFields';
import type { TaskSort } from '../../lib/taskSort';

type Props = {
    column: TaskColumnId;
    sort: TaskSort | null;
    onSort: (column: TaskColumnId) => void;
};

export function sortAriaValue(sort: TaskSort | null, column: TaskColumnId) {
    if (sort?.column !== column) {
        return 'none' as const;
    }
    return sort.direction === 'asc' ? ('ascending' as const) : ('descending' as const);
}

export function SortableHeader({ column, sort, onSort }: Props) {
    const direction = sort?.column === column ? sort.direction : null;
    const label = TASK_COLUMN_LABELS[column];
    let sortDescription = 'сортировать по возрастанию';
    if (direction === 'asc') {
        sortDescription = 'по возрастанию, нажмите для сортировки по убыванию';
    } else if (direction === 'desc') {
        sortDescription = 'по убыванию, нажмите для сортировки по возрастанию';
    }

    return (
        <button
            type="button"
            className={`sort-header ${direction !== null ? `is-${direction}` : ''}`}
            data-sort-column={column}
            onClick={() => onSort(column)}
            aria-label={`${label}: ${sortDescription}`}
        >
            <span className="sort-header-label" aria-hidden="true">
                {label}
            </span>
            <span className="sort-indicator" aria-hidden="true">
                <svg viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path className="sort-up" d="m2.5 6 3.5-3.5L9.5 6" />
                    <path className="sort-down" d="m2.5 10 3.5 3.5L9.5 10" />
                </svg>
            </span>
        </button>
    );
}
