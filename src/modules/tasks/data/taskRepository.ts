import type { Task, TaskInput } from '../../../lib/task';
import { taskInputSchema } from '../../../lib/task';
import {
    descendantIds,
    normalizeTaskRanges,
    subtaskInput,
    taskLevels,
} from '../../../lib/taskHierarchy';

const DATABASE_NAME = 'task-planner';
const STORE_NAME = 'tasks';
const METADATA_STORE_NAME = 'metadata';
const HIGH_WATER_KEY = 'versionHighWater';
type HighWaterRecord = { key: typeof HIGH_WATER_KEY; value: number };

export class TaskRepositoryError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (globalThis.indexedDB === undefined) {
            reject(
                new Error('Хранилище браузера недоступно. Разрешите хранение данных для сайта.'),
            );
            return;
        }
        const request = indexedDB.open(DATABASE_NAME, 4);
        let isBlocked = false;
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            const metadata = request.result.objectStoreNames.contains(METADATA_STORE_NAME)
                ? request.transaction!.objectStore(METADATA_STORE_NAME)
                : request.result.createObjectStore(METADATA_STORE_NAME, { keyPath: 'key' });
            const store = request.transaction!.objectStore(STORE_NAME);
            const all = store.getAll();
            all.onsuccess = () => {
                const oldTasks = all.result as (Omit<Task, 'status' | 'parent_id'> & {
                    status: Task['status'] | 'planned';
                    parent_id?: string | null;
                })[];
                const migrated: Task[] = oldTasks.map((old) => ({
                    ...old,
                    status: old.status === 'planned' ? 'new' : old.status,
                    parent_id: old.parent_id ?? null,
                }));
                const normalized = normalizeTaskRanges(migrated);
                readHighWater(metadata, (storedHighWater) => {
                    let highWater = Math.max(
                        storedHighWater,
                        ...migrated.map((task) => task.version),
                    );
                    normalized.tasks.forEach((task, index) => {
                        const before = oldTasks[index]!;
                        if (normalized.changedIds.has(task.id)) {
                            highWater = nextVersion(highWater);
                            task = {
                                ...task,
                                version: highWater,
                                updatedAt: nextUpdatedAt(task),
                            };
                        }
                        if (
                            normalized.changedIds.has(task.id) ||
                            before.status === 'planned' ||
                            before.parent_id === undefined
                        ) {
                            store.put(task);
                        }
                    });
                    writeHighWater(metadata, highWater);
                });
            };
        };
        request.onsuccess = () => {
            if (isBlocked) {
                request.result.close();
                return;
            }
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
            isBlocked = true;
            reject(new Error('Закройте другие вкладки планировщика и повторите.'));
        };
    });
}

async function transaction<T>(
    mode: IDBTransactionMode,
    run: (
        store: IDBObjectStore,
        resolve: (value: T) => void,
        reject: (error: Error) => void,
        metadata: IDBObjectStore,
    ) => void,
): Promise<T> {
    const database = await openDatabase();
    return new Promise<T>((resolve, reject) => {
        const tx = database.transaction([STORE_NAME, METADATA_STORE_NAME], mode);
        let result: T;
        let customError: Error | undefined;
        tx.oncomplete = () => {
            database.close();
            resolve(result);
        };
        tx.onerror = () => {
            database.close();
            reject(customError ?? tx.error ?? new Error('Не удалось сохранить данные'));
        };
        tx.onabort = () => {
            database.close();
            reject(customError ?? tx.error ?? new Error('Не удалось сохранить данные'));
        };
        run(
            tx.objectStore(STORE_NAME),
            (value) => {
                result = value;
            },
            (error) => {
                customError = error;
                tx.abort();
            },
            tx.objectStore(METADATA_STORE_NAME),
        );
    });
}

function conflict(message: string): TaskRepositoryError {
    return new TaskRepositoryError(message, 409);
}

function updated(): void {
    try {
        const channel = new BroadcastChannel('task-planner-tasks');
        channel.postMessage('updated');
        channel.close();
    } catch {
        /* Unsupported browser. */
    }
}

export function nextVersion(highWater: number, ...groups: Task[][]): number {
    const highestVersion = groups.reduce(
        (highest, tasks) => tasks.reduce((value, task) => Math.max(value, task.version), highest),
        highWater,
    );
    if (!Number.isSafeInteger(highestVersion) || highestVersion >= Number.MAX_SAFE_INTEGER - 1) {
        throw new Error('Не удалось назначить новую версию задачи.');
    }
    return highestVersion + 1;
}

