import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import type { Task } from '../src/lib/task';
import { taskRepository, TaskRepositoryError } from '../src/modules/tasks/data/taskRepository';
import {
    createCachedTask,
    removeCachedTask,
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
    status: 'new',
    priority: 'normal',
    isUrgent: false,
    parent_id: null,
    version: 1,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:00:00.000Z',
};

test('status change is optimistic and keeps other fields and gesture version', async () => {
    const client = new QueryClient();
    client.setQueryData(TASKS_QUERY_KEY, [original]);
    const update = taskRepository.updateWithSubtasks;
    let complete!: (tasks: Task[]) => void;
    let seenVersion: number | undefined;
    let seenTask: Task['status'] | undefined;
    taskRepository.updateWithSubtasks = async (_id, input, version) => {
        seenVersion = version;
        seenTask = input.status;
        return new Promise<Task[]>((resolve) => {
            complete = resolve;
        });
    };
    try {
        const saving = updateCachedTask(client, original.id, { status: 'done' }, 7);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [{ ...original, status: 'done' }]);
        assert.equal(seenVersion, 7);
        assert.equal(seenTask, 'done');
        complete([{ ...original, status: 'done', version: 8 }]);
        assert.deepEqual(await saving, [{ ...original, status: 'done', version: 8 }]);
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [
            { ...original, status: 'done', version: 8 },
        ]);
    } finally {
        taskRepository.updateWithSubtasks = update;
        client.clear();
    }
});

test('failed update restores the cached task', async () => {
    const client = new QueryClient();
    client.setQueryData(TASKS_QUERY_KEY, [original]);
    const update = taskRepository.updateWithSubtasks;
    taskRepository.updateWithSubtasks = async () => {
        throw new TaskRepositoryError('Конфликт', 409);
    };
    try {
        await assert.rejects(updateCachedTask(client, original.id, { status: 'cancelled' }, 1));
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [original]);
    } finally {
        taskRepository.updateWithSubtasks = update;
        client.clear();
    }
});

test('date update merges changed ancestors and new children by ID', async () => {
    const client = new QueryClient();
    const child = { ...original, id: 'child', parent_id: original.id, version: 2 };
    client.setQueryData(TASKS_QUERY_KEY, [original, child]);
    const update = taskRepository.updateWithSubtasks;
    const expandedRoot = { ...original, start: '2026-09-27T08:00:00.000Z', version: 4 };
    const changedChild = { ...child, start: '2026-09-27T08:00:00.000Z', version: 3 };
    const grandchild = { ...child, id: 'grandchild', parent_id: child.id, version: 5 };
    taskRepository.updateWithSubtasks = async () => [changedChild, grandchild, expandedRoot];
    try {
        const saved = await updateCachedTask(
            client,
            child.id,
            { start: changedChild.start },
            child.version,
            ['Новый пункт'],
        );
        assert.deepEqual(saved, [changedChild, grandchild, expandedRoot]);
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [
            expandedRoot,
            changedChild,
            grandchild,
        ]);
    } finally {
        taskRepository.updateWithSubtasks = update;
        client.clear();
    }
});

test('a late child response cannot replace a newer ancestor in cache', async () => {
    const client = new QueryClient();
    const child = { ...original, id: 'child', parent_id: original.id, version: 2 };
    const newerRoot = { ...original, start: '2026-09-27T07:00:00.000Z', version: 20 };
    client.setQueryData(TASKS_QUERY_KEY, [newerRoot, child]);
    const update = taskRepository.updateWithSubtasks;
    taskRepository.updateWithSubtasks = async () => [
        { ...child, status: 'done', version: 21 },
        { ...original, start: '2026-09-27T08:00:00.000Z', version: 19 },
    ];
    try {
        const committed = await updateCachedTask(
            client,
            child.id,
            { status: 'done' },
            child.version,
        );
        assert.deepEqual(
            committed.find((task) => task.id === original.id),
            newerRoot,
            'callers receive the authoritative cached parent version',
        );
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [
            newerRoot,
            { ...child, status: 'done', version: 21 },
        ]);
    } finally {
        taskRepository.updateWithSubtasks = update;
        client.clear();
    }
});

test('create with subtasks caches all committed records', async () => {
    const client = new QueryClient();
    client.setQueryData(TASKS_QUERY_KEY, []);
    const create = taskRepository.createWithSubtasks;
    const child = { ...original, id: 'child', parent_id: original.id, version: 2 };
    taskRepository.createWithSubtasks = async (_input, titles) => {
        assert.deepEqual(titles, ['Проверить']);
        return [original, child];
    };
    try {
        assert.deepEqual(await createCachedTask(client, original, ['Проверить']), [
            original,
            child,
        ]);
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [original, child]);
    } finally {
        taskRepository.createWithSubtasks = create;
        client.clear();
    }
});

test('removing a parent evicts all descendants from cache', async () => {
    const client = new QueryClient();
    const child = { ...original, id: 'child', parent_id: original.id, version: 2 };
    const grandchild = { ...original, id: 'grandchild', parent_id: child.id, version: 3 };
    const unrelated = { ...original, id: 'other', version: 4 };
    client.setQueryData(TASKS_QUERY_KEY, [original, child, grandchild, unrelated]);
    const remove = taskRepository.remove;
    taskRepository.remove = async () => [original.id, child.id, grandchild.id];
    try {
        await removeCachedTask(client, original);
        assert.deepEqual(client.getQueryData(TASKS_QUERY_KEY), [unrelated]);
    } finally {
        taskRepository.remove = remove;
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
