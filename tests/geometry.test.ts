import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore, getDiffer } from '@svar-ui/gantt-store';
import { HOUR, type Task } from '../src/lib/task';
import {
    configureHourFrame,
    createTimelineGeometry,
    ELAPSED_HOUR_UNIT,
    taskDatesFromDrag,
} from '../src/modules/gantt/model/adapter';
import {
    SCALE_MODES,
    timelineRange,
    lowerUnit,
    type ScaleMode,
} from '../src/modules/gantt/model/timeline';

function inZone(zone: string, action: () => void) {
    const previous = process.env.TZ;
    process.env.TZ = zone;

    try {
        action();
    } finally {
        if (previous === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = previous;
        }
    }
}

function task(start: string, end: string): Task {
    return {
        id: 'geometry-task',
        title: 'Geometry',
        description: '',
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        status: 'planned',
        priority: 'normal',
        isUrgent: false,
        version: 1,
        createdAt: '',
        updatedAt: '',
    };
}

function verifyDrag(original: Task, hours: number) {
    for (const mode of SCALE_MODES) {
        const range = timelineRange([original], mode);
        const geometry = createTimelineGeometry(mode, range, 180);
        const start = Date.parse(original.start);
        const end = Date.parse(original.end);
        const delta = hours * HOUR;
        const startDelta = geometry.position(start + delta) - geometry.position(start);
        const endDelta = geometry.position(end + delta) - geometry.position(end);
        const moved = taskDatesFromDrag(original, 'move', startDelta, geometry);
        const resizedStart = taskDatesFromDrag(original, 'start', startDelta, geometry);
        const resizedEnd = taskDatesFromDrag(original, 'end', endDelta, geometry);

        assert.equal(Date.parse(moved.start), start + delta, `${mode}: move start`);
        assert.equal(Date.parse(moved.end), end + delta, `${mode}: move end`);
        assert.equal(
            Date.parse(moved.end) - Date.parse(moved.start),
            end - start,
            `${mode}: duration`,
        );
        assert.equal(Date.parse(resizedStart.start), start + delta, `${mode}: left edge`);
        assert.equal(resizedStart.end, original.end, `${mode}: unchanged right`);
        assert.equal(Date.parse(resizedEnd.end), end + delta, `${mode}: right edge`);
        assert.equal(resizedEnd.start, original.start, `${mode}: unchanged left`);
    }
}

test('actual SVAR inverse maps move and both resize edges for 28/29/30/31-day months', () => {
    inZone('Europe/Moscow', () => {
        for (const month of ['2025-02', '2024-02', '2026-04', '2026-01']) {
            verifyDrag(task(`${month}-15T09:00:00+03:00`, `${month}-18T18:00:00+03:00`), 24);
            verifyDrag(task(`${month}-15T09:00:00+03:00`, `${month}-18T18:00:00+03:00`), -24);
        }
    });
});

test('fractional system offsets preserve original UTC minutes on all scales', () => {
    for (const zone of ['Asia/Kolkata', 'Asia/Kathmandu']) {
        inZone(zone, () =>
            verifyDrag(task('2026-09-27T07:00:00.000Z', '2026-09-30T08:00:00.000Z'), 3),
        );
    }
});

test('actual geometry distinguishes repeated hours and stays monotone at DST month ends', () => {
    inZone('America/New_York', () => {
        verifyDrag(task('2026-03-08T05:00:00.000Z', '2026-03-10T06:00:00.000Z'), 3);
        verifyDrag(task('2026-11-01T05:30:00.000Z', '2026-11-03T06:30:00.000Z'), 1);
        const first = new Date('2026-11-01T05:30:00Z');
        const second = new Date('2026-11-01T06:30:00Z');

        for (const mode of SCALE_MODES) {
            const range = timelineRange(
                [{ start: first.toISOString(), end: '2026-12-02T00:00:00Z' }],
                mode,
            );
            const geometry = createTimelineGeometry(mode, range, 180);

            assert.ok(geometry.position(second.getTime()) > geometry.position(first.getTime()));
            const before = new Date('2026-12-01T04:30:00Z');
            const after = new Date('2026-12-01T05:00:00Z');

            assert.ok(geometry.position(after.getTime()) > geometry.position(before.getTime()));
        }

        const diff = getDiffer('month', undefined, 1);
        const start = new Date('2026-11-01T00:00:00-04:00');

        assert.ok(diff(new Date('2026-12-01T04:30:00Z'), start, ELAPSED_HOUR_UNIT) < 1);
        assert.equal(diff(new Date('2026-12-01T05:00:00Z'), start, ELAPSED_HOUR_UNIT), 1);
    });
});

test('resize beyond the padded range expands inverse bounds instead of silently clamping', () => {
    inZone('Europe/Moscow', () =>
        verifyDrag(task('2026-09-27T10:00:00Z', '2026-09-27T12:00:00Z'), 100 * 24),
    );
});

