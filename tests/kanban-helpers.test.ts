import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, type Task } from '../src/lib/task';
import {
    groupKanbanTasks,
    kanbanDropChange,
    kanbanPreviewIndex,
} from '../src/modules/board/model/helpers';

function task(id: string, status: Task['status']): Task {
    return {
        id,
        status,
        title: id,
        description: '',
        start: '2026-09-27T10:00:00Z',
        end: '2026-09-27T11:00:00Z',
        priority: 'normal',
        isUrgent: false,
        parent_id: null,
        version: 7,
        createdAt: '',
        updatedAt: '',
    };
}

test('grouping includes every empty status and preserves incoming order without mutating tasks', () => {
    const tasks = [task('second', 'new'), task('done', 'done'), task('first', 'new')];
    const before = structuredClone(tasks);
    tasks.forEach(Object.freeze);
    Object.freeze(tasks);
    const grouped = groupKanbanTasks(tasks);
    assert.deepEqual(Object.keys(grouped), STATUSES);
    assert.deepEqual(
        grouped.new.map((item) => item.id),
        ['second', 'first'],
    );
    assert.deepEqual(grouped.in_progress, []);
    assert.deepEqual(grouped.cancelled, []);
    assert.deepEqual(tasks, before);
    assert.equal(grouped.done[0], tasks[1]);
});

test('drop validation rejects same status, outside targets and cancelled source while retaining captured version', () => {
    const captured = task('id', 'new');
    assert.equal(kanbanDropChange(captured, 'new'), null);
    assert.equal(kanbanDropChange(captured, 'unknown'), null);
    assert.equal(kanbanDropChange(captured, undefined), null);
    assert.equal(kanbanDropChange(null, 'done'), null);
    assert.deepEqual(kanbanDropChange(captured, 'done'), { id: 'id', version: 7, status: 'done' });
});

test('ghost position predicts destination incoming order without sorting or mutating tasks', () => {
    const tasks = [
        task('early', 'done'),
        task('unrelated', 'cancelled'),
        task('source', 'new'),
        task('later', 'done'),
    ];
    const before = structuredClone(tasks);
    assert.equal(kanbanPreviewIndex(tasks, 'source', 'done'), 1);
    assert.equal(kanbanPreviewIndex(tasks, 'early', 'new'), 0);
    assert.equal(kanbanPreviewIndex(tasks, 'later', 'cancelled'), 1);
    assert.equal(kanbanPreviewIndex(tasks, 'source', 'in_progress'), 0);
    assert.equal(kanbanPreviewIndex(tasks, 'source', 'new'), null);
    assert.equal(kanbanPreviewIndex(tasks, 'missing', 'done'), null);
    assert.deepEqual(tasks, before);
});
