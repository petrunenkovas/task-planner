import { PRIORITIES, STATUSES, type Task } from './task';
import type { TaskColumnId } from './taskFields';

export type TaskSort = { column: TaskColumnId; direction: 'asc' | 'desc' };

const textCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

export function nextTaskSort(current: TaskSort | null, column: TaskColumnId): TaskSort {
    return {
        column,
        direction: current?.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    };
}

export function visibleTaskSort(sort: TaskSort | null, columns: TaskColumnId[]): TaskSort | null {
    return sort !== null && columns.includes(sort.column) ? sort : null;
}

function compareTasks(left: Task, right: Task, column: TaskColumnId): number {
    switch (column) {
        case 'title':
        case 'description':
            return textCollator.compare(left[column], right[column]);
        case 'start':
        case 'end':
            return Date.parse(left[column]) - Date.parse(right[column]);
        case 'duration':
            return (
                Date.parse(left.end) -
                Date.parse(left.start) -
                (Date.parse(right.end) - Date.parse(right.start))
            );
        case 'status':
            return STATUSES.indexOf(left.status) - STATUSES.indexOf(right.status);
        case 'priority':
            return PRIORITIES.indexOf(left.priority) - PRIORITIES.indexOf(right.priority);
        case 'urgent':
            return Number(left.isUrgent) - Number(right.isUrgent);
    }
}

export function sortTasks(tasks: Task[], sort: TaskSort | null): Task[] {
    if (sort === null) {
        return tasks;
    }

    const direction = sort.direction === 'asc' ? 1 : -1;
    return tasks
        .map((task, index) => ({ task, index }))
        .sort(
            (left, right) =>
                compareTasks(left.task, right.task, sort.column) * direction ||
                left.index - right.index,
        )
        .map(({ task }) => task);
}
