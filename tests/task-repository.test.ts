import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import type { Task, TaskInput } from '../src/lib/task';
import { taskRepository } from '../src/modules/tasks/data/taskRepository';
import { createDemoTasks } from '../src/modules/tasks/model/demoTasks';
import { createBackup, MAX_BACKUP_BYTES } from '../src/modules/tasks/backup/backupFormat';

const legacyTask = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Старая задача',
    description: 'Сохранить описание',
    start: '2026-09-27T10:00:00.000Z',
    end: '2026-09-27T12:00:00.000Z',
    status: 'planned',
    priority: 'high',
    isUrgent: true,
    version: 7,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:30:00.000Z',
} as const;

function seedVersionTwoDatabase(factory: IDBFactory): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = factory.open('task-planner', 2);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('tasks', { keyPath: 'id' }).put(legacyTask);
            request.result.createObjectStore('metadata', { keyPath: 'key' }).put({
                key: 'versionHighWater',
                value: 40,
            });
        };
        request.onsuccess = () => {
            request.result.close();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

function inputOf(task: Task): TaskInput {
    const { title, description, start, end, status, priority, isUrgent, parent_id } = task;
    return { title, description, start, end, status, priority, isUrgent, parent_id };
}

test('demo data seeds only an empty database and keeps existing tasks intact', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = new IDBFactory();
    try {
        const demo = createDemoTasks(new Date('2026-10-01T00:00:00Z'));
        assert.equal(demo.length, 30);
        assert.equal(demo.filter((item) => item.parent_id !== null).length, 6);
        const seeded = await taskRepository.seedIfEmpty(demo);
        assert.equal(seeded.length, 30);
        const stored = await taskRepository.list();
        assert.deepEqual(
            stored.map((task) => task.id).sort(),
            seeded.map((task) => task.id).sort(),
        );
        await assert.rejects(
            taskRepository.seedIfEmpty(createDemoTasks()),
            /только в пустой список/,
        );
        assert.deepEqual(
            (await taskRepository.list()).map((task) => task.id).sort(),
            seeded.map((task) => task.id).sort(),
        );
    } finally {
        globalThis.indexedDB = originalIndexedDB;
    }
});

