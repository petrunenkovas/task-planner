import type { TaskColumnId } from '../../../lib/taskFields';
import type { ScaleMode } from './timeline';

export const GANTT_CELL_WIDTHS: Record<ScaleMode, number> = {
    hour: 48,
    day: 110,
    week: 140,
    month: 140,
    quarter: 140,
    year: 140,
};
export const GANTT_ROW_HEIGHT = 54;
export const GANTT_SCALE_HEIGHT = 42;
export const GANTT_COMPACT_BREAKPOINT = 700;
export const GANTT_COMPACT_MEDIA = `(max-width: ${GANTT_COMPACT_BREAKPOINT}px)`;
export const GANTT_COMPACT_TITLE_WIDTH = 150;
export const GANTT_COLUMN_WIDTHS: Record<TaskColumnId, number> = {
    title: 220,
    description: 240,
    start: 180,
    end: 180,
    duration: 140,
    status: 140,
    priority: 140,
    urgent: 140,
};
export const GANTT_MINIMUM_CHART_WIDTH = 320;
export const GANTT_SEPARATOR_WIDTH = 4;
export const GANTT_MINIMUM_COMBINED_WIDTH = 651;
