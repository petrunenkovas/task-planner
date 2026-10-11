import { STATUSES, type Status, type Task } from '../../../lib/task';

export function groupKanbanTasks(tasks: readonly Task[]): Record<Status, Task[]> {
    const groups: Record<Status, Task[]> = {
        planned: [],
        in_progress: [],
        done: [],
        cancelled: [],
    };
    tasks.forEach((task) => {
        groups[task.status].push(task);
    });
    return groups;
}

export type KanbanDragTask = Pick<Task, 'id' | 'version' | 'status'>;
export function kanbanDropChange(task: KanbanDragTask | null, target: unknown) {
    if (
        task === null ||
        typeof target !== 'string' ||
        !STATUSES.includes(target as Status) ||
        target === task.status
    ) {
        return null;
    }
    return { id: task.id, version: task.version, status: target as Status };
}

export function kanbanPreviewIndex(
    tasks: readonly Task[],
    sourceId: string,
    target: Status,
): number | null {
    const sourceIndex = tasks.findIndex((task) => task.id === sourceId);
    if (sourceIndex < 0) {
        return null;
    }
    const source = tasks[sourceIndex];
    if (source.status === target) {
        return null;
    }
    return tasks.slice(0, sourceIndex).filter((task) => task.status === target).length;
}
