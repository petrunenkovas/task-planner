import { z } from 'zod';
import { taskInputSchema, type Task } from '../../../lib/task';
import { taskLevels } from '../../../lib/taskHierarchy';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_TASKS = 20_000;
const instant = z.string().datetime({ offset: true });
export const taskSchema = taskInputSchema
    .safeExtend({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        createdAt: instant,
        updatedAt: instant,
    })
    .strict()
    .superRefine((task, context) => {
        if (Date.parse(task.createdAt) > Date.parse(task.updatedAt)) {
            context.addIssue({
                code: 'custom',
                path: ['updatedAt'],
                message: 'Дата изменения раньше создания',
            });
        }
    });
const { parent_id: _parentId, ...legacyTaskShape } = taskSchema.shape;
export const legacyTaskSchema = z.object(legacyTaskShape).strict();
export const backupSchema = z
    .object({
        format: z.literal('task-planner-backup'),
        version: z.literal(2),
        tasks: z.array(taskSchema).max(MAX_BACKUP_TASKS),
    })
    .strict();
export const legacyBackupSchema = z
    .object({
        format: z.literal('task-planner-backup'),
        version: z.literal(1),
        tasks: z.array(legacyTaskSchema).max(MAX_BACKUP_TASKS),
    })
    .strict();

export function createBackup(tasks: Task[]): string {
    if (tasks.length > MAX_BACKUP_TASKS) {
        throw new Error(`Слишком много задач для резервной копии (максимум ${MAX_BACKUP_TASKS}).`);
    }
    const parsed = backupSchema.safeParse({ format: 'task-planner-backup', version: 2, tasks });
    if (!parsed.success) {
        throw new Error(
            `Не удалось создать резервную копию: ${parsed.error.issues[0]?.message ?? 'проверьте задачи'}`,
        );
    }
    const text = JSON.stringify(parsed.data, null, 2);
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
        throw new Error('Резервная копия превышает 10 МБ. Уменьшите число или объём задач.');
    }
    taskLevels(parsed.data.tasks);
    return text;
}
