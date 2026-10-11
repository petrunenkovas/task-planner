import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_PREFERENCES,
    readPreferences,
    validatePreferences,
    writePreferences,
} from '../src/preferences';

test('preferences validate unknown values and required title independently by view', () => {
    assert.deepEqual(validatePreferences({ version: 3 }), DEFAULT_PREFERENCES);
    assert.deepEqual(
        validatePreferences({
            version: 2,
            mode: 'unknown',
            ganttColumns: ['status', 'title', 'status', 'unknown'],
            listColumns: ['priority', 'priority', 'unknown'],
            boardFields: ['description', 'status', 'description'],
        }),
        {
            version: 2,
            mode: 'hour',
            ganttColumns: ['title', 'status'],
            listColumns: ['title', 'priority'],
            boardFields: ['description'],
        },
    );
});

test('separate view settings survive save/reload', () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
    values.set(
        'task-planner.preferences.v2',
        JSON.stringify({
            version: 2,
            mode: 'week',
            ganttColumns: ['title', 'urgent'],
            listColumns: ['title', 'description'],
            boardFields: ['description'],
        }),
    );
    assert.deepEqual(readPreferences(storage), {
        version: 2,
        mode: 'week',
        ganttColumns: ['title', 'urgent'],
        listColumns: ['title', 'description'],
        boardFields: ['description'],
    });

    const updated = {
        ...DEFAULT_PREFERENCES,
        mode: 'week' as const,
        ganttColumns: ['title', 'urgent'] as typeof DEFAULT_PREFERENCES.ganttColumns,
        listColumns: ['title', 'description', 'duration'] as typeof DEFAULT_PREFERENCES.listColumns,
        boardFields: ['description'] as typeof DEFAULT_PREFERENCES.boardFields,
    };
    writePreferences(storage, updated);
    assert.ok(values.has('task-planner.preferences.v2'));
    assert.deepEqual(readPreferences(storage), updated);
});

test('invalid JSON and unavailable storage use safe defaults', () => {
    assert.deepEqual(readPreferences({ getItem: () => '{bad' }), DEFAULT_PREFERENCES);
    assert.deepEqual(
        readPreferences({
            getItem: () => {
                throw new Error('Denied');
            },
        }),
        DEFAULT_PREFERENCES,
    );
    assert.doesNotThrow(() =>
        writePreferences(
            {
                setItem: () => {
                    throw new Error('Quota');
                },
            },
            DEFAULT_PREFERENCES,
        ),
    );
});
