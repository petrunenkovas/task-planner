import {
    GANTT_COLUMN_WIDTHS,
    GANTT_COMPACT_TITLE_WIDTH,
    GANTT_MINIMUM_CHART_WIDTH,
    GANTT_MINIMUM_COMBINED_WIDTH,
    GANTT_SEPARATOR_WIDTH,
} from './config';
import type { TaskColumnId } from '../../../lib/taskFields';

export function taskColumnWidth(column: TaskColumnId, options: { isCompact: boolean }): number {
    return options.isCompact && column === 'title'
        ? GANTT_COMPACT_TITLE_WIDTH
        : GANTT_COLUMN_WIDTHS[column];
}

export function taskGridLayout(
    columns: TaskColumnId[],
    options: { isCompact: boolean; isHidden: boolean },
) {
    const gridWidth = columns.reduce((sum, column) => sum + taskColumnWidth(column, options), 0);
    // SVAR switches to grid-only below 651px. Keep the combined surface wide
    // enough for both panes and let the workspace scroll when necessary.
    const minimumWidth = options.isHidden
        ? GANTT_MINIMUM_CHART_WIDTH
        : Math.max(
              GANTT_MINIMUM_COMBINED_WIDTH,
              gridWidth + GANTT_SEPARATOR_WIDTH + GANTT_MINIMUM_CHART_WIDTH,
          );
    return { gridWidth, minimumWidth };
}
