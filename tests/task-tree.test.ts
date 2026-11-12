import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Task } from '../src/lib/task';
import { TaskTreeTitle } from '../src/modules/tasks/components/TaskTreeTitle';
import { visibleTaskTreeRows } from '../src/modules/tasks/model/taskTree';

function task(id: string, title: string, parent_id: string | null): Task {
    return {
        id,
        title,
        parent_id,
        description: '',
        start: '2026-09-27T10:00:00.000Z',
        end: '2026-09-27T12:00:00.000Z',
        status: 'new',
        priority: 'normal',
        isUrgent: false,
        version: 1,
        createdAt: '2026-09-27T09:00:00.000Z',
        updatedAt: '2026-09-27T09:00:00.000Z',
    };
}

const rootA = task('root-a', 'Бета', null);
const rootB = task('root-b', 'Альфа', null);
const childA = task('child-a', 'Январь', rootA.id);
const childB = task('child-b', 'Август', rootA.id);
const grandchild = task('grandchild', 'Глубокая задача', childA.id);
const otherChild = task('other-child', 'Соседняя ветка', rootB.id);
const tasks = [rootA, childA, grandchild, rootB, otherChild, childB];

test('tree shows descendants only while every ancestor is expanded', () => {
    const collapsed = visibleTaskTreeRows(tasks, new Set(), null);
    assert.deepEqual(
        collapsed.map(({ task }) => task.id),
        [rootA.id, rootB.id],
    );
    assert.equal(collapsed[0]?.hasChildren, true);

    const rootOpen = visibleTaskTreeRows(tasks, new Set([rootA.id]), null);
    assert.deepEqual(
        rootOpen.map(({ task, depth }) => [task.id, depth]),
        [
            [rootA.id, 0],
            [childA.id, 1],
            [childB.id, 1],
            [rootB.id, 0],
        ],
    );

    const nestedOpen = visibleTaskTreeRows(tasks, new Set([rootA.id, childA.id]), null);
    assert.deepEqual(
        nestedOpen.map(({ task }) => task.id),
        [rootA.id, childA.id, grandchild.id, childB.id, rootB.id],
    );
    assert.equal(nestedOpen[2]?.depth, 2);
    assert.equal(nestedOpen[2]?.hasChildren, false);

    const hiddenBranch = visibleTaskTreeRows(tasks, new Set([childA.id]), null);
    assert.deepEqual(
        hiddenBranch.map(({ task }) => task.id),
        [rootA.id, rootB.id],
    );

    const otherBranch = visibleTaskTreeRows(tasks, new Set([rootB.id]), null);
    assert.deepEqual(
        otherBranch.map(({ task }) => task.id),
        [rootA.id, rootB.id, otherChild.id],
    );
});

test('sorting reorders siblings while keeping each branch together', () => {
    const rows = visibleTaskTreeRows(tasks, new Set([rootA.id, rootB.id]), {
        column: 'title',
        direction: 'asc',
    });
    assert.deepEqual(
        rows.map(({ task }) => task.id),
        [rootB.id, otherChild.id, rootA.id, childB.id, childA.id],
    );
});

test('a matching child is a top-level result when its parent is filtered out', () => {
    const rows = visibleTaskTreeRows([childA, grandchild, rootB], new Set([childA.id]), null);
    assert.deepEqual(
        rows.map(({ task, depth }) => [task.id, depth]),
        [
            [childA.id, 0],
            [grandchild.id, 1],
            [rootB.id, 0],
        ],
    );
    assert.equal(rows[0]?.hasChildren, true);
});

test('five hierarchy levels retain their depth in the visible order', () => {
    const fourth = task('fourth', 'Четвёртый', grandchild.id);
    const fifth = task('fifth', 'Пятый', fourth.id);
    const chain = [rootA, childA, grandchild, fourth, fifth];
    const rows = visibleTaskTreeRows(chain, new Set(chain.map(({ id }) => id)), null);

    assert.deepEqual(
        rows.map(({ depth }) => depth),
        [0, 1, 2, 3, 4],
    );
    assert.equal(rows[4]?.hasChildren, false);
});

test('tree title exposes a chevron only for expandable tasks', () => {
    const expandable = renderToStaticMarkup(
        createElement(
            MemoryRouter,
            null,
            createElement(TaskTreeTitle, {
                task: rootA,
                depth: 3,
                hasChildren: true,
                isExpanded: false,
                titleClassName: 'task-title-button',
                isDisabled: false,
                onToggle: () => undefined,
            }),
        ),
    );
    assert.match(expandable, /--task-tree-depth:3/);
    assert.match(expandable, /aria-label="Раскрыть подзадачи: Бета" aria-expanded="false"/);
    assert.match(expandable, /href="\/tasks\/[^\"]+"/);

    const leaf = renderToStaticMarkup(
        createElement(
            MemoryRouter,
            null,
            createElement(TaskTreeTitle, {
                task: grandchild,
                depth: 4,
                hasChildren: false,
                isExpanded: false,
                titleClassName: 'task-title-button',
                isDisabled: false,
                onToggle: () => undefined,
            }),
        ),
    );
    assert.doesNotMatch(leaf, /aria-expanded/);
    assert.match(leaf, /task-tree-toggle-placeholder/);
});
