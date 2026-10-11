import { useEffect, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskInput } from '../../../lib/task';
import {
    createCachedTask,
    removeCachedTask,
    replaceCachedTasks,
    taskQuery,
    updateCachedTask,
} from '../data/taskQueries';

import { INITIAL_MUTATION_STATUS, mutationStatusReducer } from '../model/mutationStatus';

const EMPTY_TASKS: Task[] = [];

export function useTasks() {
    const client = useQueryClient();
    const query = useQuery(taskQuery());
    const [status, dispatch] = useReducer(mutationStatusReducer, INITIAL_MUTATION_STATUS);
    const [reloadCount, setReloadCount] = useState(0);
    const message = status.notice?.text ?? null;
    const setMessage = (text: string | null) =>
        dispatch(text !== null && text !== '' ? { type: 'error', text } : { type: 'dismiss' });

    useEffect(() => {
        if (status.notice?.kind !== 'success' || status.pending > 0) {
            return;
        }
        const timer = window.setTimeout(() => dispatch({ type: 'expire-success' }), 4000);
        return () => window.clearTimeout(timer);
    }, [status.notice, status.pending]);
    const queues = useRef(new Map<string, Promise<void>>());

    useEffect(() => {
        if (!('BroadcastChannel' in window)) {
            return;
        }
        const channel = new BroadcastChannel('task-planner-tasks');
        channel.onmessage = () => {
            void client.invalidateQueries({ queryKey: ['tasks'] });
        };
        return () => channel.close();
    }, [client]);

    async function updateTask(
        id: string,
        patch: Partial<TaskInput>,
        expectedVersion: number | undefined = undefined,
    ) {
        const previous = queues.current.get(id) ?? Promise.resolve();

        dispatch({ type: 'start' });

        const next = previous
            // A failed save must not leave this task's queue permanently rejected.
            .catch(() => undefined)
            .then(async () => {
                await updateCachedTask(client, id, patch, expectedVersion);
                dispatch({ type: 'success', text: 'Изменения сохранены' });
            })
            .catch((error) => {
                setMessage(error instanceof Error ? error.message : 'Не удалось сохранить');
                throw error;
            })
            .finally(() => {
                dispatch({ type: 'finish' });

                if (queues.current.get(id) === next) {
                    queues.current.delete(id);
                }
            });

        queues.current.set(id, next);

        return next;
    }

    async function createTask(input: TaskInput) {
        dispatch({ type: 'start' });

        try {
            await createCachedTask(client, input);
            dispatch({ type: 'success', text: 'Задача создана' });
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Не удалось сохранить');
            throw error;
        } finally {
            dispatch({ type: 'finish' });
        }
    }

    async function removeTask(task: Task) {
        dispatch({ type: 'start' });

        try {
            await removeCachedTask(client, task);
            dispatch({ type: 'success', text: 'Задача удалена' });
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Не удалось сохранить');
            throw error;
        } finally {
            dispatch({ type: 'finish' });
        }
    }

    async function reloadTasks() {
        setReloadCount((count) => count + 1);

        try {
            return await client.fetchQuery({ ...taskQuery(), staleTime: 0 });
        } finally {
            setReloadCount((count) => count - 1);
        }
    }

    async function replaceTasks(tasks: Task[]) {
        dispatch({ type: 'start' });
        try {
            await replaceCachedTasks(client, tasks);
            dispatch({ type: 'success', text: 'Резервная копия восстановлена' });
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Не удалось восстановить задачи');
            throw error;
        } finally {
            dispatch({ type: 'finish' });
        }
    }

    return {
        query,
        tasks: query.data ?? EMPTY_TASKS,
        isPending: status.pending > 0,
        isReloading: reloadCount > 0,
        noticeKind: status.notice?.kind,
        message,
        setMessage,
        updateTask,
        createTask,
        removeTask,
        reloadTasks,
        replaceTasks,
    };
}
