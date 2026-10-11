import { registerScaleUnit } from '@svar-ui/react-gantt';
import { getDiffer } from '@svar-ui/gantt-store';
import { addUnits, floorUnit, lowerUnit } from './timeline';
import { HOUR, type Task, type TaskInput } from '../../../lib/task';
import type { ScaleMode, TimelineRange } from './timeline';

export const ELAPSED_HOUR_UNIT = 'plannerElapsedHour';
let hourFrameAnchor = new Date().getTimezoneOffset() * 60_000;

export function configureHourFrame(start: Date): void {
    hourFrameAnchor = start.getTime();
}

function floorHour(date: Date): Date {
    return floorUnit(date, 'hour', hourFrameAnchor);
}

function hoursInUnit(mode: ScaleMode, fallback: number) {
    return (date: Date | undefined = undefined) => {
        if (date === undefined) {
            return fallback;
        }

        const start = floorUnit(date, mode);
        const end = addUnits(start, 1, mode);

        return (end.getTime() - start.getTime()) / HOUR;
    };
}

// The library's native hour length unit truncates fractional hours and assumes
// every day/month has the same elapsed length. Register an internal precise unit
// through its public API; the displayed scales still use hour/day/week/month.
// Keep the hour frame itself on the original offset during the repeated DST
// hour. Native startOfHour/setMinutes would collapse the second occurrence.
registerScaleUnit('hour', {
    start: (date) => floorHour(date),
    end: (date) => new Date(floorHour(date).getTime() + HOUR - 1),
    isSame: (first, second) => floorHour(first).getTime() === floorHour(second).getTime(),
    add: (date, hours) => new Date(date.getTime() + hours * HOUR),
    diff: (first, second) => Math.trunc((first.getTime() - second.getTime()) / HOUR),
});

registerScaleUnit(ELAPSED_HOUR_UNIT, {
    start: (date) => new Date(date),
    end: (date) => new Date(date),
    isSame: (first, second) => first.getTime() === second.getTime(),
    add: (date, hours) => new Date(date.getTime() + hours * HOUR),
    diff: (first, second) => (first.getTime() - second.getTime()) / HOUR,
    biggerCount: {
        hour: 1,
        day: hoursInUnit('day', 24),
        week: hoursInUnit('week', 7 * 24),
        month: hoursInUnit('month', 30 * 24),
        year: hoursInUnit('year', 365 * 24),
    },
});

export type DragEdge = 'move' | 'start' | 'end';
export type TimelineGeometry = {
    position: (instant: number) => number;
    range: TimelineRange;
};

export function createTimelineGeometry(
    mode: ScaleMode,
    range: TimelineRange,
    cellWidth: number,
): TimelineGeometry {
    const diff = getDiffer(lowerUnit(mode), undefined, 1);
    const lengthUnit = ELAPSED_HOUR_UNIT;

    return {
        range,
        position: (instant) => diff(new Date(instant), range.start, lengthUnit) * cellWidth,
    };
}

// Search only whole elapsed-hour shifts relative to the original instant.
// This preserves its minute/offset phase and avoids converting a month to 720 hours.
export function hourShiftAtPixel(
    original: number,
    pixelDelta: number,
    geometry: TimelineGeometry,
): number {
    if (pixelDelta === 0) {
        return 0;
    }

    const target = geometry.position(original) + pixelDelta;
    let low = Math.ceil((geometry.range.start.getTime() - original) / HOUR);
    let high = Math.floor((geometry.range.end.getTime() - original) / HOUR);

    let span = Math.max(1, high - low);

    while (geometry.position(original + low * HOUR) > target) {
        low -= span;
        span *= 2;
    }

    span = Math.max(1, high - low);

    while (geometry.position(original + high * HOUR) < target) {
        high += span;
        span *= 2;
    }

    while (low < high) {
        const middle = Math.floor((low + high) / 2);

        if (geometry.position(original + middle * HOUR) < target) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    const candidates = [low - 1, low];
    const nearest = candidates.reduce((nearest, candidate) => {
        const distance = Math.abs(geometry.position(original + candidate * HOUR) - target);
        const nearestDistance = Math.abs(geometry.position(original + nearest * HOUR) - target);

        if (
            distance < nearestDistance ||
            (distance === nearestDistance && Math.abs(candidate) < Math.abs(nearest))
        ) {
            return candidate;
        }
        return nearest;
    }, candidates[0] ?? 0);

    return nearest * HOUR;
}

export function taskDatesFromDrag(
    task: Task,
    edge: DragEdge,
    pixelDelta: number,
    geometry: TimelineGeometry,
): Pick<TaskInput, 'start' | 'end'> {
    const start = Date.parse(task.start);
    const end = Date.parse(task.end);
    const delta = hourShiftAtPixel(edge === 'end' ? end : start, pixelDelta, geometry);

    return {
        start: new Date(start + (edge === 'end' ? 0 : delta)).toISOString(),
        end: new Date(end + (edge === 'start' ? 0 : delta)).toISOString(),
    };
}
