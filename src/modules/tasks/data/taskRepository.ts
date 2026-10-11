import type { Task, TaskInput } from '../../../lib/task';
import { taskInputSchema } from '../../../lib/task';

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
        const request = indexedDB.open(DATABASE_NAME, 2);
        let isBlocked = false;
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!request.result.objectStoreNames.contains(METADATA_STORE_NAME)) {
                const metadata = request.result.createObjectStore(METADATA_STORE_NAME, {
                    keyPath: 'key',
                });
                const tasks = request.transaction!.objectStore(STORE_NAME).getAll();
                tasks.onsuccess = () => {
                    const highWater = (tasks.result as Task[]).reduce(
                        (max, task) => Math.max(max, task.version),
                        0,
                    );
                    metadata.put({
                        key: HIGH_WATER_KEY,
                        value: highWater,
                    } satisfies HighWaterRecord);
                };
            }
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
    create: async (task: TaskInput) => {
        const input = taskInputSchema.parse(task);
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const created = await transaction<Task>('readwrite', (store, resolve, reject, metadata) => {
            readHighWater(metadata, (highWater) => {
                let version: number;
                try {
                    version = nextVersion(highWater);
                } catch (error) {
                    reject(error as Error);
                    return;
                }
                const task: Task = { ...input, id, version, createdAt: now, updatedAt: now };
                store.add(task);
                writeHighWater(metadata, version);
                resolve(task);
            });
        });
        updated();
        return created;
    },
    update: async (id: string, task: TaskInput, version: number) => {
        const input = taskInputSchema.parse(task);
        const saved = await transaction<Task>('readwrite', (store, resolve, reject, metadata) => {
            const request = store.get(id);
            request.onsuccess = () => {
                const current = request.result as Task | undefined;
                if (current === undefined) {
                    reject(new TaskRepositoryError('Задача уже удалена', 404));
                    return;
                }
                if (current.version !== version) {
                    reject(
                        conflict(
                            'Задача изменена в другой вкладке. Обновите её перед сохранением.',
                        ),
                    );
                    return;
                }
                readHighWater(metadata, (highWater) => {
                    let newVersion: number;
                    try {
                        newVersion = nextVersion(highWater, [current]);
                    } catch (error) {
                        reject(error as Error);
                        return;
                    }
                    const next = {
                        ...current,
                        ...input,
                        version: newVersion,
                        updatedAt: nextUpdatedAt(current),
                    };
                    store.put(next);
                    writeHighWater(metadata, newVersion);
                    resolve(next);
                });
            };
        });
        updated();
        return saved;
    },
    remove: async (id: string, version: number) => {
        await transaction<void>('readwrite', (store, resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => {
                const current = request.result as Task | undefined;
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
                store.delete(id).onsuccess = () => resolve(undefined);
            };
        });
        updated();
    },
    replace: async (tasks: Task[]) => {
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
