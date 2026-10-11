import type { CSSProperties, ReactNode } from 'react';
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from '../../../lib/task';
import { TASK_COLUMN_LABELS, type TaskColumnId } from '../../../lib/taskFields';
import { dateLabel, durationLabel } from '../../../lib/time';
import { SortableHeader, sortAriaValue } from '../../../components/ui/SortableHeader';
import type { TaskSort } from '../../../lib/taskSort';

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

    function cell(task: Task, column: TaskColumnId): ReactNode {
        switch (column) {
            case 'title':
                return (
                    <button
                        className="task-title-button"
                        disabled={isPending}
                        onClick={() => onEdit(task)}
                        title={task.title}
                    >
                        {task.title}
                    </button>
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
                                <SortableHeader column={id} sort={sort} onSort={onSort} />
                            </th>
                        ))}
                        <th aria-label="Действия" />
                    </tr>
                </thead>
                <tbody>
                    {tasks.map((task) => (
                        <tr key={task.id}>
                            {columns.map((id) => (
                                <td
                                    key={id}
                                    data-label={id === 'title' ? undefined : TASK_COLUMN_LABELS[id]}
                                >
                                    {cell(task, id)}
                                </td>
                            ))}
                            <td>
                                <button
                                    className="ghost-button"
                                    disabled={isPending}
                                    onClick={() => onEdit(task)}
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
