import type { ITask } from '@svar-ui/react-gantt';
import { HOUR, PRIORITY_LABELS, STATUS_LABELS, type Task } from '../../../lib/task';
import type { TaskColumnId } from '../../../lib/taskFields';
import { dateLabel } from '../../../lib/time';

export type GanttTask = ITask & {
    id: string;
    text: string;
    start: Date;
    end: Date;
    duration: number;
    status: Task['status'];
    statusLabel: string;
    description: string;
    startLabel: string;
    endLabel: string;
    priorityLabel: string;
    urgentLabel: string;
    isUrgent: boolean;
};

export const GANTT_COLUMN_FIELDS = {
    title: 'text',
    description: 'description',
    start: 'startLabel',
    end: 'endLabel',
    duration: 'duration',
    status: 'statusLabel',
    priority: 'priorityLabel',
    urgent: 'urgentLabel',
} as const satisfies Record<TaskColumnId, keyof GanttTask>;

export function toGanttTask(task: Task): GanttTask {
    return {
        id: task.id,
        text: task.title,
        start: new Date(task.start),
        end: new Date(task.end),
        duration: (Date.parse(task.end) - Date.parse(task.start)) / HOUR,
        type: 'task',
        progress: 0,
        status: task.status,
        statusLabel: STATUS_LABELS[task.status],
        description: task.description,
        startLabel: dateLabel(task.start),
        endLabel: dateLabel(task.end),
        priorityLabel: PRIORITY_LABELS[task.priority],
        urgentLabel: task.isUrgent ? 'Срочная' : 'Обычная',
        isUrgent: task.isUrgent,
    };
}
