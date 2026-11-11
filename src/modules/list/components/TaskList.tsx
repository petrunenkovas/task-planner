import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from '../../../lib/task';
import { TASK_COLUMN_LABELS, type TaskColumnId } from '../../../lib/taskFields';
import { dateLabel, durationLabel } from '../../../lib/time';
import { SortableHeader, sortAriaValue } from '../../../components/ui/SortableHeader';
import type { TaskSort } from '../../../lib/taskSort';
import { TaskTreeTitle } from '../../tasks/components/TaskTreeTitle';
import { visibleTaskTreeRows, type TaskTreeRow } from '../../tasks/model/taskTree';

const COLUMN_WIDTHS: Record<TaskColumnId, number> = {
    title: 300,
    description: 240,
    start: 180,
    end: 180,
    duration: 150,
    status: 170,
    priority: 150,
    urgent: 140,
};
const ACTION_WIDTH = 140;

type Props = {
    tasks: Task[];
    columns: TaskColumnId[];
    isPending: boolean;
    onEdit: (task: Task) => void;
    sort: TaskSort | null;
    onSort: (column: TaskColumnId) => void;
};

export function TaskList({ tasks, columns, isPending, onEdit, sort, onSort }: Props) {
    const tableWidth = columns.reduce((width, id) => width + COLUMN_WIDTHS[id], ACTION_WIDTH);
    const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
    const rows = useMemo(
        () => visibleTaskTreeRows(tasks, expandedIds, sort),
        [tasks, expandedIds, sort],
    );

    function toggleTask(id: string) {
        setExpandedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function cell(row: TaskTreeRow, column: TaskColumnId): ReactNode {
        const { task } = row;
        switch (column) {
            case 'title':
                return (
                    <TaskTreeTitle
                        {...row}
                        titleClassName="task-title-button"
                        isDisabled={isPending}
                        onToggle={toggleTask}
                        onEdit={() => onEdit(task)}
                    />
                );
            case 'description':
                return (
                    <span title={task.description}>
                        {task.description !== '' ? task.description : '—'}
                    </span>
                );
            case 'start':
                return dateLabel(task.start);
            case 'end':
                return dateLabel(task.end);
            case 'duration':
                return durationLabel(task.start, task.end);
            case 'status':
                return (
                    <span className={`status-badge ${task.status}`}>
                        {STATUS_LABELS[task.status]}
                    </span>
                );
            case 'priority':
                return PRIORITY_LABELS[task.priority];
            case 'urgent':
                return task.isUrgent ? 'Срочная' : 'Обычная';
        }
    }

    return (
        <div className="task-table">
            <table style={{ '--task-table-width': `${tableWidth}px` } as CSSProperties}>
                <colgroup>
                    {columns.map((id) => (
                        <col key={id} style={{ width: COLUMN_WIDTHS[id] }} />
                    ))}
                    <col style={{ width: ACTION_WIDTH }} />
                </colgroup>
                <thead>
                    <tr>
                        {columns.map((id) => (
                            <th key={id} aria-sort={sortAriaValue(sort, id)}>
                                <SortableHeader
                                    column={id}
                                    label={TASK_COLUMN_LABELS[id]}
                                    sort={sort}
                                    onSort={onSort}
                                />
                            </th>
                        ))}
                        <th aria-label="Действия" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.task.id}>
                            {columns.map((id) => (
                                <td
                                    key={id}
                                    data-label={id === 'title' ? undefined : TASK_COLUMN_LABELS[id]}
                                >
                                    {cell(row, id)}
                                </td>
                            ))}
                            <td>
                                <button
                                    className="ghost-button"
                                    disabled={isPending}
                                    onClick={() => onEdit(row.task)}
                                >
                                    Изменить
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
