import { HOUR, taskInputSchema, type Task, type TaskInput } from './task';

export const MAX_TASK_LEVEL = 5;

type TaskRelation = Pick<Task, 'id' | 'parent_id'>;

export function taskLevels(tasks: readonly TaskRelation[]): Map<string, number> {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    if (byId.size !== tasks.length) {
        throw new Error('ID задач повторяются.');
    }

    const levels = new Map<string, number>();
    const visiting = new Set<string>();

    function level(id: string): number {
        const known = levels.get(id);
        if (known !== undefined) return known;
        if (visiting.has(id)) throw new Error('Обнаружен цикл в подзадачах.');

        const task = byId.get(id);
        if (task === undefined) throw new Error('Родительская задача не найдена.');
        visiting.add(id);
        const result = task.parent_id === null ? 1 : level(task.parent_id) + 1;
        visiting.delete(id);
        if (result > MAX_TASK_LEVEL) {
            throw new Error(`Максимальная глубина задач — ${MAX_TASK_LEVEL} уровней.`);
        }
        levels.set(id, result);
        return result;
    }

    tasks.forEach((task) => level(task.id));
    return levels;
}

export function descendantIds(tasks: readonly TaskRelation[], rootId: string): Set<string> {
    const children = new Map<string, string[]>();
    tasks.forEach((task) => {
        if (task.parent_id !== null) {
            const siblings = children.get(task.parent_id) ?? [];
            siblings.push(task.id);
            children.set(task.parent_id, siblings);
        }
    });

    const ids = new Set<string>();
    const pending = [rootId];
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (ids.has(id)) continue;
        ids.add(id);
        pending.push(...(children.get(id) ?? []));
    }
    return ids;
}

export function subtaskInput(parent: TaskInput, title: string, parentId: string): TaskInput {
    return taskInputSchema.parse({
        title,
        description: '',
        start: parent.start,
        end: parent.end,
        status: parent.status,
        priority: parent.priority,
        isUrgent: parent.isUrgent,
        parent_id: parentId,
    });
}

export function normalizeTaskRanges(tasks: readonly Task[]): {
    tasks: Task[];
    changedIds: Set<string>;
} {
    const levels = taskLevels(tasks);
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const children = new Map<string, string[]>();
    for (const task of tasks) {
        if (task.parent_id !== null) {
            let siblings = children.get(task.parent_id);
            if (siblings === undefined) {
                siblings = [];
                children.set(task.parent_id, siblings);
            }
            siblings.push(task.id);
        }
    }

    const changedIds = new Set<string>();
    const deepestFirst = [...tasks].sort((a, b) => levels.get(b.id)! - levels.get(a.id)!);
    for (const task of deepestFirst) {
        const current = byId.get(task.id)!;
        const anchor = Date.parse(current.start);
        let first = anchor;
        let last = Date.parse(current.end);
        for (const childId of children.get(task.id) ?? []) {
            const child = byId.get(childId)!;
            first = Math.min(first, Date.parse(child.start));
            last = Math.max(last, Date.parse(child.end));
        }
        const start = anchor + Math.floor((first - anchor) / HOUR) * HOUR;
        const end = anchor + Math.ceil((last - anchor) / HOUR) * HOUR;
        if (start !== anchor || end !== Date.parse(current.end)) {
            byId.set(task.id, {
                ...current,
                start: start === anchor ? current.start : new Date(start).toISOString(),
                end: end === Date.parse(current.end) ? current.end : new Date(end).toISOString(),
            });
            changedIds.add(task.id);
        }
    }
    return { tasks: tasks.map((task) => byId.get(task.id)!), changedIds };
}
