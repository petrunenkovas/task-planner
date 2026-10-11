import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Task } from '../src/lib/task';
import { nextTaskSort, sortTasks, visibleTaskSort } from '../src/lib/taskSort';
import { SortableHeader, sortAriaValue } from '../src/components/ui/SortableHeader';
import { TaskList } from '../src/modules/tasks/components/TaskList';

const base: Task = {
    id: 'base',
    title: 'Задача 2',
    description: 'Текст 2',
    start: '2026-01-01T00:00:00Z',
    end: '2026-01-01T02:00:00Z',
    status: 'planned',
    priority: 'low',
    isUrgent: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
};
const tasks: Task[] = [
    { ...base, id: 'b', title: 'Задача 10' },
    { ...base, id: 'a', title: 'Задача 2' },
    { ...base, id: 'c', title: 'Задача 2' },
];
const ids = (items: Task[]) => items.map((task) => task.id);

test('sort direction cycles per column and equal values keep input order', () => {
    const ascending = nextTaskSort(null, 'title');
    assert.deepEqual(ascending, { column: 'title', direction: 'asc' });
    assert.deepEqual(ids(sortTasks(tasks, ascending)), ['a', 'c', 'b']);
    const descending = nextTaskSort(ascending, 'title');
    assert.deepEqual(ids(sortTasks(tasks, descending)), ['b', 'a', 'c']);
    assert.deepEqual(nextTaskSort(descending, 'description'), {
        column: 'description',
        direction: 'asc',
    });
    assert.equal(sortTasks(tasks, null), tasks);
    assert.deepEqual(ids(tasks), ['b', 'a', 'c']);
    assert.deepEqual(visibleTaskSort(ascending, ['title', 'status']), ascending);
    assert.equal(visibleTaskSort(ascending, ['status']), null);
});

test('date and duration use instants; status, priority and urgency use domain order', () => {
    const values = [
        {
            ...base,
            id: 'later',
            start: '2026-01-01T10:00:00+03:00',
            end: '2026-01-01T13:00:00+03:00',
            status: 'done' as const,
            priority: 'high' as const,
            isUrgent: true,
        },
        {
            ...base,
            id: 'earlier',
            start: '2026-01-01T05:00:00Z',
            end: '2026-01-01T06:00:00Z',
            status: 'planned' as const,
            priority: 'low' as const,
        },
    ];
    assert.deepEqual(ids(sortTasks(values, { column: 'start', direction: 'asc' })), [
        'earlier',
        'later',
    ]);
    assert.deepEqual(ids(sortTasks(values, { column: 'duration', direction: 'desc' })), [
        'later',
        'earlier',
    ]);
    assert.deepEqual(ids(sortTasks(values, { column: 'status', direction: 'asc' })), [
        'earlier',
        'later',
    ]);
    assert.deepEqual(ids(sortTasks(values, { column: 'priority', direction: 'asc' })), [
        'earlier',
        'later',
    ]);
    assert.deepEqual(ids(sortTasks(values, { column: 'urgent', direction: 'asc' })), [
        'earlier',
        'later',
    ]);
});

test('description uses Russian numeric order and end dates compare instants across offsets', () => {
    const values = [
        { ...base, id: 'ten', description: 'Этап 10', end: '2026-01-01T15:00:00+03:00' },
        { ...base, id: 'two', description: 'Этап 2', end: '2026-01-01T09:00:00Z' },
        { ...base, id: 'one', description: 'Этап 1', end: '2026-01-01T11:00:00Z' },
    ];
    assert.deepEqual(ids(sortTasks(values, { column: 'description', direction: 'asc' })), [
        'one',
        'two',
        'ten',
    ]);
    assert.deepEqual(ids(sortTasks(values, { column: 'end', direction: 'asc' })), [
        'two',
        'one',
        'ten',
    ]);
});

test('all statuses and priorities follow the domain order', () => {
    const STATUSES: Task[] = [
        { ...base, id: 'cancelled', status: 'cancelled' },
        { ...base, id: 'done', status: 'done' },
        { ...base, id: 'in_progress', status: 'in_progress' },
        { ...base, id: 'planned', status: 'planned' },
    ];
    assert.deepEqual(ids(sortTasks(STATUSES, { column: 'status', direction: 'asc' })), [
        'planned',
        'in_progress',
        'done',
        'cancelled',
    ]);
    const PRIORITIES: Task[] = [
        { ...base, id: 'high', priority: 'high' },
        { ...base, id: 'normal', priority: 'normal' },
        { ...base, id: 'low', priority: 'low' },
    ];
    assert.deepEqual(ids(sortTasks(PRIORITIES, { column: 'priority', direction: 'asc' })), [
        'low',
        'normal',
        'high',
    ]);
});

test('header exposes current direction and next action', () => {
    const active = { column: 'title', direction: 'asc' } as const;
    const html = renderToStaticMarkup(
        createElement(SortableHeader, { column: 'title', sort: active, onSort: () => undefined }),
    );
    assert.match(html, /class="sort-header is-asc"/);
    assert.match(html, /data-sort-column="title"/);
    assert.match(html, /нажмите для сортировки по убыванию/);
    assert.equal(sortAriaValue(active, 'title'), 'ascending');
    assert.equal(sortAriaValue(active, 'status'), 'none');

    const list = renderToStaticMarkup(
        createElement(TaskList, {
            tasks,
            columns: ['title', 'status'],
            isPending: false,
            onEdit: () => undefined,
            sort: active,
            onSort: () => undefined,
        }),
    );
    assert.match(list, /<th aria-sort="ascending">/);
    assert.match(list, /<th aria-sort="none">/);
});
