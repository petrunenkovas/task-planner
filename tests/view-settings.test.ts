import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Task } from '../src/lib/task';
import { TaskList } from '../src/modules/list/components/TaskList';

const task: Task = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Проверка',
    description: 'Отдельное описание',
    start: '2026-09-27T10:00:00.000Z',
    end: '2026-09-27T12:00:00.000Z',
    status: 'new',
    priority: 'normal',
    isUrgent: true,
    parent_id: null,
    version: 1,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:00:00.000Z',
};

test('list renders only selected fixed-width fields and keeps edit action', () => {
    const html = renderToStaticMarkup(
        createElement(
            MemoryRouter,
            null,
            createElement(TaskList, {
                tasks: [task],
                columns: ['title', 'description', 'urgent'],
                isPending: false,
                sort: null,
                onSort: () => undefined,
            }),
        ),
    );

    assert.match(html, /--task-table-width:820px/);
    assert.match(html, /<th aria-sort="none"><button[^>]*>.*?Описание.*?<\/button><\/th>/);
    assert.match(
        html,
        /<td data-label="Описание"><span title="Отдельное описание">Отдельное описание<\/span><\/td>/,
    );
    assert.doesNotMatch(html, /<small>|>Статус<\/span>/);
    assert.match(html, /Изменить<\/a>/);
    assert.match(html, /href="\/tasks\/b926d852-4444-41e7-b64f-8f17d86aa620"/);
});
