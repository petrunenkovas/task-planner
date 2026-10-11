import { SCALE_MODES, type ScaleMode } from './modules/gantt/model/timeline';
import {
    BOARD_FIELD_IDS,
    TASK_COLUMN_IDS,
    type BoardFieldId,
    type TaskColumnId,
} from './lib/taskFields';

export type PlannerPreferences = {
    version: 2;
    mode: ScaleMode;
    ganttColumns: TaskColumnId[];
    listColumns: TaskColumnId[];
    boardFields: BoardFieldId[];
};

export const DEFAULT_PREFERENCES: PlannerPreferences = {
    version: 2,
    mode: 'hour',
    ganttColumns: ['title'],
    listColumns: ['title', 'description', 'start', 'end', 'status', 'priority'],
    boardFields: ['priority', 'urgent'],
};

const STORAGE_KEY = 'task-planner.preferences.v2';

function validatedSelection<T extends string>(
    value: unknown,
    allowed: readonly T[],
    required: readonly T[] = [],
): T[] {
    const selected = [...required];
    if (Array.isArray(value)) {
        value.forEach((id) => {
            if (allowed.includes(id as T) && !selected.includes(id as T)) {
                selected.push(id as T);
            }
        });
    }
    return selected;
}

function defaults(): PlannerPreferences {
    return {
        ...DEFAULT_PREFERENCES,
        ganttColumns: [...DEFAULT_PREFERENCES.ganttColumns],
        listColumns: [...DEFAULT_PREFERENCES.listColumns],
        boardFields: [...DEFAULT_PREFERENCES.boardFields],
    };
}

export function validatePreferences(value: unknown): PlannerPreferences {
    if (value === null || typeof value !== 'object' || !('version' in value)) {
        return defaults();
    }
    const record = value as Record<string, unknown>;
    if (record.version !== 2) {
        return defaults();
    }
    const mode = SCALE_MODES.includes(record.mode as ScaleMode)
        ? (record.mode as ScaleMode)
        : DEFAULT_PREFERENCES.mode;

    return {
        version: 2,
        mode,
        ganttColumns: validatedSelection(
            record.ganttColumns ?? DEFAULT_PREFERENCES.ganttColumns,
            TASK_COLUMN_IDS,
            ['title'],
        ),
        listColumns: validatedSelection(
            record.listColumns ?? DEFAULT_PREFERENCES.listColumns,
            TASK_COLUMN_IDS,
            ['title'],
        ),
        boardFields: validatedSelection(
            record.boardFields ?? DEFAULT_PREFERENCES.boardFields,
            BOARD_FIELD_IDS,
        ),
    };
}

export function readPreferences(storage: Pick<Storage, 'getItem'>): PlannerPreferences {
    try {
        const stored = storage.getItem(STORAGE_KEY);
        return validatePreferences(JSON.parse(stored ?? 'null'));
    } catch {
        return defaults();
    }
}

export function writePreferences(
    storage: Pick<Storage, 'setItem'>,
    value: PlannerPreferences,
): void {
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(validatePreferences(value)));
    } catch {
        /* Settings remain usable when storage is unavailable. */
    }
}