test('actual SVAR hourly scale retains an end in the second repeated DST hour', () => {
    inZone('America/New_York', () => {
        const range = timelineRange(
            [{ start: '2026-10-31T23:00:00-04:00', end: '2026-11-01T00:00:00-04:00' }],
            'hour',
        );
        const store = new DataStore((initial) => {
            let value = initial;

            return {
                subscribe: (listener) => {
                    listener(value);
                },
                update: (update) => {
                    value = update(value);
                },
                set: (next) => {
                    value = next;
                },
            };
        });

        configureHourFrame(range.start);
        store.init({
            tasks: [],
            links: [],
            start: range.start,
            end: range.end,
            scales: [{ unit: 'hour', step: 1, format: '%H' }],
            lengthUnit: ELAPSED_HOUR_UNIT,
            durationUnit: 'hour',
            cellWidth: 100,
            cellHeight: 54,
            scaleHeight: 42,
        });

        const scales = store.getState()._scales;

        assert.ok(scales);
        assert.equal(scales.end.getTime(), range.end.getTime());
        assert.equal(scales.start.getTime(), range.start.getTime());
        assert.equal(scales.width, 500);
        assert.equal(
            getDiffer('hour')(new Date('2026-11-01T06:00:00Z'), new Date('2026-11-01T05:00:00Z')),
            1,
        );
    });
});

function chartStore(range: { start: Date; end: Date }, mode: ScaleMode = 'hour') {
    configureHourFrame(range.start);
    const store = new DataStore((initial) => {
        let value = initial;
        return {
            subscribe: (listener) => {
                listener(value);
            },
            update: (update) => {
                value = update(value);
            },
            set: (next) => {
                value = next;
            },
        };
    });
    store.init({
        tasks: [],
        links: [],
        start: range.start,
        end: range.end,
        scales: [{ unit: lowerUnit(mode), step: 1, format: '%H' }],
        lengthUnit: ELAPSED_HOUR_UNIT,
        durationUnit: 'hour',
        cellWidth: 100,
        cellHeight: 54,
        scaleHeight: 42,
    });
    return store;
}

test('actual resized short and empty charts map one expanded cell to one elapsed hour', async () => {
    const original = task('2026-09-27T10:00:00Z', '2026-09-27T11:00:00Z');
    for (const range of [timelineRange([original], 'hour'), timelineRange([], 'hour')]) {
        const store = chartStore(range);
        await store.in.exec('resize-chart', { width: 800, height: 400, scrollSize: 0 });
        const state = store.getState();
        assert.ok(state._scales);
        assert.ok(state.cellWidth && state.cellWidth > 100);
        const geometry = createTimelineGeometry('hour', state._scales, state.cellWidth);
        const moved = taskDatesFromDrag(original, 'move', state.cellWidth, geometry);
        assert.equal(Date.parse(moved.start) - Date.parse(original.start), HOUR);
    }
});

test('actual hour frames remain stable through Lord Howe fractional DST and modern Kathmandu offsets', () => {
    for (const zone of ['Australia/Lord_Howe', 'Asia/Kathmandu']) {
        inZone(zone, () => {
            const original =
                zone === 'Australia/Lord_Howe'
                    ? task('2026-10-04T02:30:00+11:00', '2026-10-04T03:30:00+11:00')
                    : task('2026-10-04T09:00:00+05:45', '2026-10-04T10:00:00+05:45');
            const range = timelineRange([original], 'hour');
            const store = chartStore(range);
            assert.equal(store.getState()._scales?.start.getTime(), range.start.getTime());
            assert.equal(store.getState()._scales?.end.getTime(), range.end.getTime());
            assert.equal(
                store.getState()._scales?.width,
                ((range.end.getTime() - range.start.getTime()) / HOUR) * 100,
            );
            const geometry = createTimelineGeometry('hour', range, 100);
            assert.equal(
                Date.parse(taskDatesFromDrag(original, 'move', 100, geometry).start) -
                    Date.parse(original.start),
                HOUR,
            );
            if (zone === 'Asia/Kathmandu') {
                assert.equal(range.start.getMinutes(), 0);
            }
        });
    }
});

test('quarter/year moves and both resize edges retain fractional phase across leap years and DST zones', () => {
    for (const zone of ['Europe/Moscow', 'America/New_York', 'Australia/Lord_Howe']) {
        inZone(zone, () => {
            verifyDrag(task('2024-02-28T12:45:00Z', '2024-03-05T12:45:00Z'), 48);
        });
    }
});

test('actual quarter/year frames use calendar cells and resized geometry without width drift', async () => {
    for (const mode of ['quarter', 'year'] as const) {
        const original = task('2024-02-28T12:45:00Z', '2024-03-05T12:45:00Z');
        const range = timelineRange([original], mode);
        const store = chartStore(range, mode);
        await store.in.exec('resize-chart', { width: 4000, height: 400, scrollSize: 0 });
        const state = store.getState();
        assert.ok(state._scales && state.cellWidth);
        const geometry = createTimelineGeometry(mode, state._scales, state.cellWidth);
        assert.ok(
            Math.abs(geometry.position(state._scales.end.getTime()) - state._scales.width) < 1e-7,
        );
        const start = Date.parse(original.start);
        const pixels = geometry.position(start + 3 * HOUR) - geometry.position(start);
        assert.equal(
            Date.parse(taskDatesFromDrag(original, 'move', pixels, geometry).start),
            start + 3 * HOUR,
        );
    }
});
