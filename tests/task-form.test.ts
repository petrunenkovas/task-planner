import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Task } from '../src/lib/task';
import { TaskForm } from '../src/modules/tasks/components/TaskForm';

const parent: Task = {
    id: 'b926d852-4444-41e7-b64f-8f17d86aa620',
    title: 'Родительская задача',
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

const child: Task = {
    ...parent,
    id: 'b926d852-4444-41e7-b64f-8f17d86aa621',
    title: 'Подзадача',
    parent_id: parent.id,
};

function renderTaskForm(
    task: Task | null,
    parents: Task[],
    level: number,
    subtasks: Task[] = [],
): string {
    return renderToStaticMarkup(
        createElement(TaskForm, {
            task,
            subtasks,
            parents,
            descendantCount: 0,
            level,
            returnFocus: null,
            fallbackFocus: null,
            preserveFocusOnReopen: { current: false },
            scrollPosition: { current: null },
            isBusy: false,
            isReloading: false,
            error: null,
            onClose: () => undefined,
            onNavigate: () => undefined,
            onSave: async () => undefined,
            onAddSubtask: async () => true,
            onToggleSubtask: async () => undefined,
            onDelete: async () => undefined,
            onReload: null,
        }),
    );
}

test('task form hides empty checklist while adding is available and renders parent breadcrumbs', () => {
    const newTask = renderTaskForm(null, [], 1);
    assert.equal(newTask.includes('Пока нет подзадач'), false);
    assert.match(newTask, /placeholder="Новая подзадача"/);

    const childTask = renderTaskForm(child, [parent], 2);
    assert.match(childTask, /Родительская задача/);
    assert.match(childTask, /task-breadcrumbs/);
    assert.equal(childTask.includes('Пока нет подзадач'), false);
});

test('saved direct children render as buttons in the parent checklist', () => {
    const savedParent = renderTaskForm(parent, [], 1, [child]);
    assert.match(savedParent, /class="subtask-link"[^>]*>Подзадача<\/button>/);
    assert.equal(savedParent.includes('Пока нет подзадач'), false);
});
