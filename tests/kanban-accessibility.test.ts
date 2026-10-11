import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Task } from '../src/lib/task';
import { KanbanBoard } from '../src/modules/board/components/KanbanBoard';

const task: Task = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Проверка',
    description: 'Подробности задачи',
    start: '2026-09-27T10:00:00.000Z',
    end: '2026-09-27T12:00:00.000Z',
    status: 'planned',
    priority: 'normal',
    isUrgent: true,
    version: 1,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:00:00.000Z',
};

test('kanban drag handles describe keyboard controls without visible instructions', () => {
    const html = renderToStaticMarkup(
        createElement(KanbanBoard, {
            tasks: [task],
            fields: ['priority', 'urgent'],
            isBusy: false,
            hasTasks: true,
            onEdit: () => undefined,
            onStatusChange: async () => undefined,
            onClearFilters: () => undefined,
        }),
    );

    assert.match(html, /aria-describedby="kanban-drag-help"/);
    assert.match(html, /id="kanban-drag-help" class="sr-only"[^>]*>[^<]*Пробел/);
});

test('kanban card only renders selected optional fields', () => {
    const base = {
        tasks: [task],
        isBusy: false,
        hasTasks: true,
        onEdit: () => undefined,
        onStatusChange: async () => undefined,
        onClearFilters: () => undefined,
    };
    const withoutFields = renderToStaticMarkup(createElement(KanbanBoard, { ...base, fields: [] }));
    assert.doesNotMatch(withoutFields, /Подробности задачи|Обычный приоритет|Срочная/);
    assert.match(withoutFields, /Проверка/);
    assert.match(withoutFields, /kanban-drag-handle/);

    const withDescription = renderToStaticMarkup(
        createElement(KanbanBoard, { ...base, fields: ['description'] }),
    );
    assert.match(withDescription, /Подробности задачи/);
    assert.doesNotMatch(withDescription, /Обычный приоритет|Срочная/);
    assert.doesNotMatch(withDescription, /2026-09-27|Запланирована<\/span>/);

    const withTags = renderToStaticMarkup(
        createElement(KanbanBoard, { ...base, fields: ['priority', 'urgent'] }),
    );
    assert.match(withTags, /Обычный приоритет/);
    assert.match(withTags, /Срочная/);
    assert.doesNotMatch(withTags, /Подробности задачи/);
});