export function nextUpdatedAt(current: Task, now = Date.now()): string {
    return new Date(
        Math.max(now, Date.parse(current.createdAt), Date.parse(current.updatedAt)),
    ).toISOString();
}

export function compareTasksByStart(a: Task, b: Task): number {
    return (
        Date.parse(a.start) - Date.parse(b.start) ||
        Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
}

export function prepareTaskReplacement(
    tasks: Task[],
    current: Task[],
    highWater: number,
): { tasks: Task[]; version: number } {
    // Backup versions are only meaningful in the browser that created them.
    const version = nextVersion(highWater, current);
    return { tasks: tasks.map((task) => ({ ...task, version })), version };
}

async function createWithSubtasks(task: TaskInput, titles: readonly string[]): Promise<Task[]> {
    const input = taskInputSchema.parse(task);
    const id = crypto.randomUUID();
    const children = titles.map((title) => subtaskInput(input, title, id));
    const now = new Date().toISOString();
    const created = await transaction<Task[]>('readwrite', (store, resolve, reject, metadata) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const current = request.result as Task[];
            readHighWater(metadata, (highWater) => {
                try {
                    const proposed: Task[] = [
                        { ...input, id, version: 0, createdAt: now, updatedAt: now },
                    ];
                    children.forEach((child) => {
                        proposed.push({
                            ...child,
                            id: crypto.randomUUID(),
                            version: 0,
                            createdAt: now,
                            updatedAt: now,
                        });
                    });
                    const normalized = normalizeTaskRanges([...current, ...proposed]);
                    const byId = new Map(normalized.tasks.map((record) => [record.id, record]));
                    let version = highWater;
                    const records: Task[] = [];
                    proposed.forEach((record) => {
                        version = nextVersion(version, current);
                        records.push({ ...byId.get(record.id)!, version });
                    });
                    normalized.tasks.forEach((record) => {
                        if (
                            proposed.some((item) => item.id === record.id) ||
                            !normalized.changedIds.has(record.id)
                        )
                            return;
                        const original = current.find((item) => item.id === record.id)!;
                        version = nextVersion(version);
                        records.push({
                            ...record,
                            version,
                            updatedAt: nextUpdatedAt(original),
                        });
                    });
                    records.forEach((record) => store.put(record));
                    writeHighWater(metadata, version);
                    resolve(records);
                } catch (error) {
                    reject(error as Error);
                }
            });
        };
    });
    updated();
    return created;
}

async function createSubtask(parentId: string, title: string): Promise<Task[]> {
    const created = await transaction<Task[]>('readwrite', (store, resolve, reject, metadata) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const current = request.result as Task[];
            const parent = current.find((task) => task.id === parentId);
            if (parent === undefined) {
                reject(new TaskRepositoryError('Родительская задача уже удалена', 404));
                return;
            }
            readHighWater(metadata, (highWater) => {
                try {
                    const now = new Date().toISOString();
                    const proposed: Task = {
                        ...subtaskInput(parent, title, parent.id),
                        id: crypto.randomUUID(),
                        version: 0,
                        createdAt: now,
                        updatedAt: now,
                    };
                    const normalized = normalizeTaskRanges([...current, proposed]);
                    let version = nextVersion(highWater, current);
                    const records: Task[] = [{ ...proposed, version }];
                    normalized.tasks.forEach((task) => {
                        if (task.id === proposed.id || !normalized.changedIds.has(task.id)) return;
                        const original = current.find((item) => item.id === task.id)!;
                        version = nextVersion(version);
                        records.push({
                            ...task,
                            version,
                            updatedAt: nextUpdatedAt(original),
                        });
                    });
                    records.forEach((record) => store.put(record));
                    writeHighWater(metadata, version);
                    resolve(records);
                } catch (error) {
                    reject(error as Error);
                }
            });
        };
    });
    updated();
    return created;
}

