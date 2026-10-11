import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, type Task } from '../src/lib/task';
import { GANTT_COLUMN_FIELDS, toGanttTask } from '../src/modules/gantt/model/helpers';

test('task mapper preserves exact instants and elapsed duration, exposes selected fields, and never mutates input', () => {
    const task: Task = {
        id: 'mapper-task',
        title: 'Проверить план',
        description: 'Подробности задачи',
        start: '2026-11-01T01:30:00-04:00',
        end: '2026-11-01T02:30:00-05:00',
        status: 'in_progress',
        priority: 'high',
        isUrgent: true,
        version: 3,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
    };
    const before = structuredClone(task);
    Object.freeze(task);
    const mapped = toGanttTask(task);
    assert.equal(mapped.start.getTime(), Date.parse(task.start));
    assert.equal(mapped.end.getTime(), Date.parse(task.end));
    assert.equal(mapped.duration, 2);
    assert.equal(mapped.end.getTime() - mapped.start.getTime(), mapped.duration * HOUR);
    assert.equal(mapped[GANTT_COLUMN_FIELDS.title], task.title);
    assert.equal(mapped[GANTT_COLUMN_FIELDS.description], task.description);
    assert.equal(mapped[GANTT_COLUMN_FIELDS.status], 'В работе');
    assert.equal(mapped[GANTT_COLUMN_FIELDS.priority], 'Высокий');
    assert.equal(mapped[GANTT_COLUMN_FIELDS.urgent], 'Срочная');
    assert.ok(mapped[GANTT_COLUMN_FIELDS.start]);
    assert.ok(mapped[GANTT_COLUMN_FIELDS.end]);
    mapped.start.setTime(0);
    assert.deepEqual(task, before);
    const normal = toGanttTask({ ...task, isUrgent: false, status: 'done', priority: 'low' });
    assert.equal(normal.urgentLabel, 'Обычная');
    assert.equal(normal.statusLabel, 'Завершена');
    assert.equal(normal.priorityLabel, 'Низкий');
});
