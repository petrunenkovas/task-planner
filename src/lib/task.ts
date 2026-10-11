import { z } from 'zod';

export const HOUR = 3_600_000;
export const STATUSES = ['planned', 'in_progress', 'done', 'cancelled'] as const;
export const PRIORITIES = ['low', 'normal', 'high'] as const;
export const STATUS_LABELS: Record<Status, string> = {
    planned: 'Запланирована',
    in_progress: 'В работе',
    done: 'Завершена',
    cancelled: 'Отменена',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
    low: 'Низкий',
    normal: 'Обычный',
    high: 'Высокий',
};

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
const instant = z.string().datetime({ offset: true });
export const taskInputSchema = z
    .object({
        title: z
            .string()
            .trim()
            .min(1, 'Введите название')
            .max(200, 'Название: максимум 200 символов'),
        description: z.string().max(10000, 'Описание: максимум 10 000 символов').default(''),
        start: instant,
        end: instant,
        status: z.enum(STATUSES),
        priority: z.enum(PRIORITIES),
        isUrgent: z.boolean(),
    })
    .strict()
    .superRefine((value, ctx) => {
        const start = Date.parse(value.start);
        const end = Date.parse(value.end);

        if (end - start < HOUR) {
            ctx.addIssue({
                code: 'custom',
                path: ['end'],
                message: 'Минимальная длительность — один час',
            });
        }

        if ((end - start) % HOUR !== 0) {
            ctx.addIssue({
                code: 'custom',
                path: ['start'],
                message: 'Длительность должна быть кратна одному часу',
            });
        }
    });

export type TaskInput = z.infer<typeof taskInputSchema>;
export type Task = TaskInput & {
    id: string;
    version: number;
    createdAt: string;
    updatedAt: string;
};