test('restore rejects records that become too large after local versions are assigned', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    const factory = new IDBFactory();
    globalThis.indexedDB = factory;
    try {
        const sentinel = await taskRepository.create({
            title: 'Сохранённая задача',
            description: '',
            start: '2026-09-27T10:00:00.000Z',
            end: '2026-09-27T12:00:00.000Z',
            status: 'new',
            priority: 'normal',
            isUrgent: false,
            parent_id: null,
        });
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = factory.open('task-planner', 4);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction('metadata', 'readwrite');
            transaction.objectStore('metadata').put({
                key: 'versionHighWater',
                value: Number.MAX_SAFE_INTEGER - 2,
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();

        const records: Task[] = Array.from({ length: 5_000 }, (_, index) => ({
            ...legacyTask,
            status: 'new',
            parent_id: null,
            id: `b926d852-4444-41e7-b64f-${index.toString(16).padStart(12, '0')}`,
            version: 1,
        }));
        function serializedSize(descriptionLength: number, version: number) {
            const tasks = records.map((record) => ({
                ...record,
                version,
                description: 'x'.repeat(descriptionLength),
            }));
            return new TextEncoder().encode(
                JSON.stringify({ format: 'task-planner-backup', version: 2, tasks }, null, 2),
            ).byteLength;
        }
        let low = 0;
        let high = 10_000;
        while (low + 1 < high) {
            const middle = Math.floor((low + high) / 2);
            if (serializedSize(middle, 1) <= MAX_BACKUP_BYTES) low = middle;
            else high = middle;
        }
        const tasks = records.map((record) => ({
            ...record,
            description: 'x'.repeat(low),
        }));
        assert.doesNotThrow(() => createBackup(tasks));
        assert.ok(serializedSize(low, Number.MAX_SAFE_INTEGER - 1) > MAX_BACKUP_BYTES);
        await assert.rejects(taskRepository.replace(tasks), /превышает 10 МБ/);
        assert.deepEqual(await taskRepository.list(), [sentinel]);
        const restoredDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = factory.open('task-planner', 4);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const highWater = await new Promise<number>((resolve, reject) => {
            const transaction = restoredDatabase.transaction('metadata', 'readonly');
            const request = transaction.objectStore('metadata').get('versionHighWater');
            request.onsuccess = () => resolve(request.result.value as number);
            request.onerror = () => reject(request.error);
        });
        restoredDatabase.close();
        assert.equal(highWater, Number.MAX_SAFE_INTEGER - 2);
    } finally {
        globalThis.indexedDB = originalIndexedDB;
    }
});

test('IndexedDB migrates v2 and atomically creates, limits and deletes subtask branches', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    const factory = new IDBFactory();
    globalThis.indexedDB = factory;

    try {
        await seedVersionTwoDatabase(factory);
        const migrated = (await taskRepository.list())[0]!;
        assert.deepEqual(migrated, { ...legacyTask, status: 'new', parent_id: null });

        const rootInput: TaskInput = {
            title: 'Родитель',
            description: 'Описание родителя',
            start: '2026-10-01T10:00:00.000Z',
            end: '2026-10-01T13:00:00.000Z',
            status: 'in_progress',
            priority: 'normal',
            isUrgent: false,
            parent_id: null,
        };
        const [root, child] = await taskRepository.createWithSubtasks(rootInput, ['Первый пункт']);
        assert.ok(root.version > 40);
        assert.equal(child.parent_id, root.id);
        assert.deepEqual(inputOf(child), {
            ...rootInput,
            title: 'Первый пункт',
            description: '',
            parent_id: root.id,
        });

        const [, grandchild] = await taskRepository.updateWithSubtasks(
            child.id,
            inputOf(child),
            child.version,
            ['Второй уровень'],
        );
        assert.equal(grandchild.parent_id, child.id);
        assert.equal(grandchild.createdAt, grandchild.updatedAt);

        const [, levelFour] = await taskRepository.updateWithSubtasks(
            grandchild.id,
            inputOf(grandchild),
            grandchild.version,
            ['Четвёртый уровень'],
        );
        const [, levelFive] = await taskRepository.updateWithSubtasks(
            levelFour.id,
            inputOf(levelFour),
            levelFour.version,
            ['Пятый уровень'],
        );
        const beforeRejectedInsert = await taskRepository.list();
        await assert.rejects(
            taskRepository.updateWithSubtasks(levelFive.id, inputOf(levelFive), levelFive.version, [
                'Шестой уровень',
            ]),
            /Максимальная глубина/,
        );
        assert.deepEqual(await taskRepository.list(), beforeRejectedInsert);

        const removed = await taskRepository.remove(root.id, root.version);
        assert.deepEqual(
            new Set(removed),
            new Set([root, child, grandchild, levelFour, levelFive].map((item) => item.id)),
        );
        assert.deepEqual(await taskRepository.list(), [migrated]);
    } finally {
        globalThis.indexedDB = originalIndexedDB;
    }
});

test('creating a subtask persists it immediately from the saved parent fields', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = new IDBFactory();
    try {
        const input: TaskInput = {
            title: 'Родитель',
            description: 'Описание родителя',
            start: '2026-10-01T10:00:00.000Z',
            end: '2026-10-01T13:00:00.000Z',
            status: 'in_progress',
            priority: 'high',
            isUrgent: true,
            parent_id: null,
        };
        const parent = await taskRepository.create(input);

        const [child] = await taskRepository.createSubtask(parent.id, 'Новый пункт');
        const stored = await taskRepository.list();

        assert.ok(child);
        assert.equal(child.parent_id, parent.id);
        assert.deepEqual(inputOf(child), {
            ...input,
            title: 'Новый пункт',
            description: '',
            parent_id: parent.id,
        });
        assert.ok(stored.some((task) => task.id === child.id));
        assert.equal(stored.find((task) => task.id === parent.id)?.version, parent.version);
    } finally {
        globalThis.indexedDB = originalIndexedDB;
    }
});

