export const WORKSPACE_ROUTES = [
    { path: '/list', label: 'Список', view: 'list' },
    { path: '/board', label: 'Доска', view: 'board' },
    { path: '/gantt', label: 'Диаграмма', view: 'gantt' },
] as const;

export type WorkspaceView = (typeof WORKSPACE_ROUTES)[number]['view'];
