import type { Status } from '../../../lib/task';

export const KANBAN_COLUMN_WIDTH = 280;
export const KANBAN_COLUMN_GAP = 12;

export const KANBAN_STATUS_COLORS: Record<
    Status,
    { accent: string; surface: string; text: string }
> = {
    planned: { accent: '#245edb', surface: '#eef4ff', text: '#174da9' },
    in_progress: { accent: '#986600', surface: '#fff8e8', text: '#805600' },
    done: { accent: '#287343', surface: '#eff8f1', text: '#1e6135' },
    cancelled: { accent: '#995268', surface: '#fcf1f4', text: '#7d3e51' },
};
