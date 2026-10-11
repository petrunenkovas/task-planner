import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Task } from '../src/lib/task';
import { EMPTY_FILTERS } from '../src/lib/taskFilters';
import { FieldChooser } from '../src/components/ui/FieldChooser';
import { TaskFilters } from '../src/modules/tasks/components/TaskFilters';
import { FilterDialog } from '../src/modules/tasks/components/FilterDialog';
import { TaskList } from '../src/modules/tasks/components/TaskList';

const task: Task = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Проверка',
    description: 'Отдельное описание',
    start: '2026-09-27T10:00:00.000Z',
    end: '2026-09-27T12:00:00.000Z',
    status: 'planned',
    priority: 'normal',
    isUrgent: true,
    version: 1,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:00:00.000Z',
};

test('list renders only selected fixed-width fields and keeps edit action', () => {
    const html = renderToStaticMarkup(
        createElement(TaskList, {
            tasks: [task],
            columns: ['title', 'description', 'urgent'],
            isPending: false,
            onEdit: () => undefined,
            sort: null,
            onSort: () => undefined,
        }),
    );

    assert.match(html, /--task-table-width:820px/);
    assert.match(html, /<th aria-sort="none"><button[^>]*>.*?Описание.*?<\/button><\/th>/);
    assert.match(
        html,
        /<td data-label="Описание"><span title="Отдельное описание">Отдельное описание<\/span><\/td>/,
    );
    assert.doesNotMatch(html, /<small>|>Статус<\/span>/);
    assert.match(html, /Изменить<\/button>/);
});

test('filter bar keeps filter dialog trigger, search clear and view settings', () => {
    const html = renderToStaticMarkup(
        createElement(TaskFilters, {
            tasks: [task],
            filters: { ...EMPTY_FILTERS, q: 'Проверка' },
            onChange: () => undefined,
            settings: createElement(FieldChooser, {
                label: 'Настроить колонки',
                options: [{ id: 'title', label: 'Название', isRequired: true }],
                selected: ['title'],
                onChange: () => undefined,
            }),
        }),
    );

    assert.match(html, /Фильтры/);
    assert.match(html, /aria-label="Очистить поиск"/);
    assert.match(html, /aria-label="Настроить колонки"/);
    assert.match(html, /Выбрать все/);
    assert.match(html, /Сбросить все/);
    assert.doesNotMatch(html, /aria-label="Сбросить"/);
});

test('empty urgency filter keeps the any-urgency placeholder', () => {
    const html = renderToStaticMarkup(
        createElement(FilterDialog, {
            filters: EMPTY_FILTERS,
            tasks: [task],
            returnFocus: null,
            onClose: () => undefined,
            onApply: () => undefined,
        }),
    );

    assert.match(html, /aria-label="Срочность: Любая срочность"/);
});
