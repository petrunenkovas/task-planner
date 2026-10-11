import { HOUR } from '../../../lib/task';

export const SCALE_MODES = ['hour', 'day', 'week', 'month', 'quarter', 'year'] as const;
export type ScaleMode = (typeof SCALE_MODES)[number];
export type TimelineRange = { start: Date; end: Date };
export const SCALE_LABELS: Record<ScaleMode, string> = {
    hour: 'Часы',
    day: 'Дни',
    week: 'Недели',
    month: 'Месяцы',
    quarter: 'Кварталы',
    year: 'Годы',
};

export function floorUnit(
    value: Date,
    mode: ScaleMode,
    hourAnchor = new Date().getTimezoneOffset() * 60_000,
): Date {
    const date = new Date(value);

    if (mode === 'hour') {
        // Use a fixed local-offset phase for elapsed hours. Re-rounding a
        // boundary must not change it during a fractional DST transition.
        return new Date(hourAnchor + Math.floor((date.getTime() - hourAnchor) / HOUR) * HOUR);
    }

    if (mode === 'week') {
        date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    } else if (mode === 'month' || mode === 'quarter' || mode === 'year') {
        date.setDate(1);
        if (mode === 'quarter') {
            date.setMonth(Math.floor(date.getMonth() / 3) * 3);
        }
        if (mode === 'year') {
            date.setMonth(0);
        }
    }

    date.setHours(0, 0, 0, 0);

    return date;
}

export function addUnits(value: Date, amount: number, mode: ScaleMode): Date {
    const date = new Date(value);

    if (mode === 'hour') {
        return new Date(date.getTime() + amount * HOUR);
    }

    if (mode === 'month' || mode === 'quarter') {
        date.setMonth(date.getMonth() + amount * (mode === 'quarter' ? 3 : 1));
    } else if (mode === 'year') {
        date.setFullYear(date.getFullYear() + amount);
    } else {
        date.setDate(date.getDate() + amount * (mode === 'week' ? 7 : 1));
    }

    return date;
}

export function timelineRange(
    tasks: ReadonlyArray<{ start: string; end: string }>,
    mode: ScaleMode,
    now = new Date(),
): TimelineRange {
    if (tasks.length === 0) {
        const current = floorUnit(now, mode, now.getTimezoneOffset() * 60_000);

        return { start: addUnits(current, -2, mode), end: addUnits(current, 3, mode) };
    }

    const { earliest, latest } = tasks.reduce(
        (range, task) => ({
            earliest: Math.min(range.earliest, Date.parse(task.start)),
            latest: Math.max(range.latest, Date.parse(task.end)),
        }),
        { earliest: Infinity, latest: -Infinity },
    );

    const anchor = new Date(earliest).getTimezoneOffset() * 60_000;
    const first = floorUnit(new Date(earliest), mode, anchor);
    const lastFloor = floorUnit(new Date(latest), mode, anchor);
    const last = lastFloor.getTime() === latest ? lastFloor : addUnits(lastFloor, 1, mode);

    return { start: addUnits(first, -2, mode), end: addUnits(last, 2, mode) };
}

export function lowerUnit(mode: ScaleMode): ScaleMode {
    return mode === 'quarter' ? 'month' : mode;
}

export function monthYearLabel(date: Date): string {
    const month = new Intl.DateTimeFormat('ru', { month: 'long' }).format(date);
    return `${month[0]?.toUpperCase()}${month.slice(1)}'${String(date.getFullYear()).slice(-2)}`;
}

export function scaleLabel(date: Date, mode: ScaleMode): string {
    if (mode === 'hour') {
        return String(date.getHours()).padStart(2, '0');
    }
    if (mode === 'year') {
        return String(date.getFullYear());
    }
    if (mode === 'month') {
        return monthYearLabel(date);
    }
    if (mode === 'quarter') {
        const month = new Intl.DateTimeFormat('ru', { month: 'long' }).format(date);
        return `${month[0]?.toUpperCase()}${month.slice(1)}`;
    }
    if (mode === 'week') {
        const end = addUnits(date, 1, 'week');
        end.setDate(end.getDate() - 1);
        return `${String(date.getDate()).padStart(2, '0')} - ${String(end.getDate()).padStart(2, '0')}`;
    }
    return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(date);
}
