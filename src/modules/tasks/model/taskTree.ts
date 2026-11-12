import type { Task } from '../../../lib/task';
import { sortTasks, type TaskSort } from '../../../lib/taskSort';

export type TaskTreeRow = {
    task: Task;
    depth: number;
    hasChildren: boolean;
    isExpanded: boolean;
};

export function visibleTaskTreeRows(
    tasks: readonly Task[],
    expandedIds: ReadonlySet<string>,
    sort: TaskSort | null,
): TaskTreeRow[] {
    const visibleIds = new Set(tasks.map((task) => task.id));
    const children = new Map<string | null, Task[]>();

    for (const task of tasks) {
        const parentId =
            task.parent_id !== null && visibleIds.has(task.parent_id) ? task.parent_id : null;
        let siblings = children.get(parentId);
        if (siblings === undefined) {
            siblings = [];
            children.set(parentId, siblings);
        }
        siblings.push(task);
    }

    const rows: TaskTreeRow[] = [];
    function append(parentId: string | null, depth: number): void {
        for (const task of sortTasks(children.get(parentId) ?? [], sort)) {
            const hasChildren = (children.get(task.id)?.length ?? 0) > 0;
            const isExpanded = hasChildren && expandedIds.has(task.id);
            rows.push({ task, depth, hasChildren, isExpanded });
            if (isExpanded) append(task.id, depth + 1);
        }
    }

    append(null, 0);
    return rows;
}
