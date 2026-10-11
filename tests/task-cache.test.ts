import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import type { Task } from '../src/lib/task';
import { taskRepository, TaskRepositoryError } from '../src/modules/tasks/data/taskRepository';
import {
    replaceCachedTasks,
    TASKS_QUERY_KEY,
    updateCachedTask,
} from '../src/modules/tasks/data/taskQueries';

const original: Task = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Before save',
    description: '',
    start: '2026-09-27T10:00:00.000Z',
    end: '2026-09-27T12:00:00.000Z',
    status: 'planned',
    priority: 'normal',
    isUrgent: false,
    version: 1,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:00:00.000Z',
};

test('status change is optimistic and keeps other fields and gesture version', async () => {
    const client = new QueryClient();
    client.setQueryData(TASKS_QUERY_KEY, [original]);
    const update = taskRepository.update;
    let complete!: (task: Task) => void;
    let seenVersion: number | undefined;
    let seenTask: Task['status'] | undefined;
    taskRepository.update = async (_id, input, version) => {
        seenVersion = version;
        seenTask = input.status;
        return new Promise<Task>((resolve) => {
            complete = resolve;
        });
    };
    try {
        const saving = updateCachedTask(client, original.id, { status: 'done' }, 7);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [{ ...original, status: 'done' }]);
        assert.equal(seenVersion, 7);
        assert.equal(seenTask, 'done');
        complete({ ...original, status: 'done', version: 8 });
        await saving;
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [
            { ...original, status: 'done', version: 8 },
        ]);
    } finally {
        taskRepository.update = update;
        client.clear();
    }
});

test('failed update restores the cached task', async () => {
    const client = new QueryClient();
    client.setQueryData(TASKS_QUERY_KEY, [original]);
    const update = taskRepository.update;
    taskRepository.update = async () => {
        throw new TaskRepositoryError('Конфликт', 409);
    };
    try {
        await assert.rejects(updateCachedTask(client, original.id, { status: 'cancelled' }, 1));
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [original]);
    } finally {
        taskRepository.update = update;
        client.clear();
    }
});

test('restore caches committed local versions and cancels an older read', async () => {
    const client = new QueryClient();
    client.setQueryData(TASKS_QUERY_KEY, [original]);
    const replace = taskRepository.replace;
    const imported = [{ ...original, title: 'Из копии', version: 99 }];
    const restored = [{ ...imported[0], version: 2 }];
    let finishReplace!: (tasks: Task[]) => void;
    let finishRead!: (tasks: Task[]) => void;
    taskRepository.replace = async () =>
        new Promise<Task[]>((resolve) => {
            finishReplace = resolve;
        });
    try {
        const replacing = replaceCachedTasks(client, imported);
        await new Promise((resolve) => setImmediate(resolve));
        const staleRead = client
            .fetchQuery({
                queryKey: TASKS_QUERY_KEY,
                queryFn: () =>
                    new Promise<Task[]>((resolve) => {
                        finishRead = resolve;
                    }),
            })
            .catch(() => undefined);
        finishReplace(restored);
        await replacing;
        finishRead([original]);
        await staleRead;
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), restored);
    } finally {
        taskRepository.replace = replace;
        client.clear();
    }
});
