import type { Task } from '../../../lib/task';
import { normalizeTaskRanges, taskLevels } from '../../../lib/taskHierarchy';
import { taskRepository } from '../data/taskRepository';
import {
    backupSchema,
    createBackup,
    legacyBackupSchema,
    MAX_BACKUP_BYTES,
    taskSchema,
} from './backupFormat';

export { createBackup, MAX_BACKUP_BYTES, MAX_BACKUP_TASKS } from './backupFormat';

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
    const normalized = normalizeTaskRanges(tasks).tasks;
    // An accepted file must remain exportable after restoration. Compact JSON
    // can fit under the input limit while our readable export exceeds it.
    createBackup(normalized);
    return normalized;
}