async function updateWithSubtasks(
    id: string,
    task: TaskInput,
    expectedVersion: number,
    titles: readonly string[],
): Promise<Task[]> {
    const input = taskInputSchema.parse(task);
    titles.forEach((title) => subtaskInput(input, title, id));
    const saved = await transaction<Task[]>('readwrite', (store, resolve, reject, metadata) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const current = request.result as Task[];
            const existing = current.find((item) => item.id === id);
            if (existing === undefined) {
                reject(new TaskRepositoryError('Задача уже удалена', 404));
                return;
            }
            if (existing.version !== expectedVersion) {
                reject(
                    conflict('Задача изменена в другой вкладке. Обновите её перед сохранением.'),
                );
                return;
            }
            if (existing.parent_id !== input.parent_id) {
                reject(new Error('Родительскую задачу нельзя изменить при редактировании.'));
                return;
            }
            readHighWater(metadata, (highWater) => {
                try {
                    const proposed = { ...existing, ...input };
                    const normalized = normalizeTaskRanges(
                        current.map((item) => (item.id === id ? proposed : item)),
                    );
                    const parent = normalized.tasks.find((item) => item.id === id)!;
                    let version = nextVersion(highWater, current);
                    const records: Task[] = [
                        {
                            ...parent,
                            version,
                            updatedAt: nextUpdatedAt(existing),
                        },
                    ];
                    titles.forEach((title) => {
                        version = nextVersion(version);
                        const now = new Date().toISOString();
                        records.push({
                            ...subtaskInput(parent, title, id),
                            id: crypto.randomUUID(),
                            version,
                            createdAt: now,
                            updatedAt: now,
                        });
                    });
                    normalized.tasks.forEach((item) => {
                        if (item.id === id || !normalized.changedIds.has(item.id)) return;
                        const original = current.find((task) => task.id === item.id)!;
                        version = nextVersion(version);
                        records.push({
                            ...item,
                            version,
                            updatedAt: nextUpdatedAt(original),
                        });
                    });
                    const savedIds = new Set(records.map((record) => record.id));
                    taskLevels([
                        ...normalized.tasks.filter((item) => !savedIds.has(item.id)),
                        ...records,
                    ]);
                    records.forEach((record) => store.put(record));
                    writeHighWater(metadata, version);
                    resolve(records);
                } catch (error) {
                    reject(error as Error);
                }
            });
        };
    });
    updated();
    return saved;
}

function readHighWater(metadata: IDBObjectStore, callback: (value: number) => void): void {
    const request = metadata.get(HIGH_WATER_KEY);
    request.onsuccess = () => callback((request.result as HighWaterRecord | undefined)?.value ?? 0);
}

function writeHighWater(metadata: IDBObjectStore, value: number): void {
    metadata.put({ key: HIGH_WATER_KEY, value } satisfies HighWaterRecord);
}

export const taskRepository = {
    list: (_signal: AbortSignal | undefined = undefined) =>
        transaction<Task[]>('readonly', (store, resolve) => {
            const request = store.getAll();
            request.onsuccess = () => resolve((request.result as Task[]).sort(compareTasksByStart));
        }),
    create: async (task: TaskInput) => (await createWithSubtasks(task, []))[0]!,
    createWithSubtasks,
    createSubtask,
    update: async (id: string, task: TaskInput, version: number) =>
        (await updateWithSubtasks(id, task, version, []))[0]!,
    updateWithSubtasks,
    remove: async (id: string, version: number) => {
        const removed = await transaction<string[]>('readwrite', (store, resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const tasks = request.result as Task[];
                const current = tasks.find((task) => task.id === id);
                if (current === undefined) {
                    reject(new TaskRepositoryError('Задача уже удалена', 404));
                    return;
                }
                if (current.version !== version) {
                    reject(
                        conflict(
                            'Задача изменена в другой вкладке. Обновите данные перед удалением.',
                        ),
                    );
                    return;
                }
                const ids = [...descendantIds(tasks, id)];
                ids.forEach((taskId) => store.delete(taskId));
                resolve(ids);
            };
        });
        updated();
        return removed;
    },
    replace: async (tasks: Task[]) => {
        taskLevels(tasks);
        const restored = await transaction<Task[]>(
            'readwrite',
            (store, resolve, reject, metadata) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const current = request.result as Task[];
                    readHighWater(metadata, (highWater) => {
                        let replacement: ReturnType<typeof prepareTaskReplacement>;
                        try {
                            replacement = prepareTaskReplacement(tasks, current, highWater);
                        } catch (error) {
                            reject(error as Error);
                            return;
                        }
                        store.clear();
                        replacement.tasks.forEach((task) => store.add(task));
                        writeHighWater(metadata, replacement.version);
                        resolve([...replacement.tasks].sort(compareTasksByStart));
                    });
                };
            },
        );
        updated();
        return restored;
    },
};
