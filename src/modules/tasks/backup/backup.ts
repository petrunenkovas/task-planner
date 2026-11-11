import { z } from 'zod';
import { taskInputSchema, type Task } from '../../../lib/task';
import { normalizeTaskRanges, taskLevels } from '../../../lib/taskHierarchy';
import { taskRepository } from '../data/taskRepository';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_TASKS = 20_000;
const instant = z.string().datetime({ offset: true });
const taskSchema = taskInputSchema
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
const legacyTaskSchema = z.object(legacyTaskShape).strict();
const backupSchema = z
    .object({
        format: z.literal('task-planner-backup'),
        version: z.literal(2),
        tasks: z.array(taskSchema).max(MAX_BACKUP_TASKS),
    })
    .strict();
const legacyBackupSchema = z
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
    const text = JSON.stringify({ format: 'task-planner-backup', version: 2, tasks }, null, 2);
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
        throw new Error('Резервная копия превышает 10 МБ. Уменьшите число или объём задач.');
    }
    taskLevels(tasks);
    return text;
}

export async function createCurrentBackup(): Promise<string> {
    return createBackup(await taskRepository.list());
}

export function parseBackup(text: string): Task[] {
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
        throw new Error('Файл резервной копии слишком большой (максимум 10 МБ).');
    }
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('Файл не содержит корректный JSON.');
    }
    if (
        typeof data === 'object' &&
        data !== null &&
        'tasks' in data &&
        Array.isArray(data.tasks) &&
        data.tasks.some(
            (task) => typeof task === 'object' && task !== null && task.status === 'planned',
        )
    ) {
        throw new Error(
            'Резервная копия содержит старый статус planned и не может быть импортирована.',
        );
    }
    const result = backupSchema.safeParse(data);
    const legacy = result.success ? null : legacyBackupSchema.safeParse(data);
    if (!result.success && (legacy === null || !legacy.success)) {
        throw new Error(
            `Некорректная резервная копия: ${result.error.issues[0]?.message ?? 'проверьте формат'}`,
        );
    }
    const tasks: Task[] = result.success
        ? result.data.tasks
        : legacy && legacy.success
          ? legacy.data.tasks.map((task) => {
                const parsed = taskSchema.safeParse({ ...task, parent_id: null });
                if (!parsed.success) {
                    throw new Error(
                        `Некорректная резервная копия: ${parsed.error.issues[0]?.message ?? 'проверьте формат'}`,
                    );
                }
                return parsed.data;
            })
          : [];
    const seen = new Set<string>();
    tasks.forEach((task) => {
        if (seen.has(task.id)) {
            throw new Error(`В резервной копии повторяется ID задачи ${task.id}.`);
        }
        seen.add(task.id);
    });
    taskLevels(tasks);
    return normalizeTaskRanges(tasks).tasks;
}
