import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineGeometry } from '../src/modules/gantt/model/adapter';
import { upperHeaderSegments } from '../src/modules/gantt/model/timelineHeader';
import { scaleLabel } from '../src/modules/gantt/model/timeline';

const previousZone = process.env.TZ;
process.env.TZ = 'Europe/Moscow';
test.after(() => {
    if (previousZone === undefined) {
        delete process.env.TZ;
    } else {
        process.env.TZ = previousZone;
    }
});

test('week month header splits a whole Sep28–Oct4 cell exactly at October1 without day divisions', () => {
    const range = {
        start: new Date('2026-09-28T00:00:00+03:00'),
        end: new Date('2026-10-05T00:00:00+03:00'),
    };
    for (const cellWidth of [140, 350]) {
        const segments = upperHeaderSegments(
            'week',
            range,
            createTimelineGeometry('week', range, cellWidth),
        );
        assert.equal(segments.length, 2);
        assert.ok(Math.abs((segments[0]?.width ?? 0) - (cellWidth * 3) / 7) < 1e-8);
        assert.ok(Math.abs((segments[1]?.width ?? 0) - (cellWidth * 4) / 7) < 1e-8);
        assert.equal(segments[0]?.label, "Сентябрь'26");
        assert.equal(segments[1]?.label, "Октябрь'26");
        assert.equal(scaleLabel(range.start, 'week'), '28 - 04');
        assert.ok(Math.abs(segments.reduce((sum, cell) => sum + cell.width, 0) - cellWidth) < 1e-8);
    }
});

test('hour day groups and quarter groups match exact lower geometry and year/month labels', () => {
    const hours = {
        start: new Date('2026-09-27T22:00:00+03:00'),
        end: new Date('2026-09-28T02:00:00+03:00'),
    };
    const days = upperHeaderSegments('hour', hours, createTimelineGeometry('hour', hours, 48));
    assert.deepEqual(
        days.map(({ width, label }) => ({ width, label })),
        [
            { width: 96, label: '27 сентября' },
            { width: 96, label: '28 сентября' },
        ],
    );
    assert.equal(scaleLabel(hours.end, 'hour'), '02');
    const quarter = {
        start: new Date('2026-07-01T00:00:00+03:00'),
        end: new Date('2027-01-01T00:00:00+03:00'),
    };
    const groups = upperHeaderSegments(
        'quarter',
        quarter,
        createTimelineGeometry('quarter', quarter, 140),
    );
    assert.deepEqual(
        groups.map(({ width, label }) => ({ width, label })),
        [
            { width: 420, label: 'Кв. 3 2026' },
            { width: 420, label: 'Кв. 4 2026' },
        ],
    );
    assert.equal(scaleLabel(new Date('2026-09-01'), 'quarter'), 'Сентябрь');
    assert.equal(scaleLabel(new Date('2026-09-01'), 'month'), "Сентябрь'26");
    assert.equal(scaleLabel(new Date('2026-09-01'), 'year'), '2026');
});

test('calendar day group ends at exact midnight after Santiago skipped midnight', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/Santiago';
    try {
        const range = {
            start: new Date('2026-09-06T01:00:00-03:00'),
            end: new Date('2026-09-08T00:00:00-03:00'),
        };
        const geometry = createTimelineGeometry('hour', range, 48);
        const cells = upperHeaderSegments('hour', range, geometry);
        assert.equal(cells.length, 2);
        assert.equal(cells[0]?.width, 23 * 48);
        assert.equal(cells[1]?.left, 23 * 48);
        assert.equal(cells[1]?.width, 24 * 48);
    } finally {
        if (previous === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = previous;
        }
    }
});
