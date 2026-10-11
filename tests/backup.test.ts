import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createBackup,
    createCurrentBackup,
    MAX_BACKUP_BYTES,
    MAX_BACKUP_TASKS,
    parseBackup,
} from '../src/modules/tasks/backup/backup';
import {
    compareTasksByStart,
    nextUpdatedAt,
    nextVersion,
    prepareTaskReplacement,
    taskRepository,
} from '../src/modules/tasks/data/taskRepository';
import type { Task } from '../src/lib/task';

const task: Task = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Проверка',
    description: '',
    start: '2026-09-27T10:00:00.000Z',
    end: '2026-09-27T12:00:00.000Z',
    status: 'planned',
    priority: 'normal',
    isUrgent: false,
    version: 2,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:30:00.000Z',
};

test('backup roundtrip preserves task metadata', () => {
    const backup = createBackup([task]);
    assert.equal(JSON.parse(backup).format, 'task-planner-backup');
    assert.deepEqual(parseBackup(backup), [task]);
});

test('import rejects malformed records and duplicate IDs before replacement', () => {
    const backup = JSON.parse(createBackup([task]));
    backup.tasks.push({ ...task });
    assert.throws(() => parseBackup(JSON.stringify(backup)), /повторяется ID/);
    backup.tasks = [{ ...task, version: 0 }];
    assert.throws(() => parseBackup(JSON.stringify(backup)), /Некорректная/);
    backup.tasks = [{ ...task, end: task.start }];
    assert.throws(() => parseBackup(JSON.stringify(backup)), /Некорректная/);
});

test('export reads current repository state, even if the UI has an older snapshot', async () => {
    const list = taskRepository.list;
    const changed = { ...task, title: 'Обновлено в другой вкладке', version: 3 };
    taskRepository.list = async () => [changed];
    try {
        assert.deepEqual(parseBackup(await createCurrentBackup()), [changed]);
    } finally {
        taskRepository.list = list;
    }
});

test('restored tasks get local versions without trusting versions from the backup', () => {
    const stale = { ...task, version: 15 };
    const imported = parseBackup(
        createBackup([{ ...task, version: Number.MAX_SAFE_INTEGER - 2, title: 'Из копии' }]),
    );
    const restored = prepareTaskReplacement(imported, [stale], 10);
    assert.equal(restored.version, 16);
    assert.equal(restored.tasks[0].version, 16);
    assert.notEqual(stale.version, restored.tasks[0].version);
    assert.equal(nextVersion(restored.version, restored.tasks), 17);

    const repeated = prepareTaskReplacement(imported, restored.tasks, 17);
    assert.equal(repeated.version, 18);
    assert.equal(prepareTaskReplacement([], repeated.tasks, 18).version, 19);
    // The high-water mark protects editors even after their row is deleted.
    assert.equal(prepareTaskReplacement(imported, [], 19).version, 20);
});

test('task ordering compares actual instants and uses creation time to break ties', () => {
    const early = { ...task, start: '2026-10-10T10:00:00+03:00' };
    const late = { ...task, start: '2026-10-10T09:00:00Z' };
    assert.ok(compareTasksByStart(early, late) < 0);
    assert.deepEqual([late, early].sort(compareTasksByStart), [early, late]);

    const createdEarlier = {
        ...late,
        start: '2026-10-10T07:00:00Z',
        createdAt: '2026-09-27T10:00:00+03:00',
    };
    assert.ok(compareTasksByStart(createdEarlier, early) < 0);
});

test('an edit after the device clock moves back keeps export metadata importable', () => {
    const futureTask = {
        ...task,
        createdAt: '2026-10-10T12:00:00.000Z',
        updatedAt: '2026-10-10T13:00:00.000Z',
    };
    const changed = {
        ...futureTask,
        updatedAt: nextUpdatedAt(futureTask, Date.parse('2026-10-10T11:00:00.000Z')),
    };
    assert.equal(changed.updatedAt, futureTask.updatedAt);
    assert.deepEqual(parseBackup(createBackup([changed])), [changed]);
    assert.equal(
        nextUpdatedAt(futureTask, Date.parse('2026-10-10T12:30:00.000Z')),
        futureTask.updatedAt,
    );
    assert.equal(
        nextUpdatedAt(futureTask, Date.parse('2026-10-10T14:00:00.000Z')),
        '2026-10-10T14:00:00.000Z',
    );
});

test('export cannot create a file that importer rejects for size or count', () => {
    assert.throws(
        () => createBackup(Array(MAX_BACKUP_TASKS + 1).fill(task)),
        /Слишком много задач/,
    );
    const large = { ...task, description: 'я'.repeat(10_000) };
    assert.throws(() => createBackup(Array(600).fill(large)), /превышает 10 МБ/);
    assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /слишком большой/);
});

test('a blocked open closes its database if it succeeds after rejection', async () => {
    const previous = globalThis.indexedDB;
    let closed = false;
    const request = {
        result: {
            close: () => {
                closed = true;
            },
        },
        onblocked: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onupgradeneeded: null as null | (() => void),
    };
    globalThis.indexedDB = {
        open: () => request,
    } as unknown as IDBFactory;
    try {
        const listing = taskRepository.list();
        request.onblocked?.();
        await assert.rejects(listing, /Закройте другие вкладки/);
        request.onsuccess?.();
        assert.equal(closed, true);
    } finally {
        globalThis.indexedDB = previous;
    }
});
