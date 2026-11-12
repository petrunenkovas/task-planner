import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Task } from '../src/lib/task';
import { TaskList } from '../src/modules/list/components/TaskList';

const task: Task = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Задача',
    description: 'Описание',
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

test('mobile sorting includes the active sort column even when that table column is hidden', () => {
    const html = renderToStaticMarkup(
        createElement(
            MemoryRouter,
            null,
            createElement(TaskList, {
                tasks: [task],
                columns: ['title'],
                isPending: false,
                sort: { column: 'description', direction: 'asc' },
                onSort: () => undefined,
            }),
        ),
    );

    assert.match(html, /Сортировать по колонке/);
    assert.match(html, /Описание/);
    assert.match(html, /Сортировать по убыванию/);
});