test('IndexedDB v3 migration expands ancestors and advances high-water without changing children', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    const factory = new IDBFactory();
    globalThis.indexedDB = factory;
    const parent: Task = { ...legacyTask, status: 'new', parent_id: null };
    const child: Task = {
        ...parent,
        id: 'b926d852-4444-41e7-b64f-8f17d86aa621',
        parent_id: parent.id,
        start: '2026-09-27T08:00:00.000Z',
        end: '2026-09-27T14:00:00.000Z',
        version: 8,
    };
    try {
        await new Promise<void>((resolve, reject) => {
            const request = factory.open('task-planner', 3);
            request.onupgradeneeded = () => {
                const tasks = request.result.createObjectStore('tasks', { keyPath: 'id' });
                tasks.put(parent);
                tasks.put(child);
                request.result.createObjectStore('metadata', { keyPath: 'key' }).put({
                    key: 'versionHighWater',
                    value: 40,
                });
            };
            request.onsuccess = () => {
                request.result.close();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
        const migrated = await taskRepository.list();
        assert.deepEqual(
            migrated.find((task) => task.id === child.id),
            child,
        );
        const expanded = migrated.find((task) => task.id === parent.id)!;
        assert.equal(expanded.start, child.start);
        assert.equal(expanded.end, child.end);
        assert.equal(expanded.version, 41);
        assert.ok(Date.parse(expanded.updatedAt) >= Date.parse(parent.updatedAt));
        const created = await taskRepository.create(inputOf(parent));
        assert.equal(created.version, 42);
    } finally {
        globalThis.indexedDB = originalIndexedDB;
    }
});

test('editing child dates expands every ancestor and shrinking a parent retains child bounds', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = new IDBFactory();
    try {
        const input: TaskInput = {
            title: 'Родитель',
            description: '',
            start: '2026-09-27T10:00:00.000Z',
            end: '2026-09-27T13:00:00.000Z',
            status: 'new',
            priority: 'normal',
            isUrgent: false,
            parent_id: null,
        };
        const [root, child] = await taskRepository.createWithSubtasks(input, ['Ребёнок']);
        const [, grandchild] = await taskRepository.updateWithSubtasks(
            child.id,
            inputOf(child),
            child.version,
            ['Внук'],
        );
        const updated = await taskRepository.updateWithSubtasks(
            grandchild.id,
            {
                ...inputOf(grandchild),
                start: '2026-09-27T07:00:00.000Z',
                end: '2026-09-27T16:00:00.000Z',
            },
            grandchild.version,
            [],
        );
        assert.deepEqual(
            new Set(updated.map((task) => task.id)),
            new Set([root.id, child.id, grandchild.id]),
        );
        const all = await taskRepository.list();
        for (const id of [root.id, child.id]) {
            const ancestor = all.find((task) => task.id === id)!;
            assert.equal(ancestor.start, '2026-09-27T07:00:00.000Z');
            assert.equal(ancestor.end, '2026-09-27T16:00:00.000Z');
            assert.ok(ancestor.version > root.version);
        }

        const currentRoot = all.find((task) => task.id === root.id)!;
        const [retained, nextChild] = await taskRepository.updateWithSubtasks(
            root.id,
            { ...inputOf(currentRoot), start: input.start, end: input.end },
            currentRoot.version,
            ['Новый прямой ребёнок'],
        );
        assert.equal(retained.start, '2026-09-27T07:00:00.000Z');
        assert.equal(retained.end, '2026-09-27T16:00:00.000Z');
        assert.equal(nextChild.start, retained.start);
        assert.equal(nextChild.end, retained.end);
    } finally {
        globalThis.indexedDB = originalIndexedDB;
    }
});
