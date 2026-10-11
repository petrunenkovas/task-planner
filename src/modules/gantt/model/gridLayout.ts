import {
    GANTT_COLUMN_WIDTHS,
    GANTT_COMPACT_TITLE_WIDTH,
    GANTT_MINIMUM_CHART_WIDTH,
    GANTT_MINIMUM_COMBINED_WIDTH,
    GANTT_SEPARATOR_WIDTH,
} from './config';
import type { TaskColumnId } from '../../../lib/taskFields';

export type GridLayoutMode = 'regular' | 'compact' | 'chart-only';

export function taskColumnWidth(column: TaskColumnId, mode: 'regular' | 'compact'): number {
    return mode === 'compact' && column === 'title'
        ? GANTT_COMPACT_TITLE_WIDTH
        : GANTT_COLUMN_WIDTHS[column];
}

export function taskGridLayout(columns: TaskColumnId[], mode: GridLayoutMode) {
    const columnMode = mode === 'regular' ? 'regular' : 'compact';
    const gridWidth = columns.reduce((sum, column) => sum + taskColumnWidth(column, columnMode), 0);
    // SVAR switches to grid-only below 651px. Keep the combined surface wide
    // enough for both panes and let the workspace scroll when necessary.
    const minimumWidth =
        mode === 'chart-only'
            ? GANTT_MINIMUM_CHART_WIDTH
            : Math.max(
                  GANTT_MINIMUM_COMBINED_WIDTH,
                  gridWidth + GANTT_SEPARATOR_WIDTH + GANTT_MINIMUM_CHART_WIDTH,
              );
    return { gridWidth, minimumWidth };
}
