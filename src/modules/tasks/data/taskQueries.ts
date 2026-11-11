import type { QueryClient } from '@tanstack/react-query';
import type { Task, TaskInput } from '../../../lib/task';
import { taskRepository } from './taskRepository';

export const TASKS_QUERY_KEY = ['tasks'] as const;

export function taskQuery() {
    return {
        queryKey: TASKS_QUERY_KEY,
        queryFn: ({ signal }: { signal: AbortSignal }) => taskRepository.list(signal),
    };
}

function cacheCommittedTasks(client: QueryClient, saved: Task[]): Task[] {
    let committed = saved;
    client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) => {
        const byId = new Map(saved.map((task) => [task.id, task]));
        const existingIds = new Set(tasks?.map((task) => task.id) ?? []);
        const merged = [
            ...(tasks?.map((task) => {
                const savedTask = byId.get(task.id);
                return savedTask !== undefined && savedTask.version >= task.version
                    ? savedTask
                    : task;
            }) ?? []),
            ...saved.filter((task) => !existingIds.has(task.id)),
        ];
        committed = saved.map((task) => merged.find((cached) => cached.id === task.id) ?? task);
        return merged;
    });
    return committed;
}

function taskInput(task: Task): TaskInput {
    const { title, description, start, end, status, priority, isUrgent, parent_id } = task;

    return { title, description, start, end, status, priority, isUrgent, parent_id };
}

export async function updateCachedTask(
    client: QueryClient,
    id: string,
    patch: Partial<TaskInput>,
    expectedVersion: number | undefined = undefined,
    subtaskTitles: readonly string[] = [],
): Promise<Task[]> {
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });

    const current = client.getQueryData<Task[]>(TASKS_QUERY_KEY)?.find((task) => task.id === id);

    if (current === undefined) {
        throw new Error('Задача уже удалена. Обновите список.');
    }

    const input = { ...taskInput(current), ...patch };

    client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) =>
        tasks?.map((task) => (task.id === id ? { ...task, ...input } : task)),
    );

    try {
        const saved = await taskRepository.updateWithSubtasks(
            id,
            input,
            expectedVersion ?? current.version,
            subtaskTitles,
        );

        // A focus refetch may have started while PUT was in flight. Cancel it
        // before committing the server response so an older GET cannot replace it.
        await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
        const committed = cacheCommittedTasks(client, saved);
        await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
        return committed;
    } catch (error) {
        await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
        client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) =>
            tasks?.map((task) => (task.id === id ? current : task)),
        );
        await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });

        throw error;
    }
}

export async function createCachedTask(
    client: QueryClient,
    input: TaskInput,
    subtaskTitles: readonly string[] = [],
): Promise<Task[]> {
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });

    const created = await taskRepository.createWithSubtasks(input, subtaskTitles);

    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
    const committed = cacheCommittedTasks(client, created);
    await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    return committed;
}

export async function createCachedSubtask(
    client: QueryClient,
    parentId: string,
    title: string,
): Promise<Task[]> {
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
    const created = await taskRepository.createSubtask(parentId, title);
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
    const committed = cacheCommittedTasks(client, created);
    await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    return committed;
}

export async function removeCachedTask(client: QueryClient, task: Task): Promise<void> {
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });

    try {
        const removed = new Set(await taskRepository.remove(task.id, task.version));
        await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
        client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) =>
            tasks?.filter((item) => !removed.has(item.id)),
        );
        await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    } catch (error) {
        await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });

        throw error;
    }
}

export async function replaceCachedTasks(client: QueryClient, tasks: Task[]): Promise<void> {
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });

    const restored = await taskRepository.replace(tasks);

    // A read started during the transaction may still contain the old rows.
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY }).catch(() => undefined);
    client.setQueryData<Task[]>(TASKS_QUERY_KEY, restored);
}
