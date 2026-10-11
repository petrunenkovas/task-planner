import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, type Task } from '../src/lib/task';
import { matchesFilters, EMPTY_FILTERS } from '../src/lib/taskFilters';
import {
    addUnits,
    floorUnit,
    SCALE_MODES,
    timelineRange,
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

function assertRange(actual: { start: Date; end: Date }, start: string, end: string) {
    assert.equal(actual.start.getTime(), new Date(start).getTime());
    assert.equal(actual.end.getTime(), new Date(end).getTime());
}

test('each scale adds two aligned units without counting an extra cell at an exact end', () => {
    inZone('Europe/Moscow', () => {
        assertRange(
            timelineRange(
                [{ start: '2026-09-27T10:00:00+03:00', end: '2026-09-27T11:00:00+03:00' }],
                'hour',
            ),
            '2026-09-27T08:00',
            '2026-09-27T13:00',
        );
        assertRange(
            timelineRange(
                [{ start: '2026-09-27T09:00:00+03:00', end: '2026-09-28T00:00:00+03:00' }],
                'day',
            ),
            '2026-09-25T00:00',
            '2026-09-30T00:00',
        );
        assertRange(
            timelineRange(
                [{ start: '2026-09-30T09:00:00+03:00', end: '2026-10-05T00:00:00+03:00' }],
                'week',
            ),
            '2026-09-14T00:00',
            '2026-10-19T00:00',
        );
        assertRange(
            timelineRange(
                [{ start: '2026-12-15T09:00:00+03:00', end: '2027-01-01T00:00:00+03:00' }],
                'month',
            ),
            '2026-10-01T00:00',
            '2027-03-01T00:00',
        );
    });
});

test('month boundaries handle January overflow and February in leap/non-leap years', () => {
    inZone('Europe/Moscow', () => {
        for (const year of [2024, 2025]) {
            const end = new Date(year, 2, 1).toISOString();
            const start = new Date(year, 1, 28, 10).toISOString();

            assertRange(
                timelineRange([{ start, end }], 'month'),
                `${year - 1}-12-01T00:00`,
                `${year}-05-01T00:00`,
            );
        }
    });
});

test('empty fallback has exactly five selected cells with the current cell in the middle', () => {
    inZone('America/New_York', () => {
        const now = new Date('2026-03-08T12:30:00-04:00');

        for (const mode of SCALE_MODES) {
            const range = timelineRange([], mode, now);

            assert.equal(addUnits(range.start, 2, mode).getTime(), floorUnit(now, mode).getTime());
            assert.equal(addUnits(range.start, 5, mode).getTime(), range.end.getTime());
        }
    });
});

test('calendar days and Monday weeks retain midnight across DST while hour steps are elapsed', () => {
    inZone('America/New_York', () => {
        const spring = new Date('2026-03-08T00:00:00-05:00');
        const fall = new Date('2026-11-01T00:00:00-04:00');

        assert.equal((addUnits(spring, 1, 'day').getTime() - spring.getTime()) / HOUR, 23);
        assert.equal((addUnits(fall, 1, 'day').getTime() - fall.getTime()) / HOUR, 25);
        assert.equal(floorUnit(new Date('2026-03-08T12:00:00-04:00'), 'week').getDay(), 1);
        assert.equal(addUnits(spring, 1, 'day').getHours(), 0);
        assert.equal(addUnits(fall, 2, 'hour').getTime() - fall.getTime(), 2 * HOUR);
        assert.equal(
            floorUnit(new Date('2026-11-01T01:30:00-05:00'), 'hour').toISOString(),
            '2026-11-01T06:00:00.000Z',
        );
        assertRange(
            timelineRange(
                [{ start: '2026-10-31T23:00:00-04:00', end: '2026-11-01T00:00:00-04:00' }],
                'hour',
            ),
            '2026-10-31T21:00:00-04:00',
            '2026-11-01T01:00:00-05:00',
        );
    });
});

test('only visible filtered tasks define the range', () => {
    const first = {
        id: '1',
        title: 'visible',
        description: '',
        start: '2026-01-10T10:00:00Z',
        end: '2026-01-10T11:00:00Z',
        status: 'planned',
        priority: 'normal',
        isUrgent: false,
        version: 1,
        createdAt: '',
        updatedAt: '',
    } satisfies Task;
    const hidden = {
        ...first,
        id: '2',
        title: 'hidden',
        start: '2030-01-01T10:00:00Z',
        end: '2030-02-01T10:00:00Z',
    };
    const visible = [first, hidden].filter((task) =>
        matchesFilters(task, { ...EMPTY_FILTERS, q: 'visible' }),
    );

    assert.deepEqual(timelineRange(visible, 'month'), timelineRange([first], 'month'));
});

test('week and month floors reset time after choosing the date across a midnight DST gap', () => {
    inZone('America/Santiago', () => {
        const date = new Date('2026-09-06T12:00:00-03:00');
        assert.equal(floorUnit(date, 'week').getHours(), 0);
        assert.equal(floorUnit(date, 'month').getHours(), 0);
        assert.equal(floorUnit(date, 'week').getDate(), 31);
        assert.equal(floorUnit(date, 'month').getDate(), 1);
    });
});

test('quarter and year ranges align across year boundaries and exact endpoints', () => {
    inZone('Europe/Moscow', () => {
        const task = { start: '2026-12-15T10:00:00+03:00', end: '2027-01-01T00:00:00+03:00' };
        assertRange(timelineRange([task], 'quarter'), '2026-04-01T00:00', '2027-07-01T00:00');
        assertRange(timelineRange([task], 'year'), '2024-01-01T00:00', '2029-01-01T00:00');
        assert.equal(
            addUnits(new Date('2024-01-01T00:00'), 1, 'year').getTime() -
                new Date('2024-01-01T00:00').getTime(),
            366 * 24 * HOUR,
        );
        assert.equal(floorUnit(new Date('2026-09-27T12:00'), 'quarter').getMonth(), 6);
    });
});
