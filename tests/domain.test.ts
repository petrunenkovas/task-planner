import test from 'node:test';
import assert from 'node:assert/strict';
import { taskInputSchema, type Task } from '../src/lib/task';
import {
    matchesFilters,
    taskFiltersFromSearch,
    taskFiltersToSearch,
    EMPTY_FILTERS,
} from '../src/lib/taskFilters';
const task: Task = {
    id: '1',
    title: 'План релиза',
    description: 'Проверить доступность',
    start: '2026-10-25T00:00:00.000Z',
    end: '2026-10-25T03:00:00.000Z',
    status: 'planned',
    priority: 'normal',
    isUrgent: true,
    version: 1,
    createdAt: '',
    updatedAt: '',
};
const input = {
    title: task.title,
    description: task.description,
    start: task.start,
    end: task.end,
    status: task.status,
    priority: task.priority,
    isUrgent: task.isUrgent,
};
test('task validates duration, titles and enum values', () => {
    assert.equal(taskInputSchema.safeParse(input).success, true);
    assert.equal(taskInputSchema.safeParse({ ...input, title: '   ' }).success, false);
    assert.equal(taskInputSchema.safeParse({ ...input, end: input.start }).success, false);
    assert.equal(
        taskInputSchema.safeParse({ ...input, end: '2026-10-25T00:30:00Z' }).success,
        false,
    );
    assert.equal(taskInputSchema.safeParse({ ...input, status: 'invented' }).success, false);
    assert.equal(
        taskInputSchema.safeParse({
            ...input,
            start: '2026-10-25T00:30:00Z',
            end: '2026-10-25T02:30:00Z',
        }).success,
        true,
    );
});
test('search includes description and attribute filters intersect', () => {
    assert.equal(matchesFilters(task, { ...EMPTY_FILTERS, q: 'ДОСТУПНОСТЬ', urgent: 'yes' }), true);
    assert.equal(matchesFilters(task, { ...EMPTY_FILTERS, q: 'релиз', status: ['done'] }), false);
    assert.equal(matchesFilters(task, { ...EMPTY_FILTERS, urgent: 'no' }), false);
    assert.equal(matchesFilters(task, { ...EMPTY_FILTERS, priority: ['high'] }), false);
    assert.equal(
        matchesFilters(task, { ...EMPTY_FILTERS, status: ['planned'], priority: ['normal'] }),
        true,
    );
});

test('selected statuses and priorities use OR within each group and AND across groups', () => {
    const selected = {
        ...EMPTY_FILTERS,
        status: ['done', 'planned'] as Task['status'][],
        priority: ['high', 'normal'] as Task['priority'][],
        urgent: 'yes',
    };

    assert.equal(matchesFilters(task, selected), true);
    assert.equal(matchesFilters(task, { ...selected, priority: ['high'] }), false);
    assert.equal(matchesFilters(task, { ...selected, urgent: 'no' }), false);
    assert.equal(matchesFilters(task, { ...EMPTY_FILTERS, status: [], priority: [] }), true);
});

test('filter URL accepts old singular values, removes unknowns and duplicates, and clears all', () => {
    assert.deepEqual(taskFiltersFromSearch('?status=planned&priority=normal'), {
        ...EMPTY_FILTERS,
        status: ['planned'],
        priority: ['normal'],
    });

    const selected = taskFiltersFromSearch(
        '?status=done&status=planned&status=done&status=invalid&priority=high&priority=low&priority=high&urgent=invalid&q=релиз',
    );
    assert.deepEqual(selected, {
        q: 'релиз',
        status: ['planned', 'done'],
        priority: ['low', 'high'],
        urgent: '',
    });
    assert.equal(
        taskFiltersToSearch(selected).toString(),
        'q=%D1%80%D0%B5%D0%BB%D0%B8%D0%B7&status=planned&status=done&priority=low&priority=high',
    );
    assert.equal(taskFiltersToSearch(EMPTY_FILTERS).toString(), '');
});

test('removed period URL parameters cannot silently hide tasks', () => {
    const filters = taskFiltersFromSearch('?from=2099-01-01T00:00&to=2099-01-02T00:00&q=релиз');

    assert.deepEqual(filters, { ...EMPTY_FILTERS, q: 'релиз' });
    assert.equal(matchesFilters(task, filters), true);
});
