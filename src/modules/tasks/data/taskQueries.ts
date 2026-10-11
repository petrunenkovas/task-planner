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

function taskInput(task: Task): TaskInput {
    const { title, description, start, end, status, priority, isUrgent } = task;

    return { title, description, start, end, status, priority, isUrgent };
}

export async function updateCachedTask(
    client: QueryClient,
    id: string,
    patch: Partial<TaskInput>,
    expectedVersion: number | undefined = undefined,
): Promise<void> {
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
        const saved = await taskRepository.update(id, input, expectedVersion ?? current.version);

        // A focus refetch may have started while PUT was in flight. Cancel it
        // before committing the server response so an older GET cannot replace it.
        await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
        client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) =>
            tasks?.map((task) => (task.id === id ? saved : task)),
        );
        await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    } catch (error) {
        await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
        client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) =>
            tasks?.map((task) => (task.id === id ? current : task)),
        );
        await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });

        throw error;
    }
}

export async function createCachedTask(client: QueryClient, input: TaskInput): Promise<void> {
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });

    const created = await taskRepository.create(input);

    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
    client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) => [...(tasks ?? []), created]);
    await client.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
}

export async function removeCachedTask(client: QueryClient, task: Task): Promise<void> {
    await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });

    try {
        await taskRepository.remove(task.id, task.version);
        await client.cancelQueries({ queryKey: TASKS_QUERY_KEY });
        client.setQueryData<Task[]>(TASKS_QUERY_KEY, (tasks) =>
            tasks?.filter((item) => item.id !== task.id),
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
