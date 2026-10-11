export const TASK_COLUMN_IDS = [
    'title',
    'description',
    'start',
    'end',
    'duration',
    'status',
    'priority',
    'urgent',
] as const;
export type TaskColumnId = (typeof TASK_COLUMN_IDS)[number];
export const TASK_COLUMN_LABELS: Record<TaskColumnId, string> = {
    title: 'Название',
    description: 'Описание',
    start: 'Начало',
    end: 'Конец',
    duration: 'Длительность',
    status: 'Статус',
    priority: 'Приоритет',
    urgent: 'Срочность',
};

export const BOARD_FIELD_IDS = ['description', 'priority', 'urgent'] as const;
export type BoardFieldId = (typeof BOARD_FIELD_IDS)[number];
export const BOARD_FIELD_LABELS: Record<BoardFieldId, string> = {
    description: 'Описание',
    priority: 'Приоритет',
    urgent: 'Срочность',
};
