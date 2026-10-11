import {
    addUnits,
    floorUnit,
    monthYearLabel,
    type ScaleMode,
    type TimelineRange,
} from './timeline';
import type { TimelineGeometry } from './adapter';

export type HeaderSegment = { key: number; left: number; width: number; label: string };
export function upperHeaderSegments(
    mode: ScaleMode,
    range: TimelineRange,
    geometry: TimelineGeometry,
): HeaderSegment[] {
    let unit: ScaleMode | null = null;
    if (mode === 'hour') {
        unit = 'day';
    } else if (mode === 'week') {
        unit = 'month';
    } else if (mode === 'quarter') {
        unit = 'quarter';
    }
    if (unit === null) {
        return [];
    }
    const result: HeaderSegment[] = [];
    let date = floorUnit(range.start, unit);
    while (date < range.end) {
        const next = floorUnit(addUnits(date, 1, unit), unit);
        const start = Math.max(date.getTime(), range.start.getTime());
        const end = Math.min(next.getTime(), range.end.getTime());
        let label: string;
        if (mode === 'hour') {
            label = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(date);
        } else if (mode === 'week') {
            label = monthYearLabel(date);
        } else {
            label = `Кв. ${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
        }
        const left = geometry.position(start);
        result.push({ key: date.getTime(), left, width: geometry.position(end) - left, label });
        date = next;
    }
    return result;
}
