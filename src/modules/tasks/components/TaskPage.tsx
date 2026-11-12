import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import {
    HOUR,
    PRIORITIES,
    PRIORITY_LABELS,
    STATUSES,
    STATUS_LABELS,
    taskInputSchema,
    type Priority,
    type Status,
    type Task,
    type TaskInput,
} from '../../../lib/task';
import { descendantIds, MAX_TASK_LEVEL, taskLevels } from '../../../lib/taskHierarchy';
import { assertFormTimeZone, localInput, nextHour, systemTimeZone } from '../../../lib/time';
import { Select } from '../../../components/ui/Select';
import { TaskRepositoryError } from '../data/taskRepository';
import type { useTasks } from '../hooks/useTasks';
import { resolveDateField } from '../model/formValidation';
import { AutosaveCoordinator } from '../model/autosave';
import { DeleteTaskDialog } from './DeleteTaskDialog';

type Draft = {
    title: string;
    description: string;
    start: string;
    end: string;
    status: Status;
    priority: Priority;
    isUrgent: boolean;
};
type SaveState = 'draft' | 'unsaved' | 'saving' | 'saved' | 'invalid' | 'error' | 'conflict';

const statusOptions = STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
const priorityOptions = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));

function emptyDraft(): Draft {
    const start = nextHour();
    return {
        title: '',
        description: '',
        start: localInput(start),
        end: localInput(new Date(start.getTime() + 2 * HOUR)),
        status: 'new',
        priority: 'normal',
        isUrgent: false,
    };
}

function draftFromTask(task: Task): Draft {
    return {
        title: task.title,
        description: task.description,
        start: localInput(new Date(task.start)),
        end: localInput(new Date(task.end)),
        status: task.status,
        priority: task.priority,
        isUrgent: task.isUrgent,
    };
}

function draftInput(draft: Draft, task: Task | null, zone: string): TaskInput {
    assertFormTimeZone(zone);
    return taskInputSchema.parse({
        title: draft.title,
        description: draft.description,
        start: resolveDateField(draft.start, task?.start, 'start'),
        end: resolveDateField(draft.end, task?.end, 'end'),
        status: draft.status,
        priority: draft.priority,
        isUrgent: draft.isUrgent,
        parent_id: task?.parent_id ?? null,
    });
}

export function TaskPage({
    registerImportGuard,
    taskStore,
}: {
    registerImportGuard: (guard: () => Promise<boolean>) => () => void;
    taskStore: Pick<
        ReturnType<typeof useTasks>,
        | 'query'
        | 'tasks'
        | 'isPending'
        | 'createTask'
        | 'createSubtask'
        | 'updateTask'
        | 'removeTask'
        | 'reloadTasks'
    >;
}) {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const {
        query,
        tasks,
        isPending,
        createTask,
        createSubtask,
        updateTask,
        removeTask,
        reloadTasks,
    } = taskStore;
    const stored = taskId === 'new' ? null : (tasks.find((item) => item.id === taskId) ?? null);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const draftRef = useRef(draft);
    const [record, setRecord] = useState<Task | null>(null);
    const recordRef = useRef<Task | null>(null);
    const previousRouteId = useRef(taskId);
    const [state, setState] = useState<SaveState>('draft');
    const [error, setError] = useState<string | null>(null);
    const revisionRef = useRef(0);
    const dirtyRef = useRef(false);
    const flightRef = useRef<Promise<boolean> | null>(null);
    const autosaveRef = useRef<AutosaveCoordinator | null>(null);
    const [childTitle, setChildTitle] = useState('');
    const childTitleRef = useRef('');
    const childAddLockRef = useRef(false);
    const [isAddingChild, setIsAddingChild] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const deleteLockRef = useRef(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const deleteButtonRef = useRef<HTMLButtonElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [isTitleEditing, setIsTitleEditing] = useState(taskId === 'new');
    const [zone] = useState(systemTimeZone);

    useEffect(() => {
        if (previousRouteId.current === taskId) return;
        const previousId = previousRouteId.current;
        previousRouteId.current = taskId;
        if (previousId === 'new' && recordRef.current?.id === taskId) return;
        setIsDeleteDialogOpen(false);
        setDeleteError(null);
        setIsTitleEditing(taskId === 'new');
        childTitleRef.current = '';
        setChildTitle('');
        if (taskId !== 'new') return;
        const empty = emptyDraft();
        recordRef.current = null;
        setRecord(null);
        draftRef.current = empty;
        setDraft(empty);
        dirtyRef.current = false;
        setState('draft');
        setError(null);
    }, [taskId]);

    useEffect(() => {
        if (taskId === 'new' || query.isLoading) return;
        if (stored === null) {
            if (
                dirtyRef.current ||
                flightRef.current !== null ||
                childTitleRef.current.trim() !== ''
            ) {
                setState('conflict');
                setError('Задача удалена или заменена резервной копией. Черновик не сохранён.');
            } else if (!isDeleting) {
                recordRef.current = null;
                setRecord(null);
            }
            return;
        }
        if (isDeleting) return;
        const acknowledged = recordRef.current;
        if (acknowledged !== null && acknowledged.id === taskId) {
            if (
                !dirtyRef.current &&
                flightRef.current === null &&
                stored.version > acknowledged.version
            ) {
                recordRef.current = stored;
                setRecord(stored);
                const refreshed = draftFromTask(stored);
                draftRef.current = refreshed;
                setDraft(refreshed);
                setState('saved');
            }
            return;
        }
        recordRef.current = stored;
        setRecord(stored);
        const initial = draftFromTask(stored);
        draftRef.current = initial;
        setDraft(initial);
        dirtyRef.current = false;
        setState('saved');
        setError(null);
        setChildTitle('');
    }, [taskId, query.isLoading, stored, isDeleting]);

    function changeDraft<K extends keyof Draft>(field: K, value: Draft[K]) {
        if (state === 'saving' || state === 'conflict' || isPending || isAddingChild || isDeleting)
            return;
        const next = { ...draftRef.current, [field]: value };
        draftRef.current = next;
        setDraft(next);
        dirtyRef.current = true;
        revisionRef.current += 1;
        autosaveRef.current?.changed();
        setState('unsaved');
        setError(null);
    }

    async function flush(): Promise<boolean> {
        if (flightRef.current !== null) {
            const succeeded = await flightRef.current;
            return succeeded && (dirtyRef.current ? flush() : true);
        }
        if (!dirtyRef.current) return true;

        let input: TaskInput;
        try {
            input = draftInput(draftRef.current, recordRef.current, zone);
        } catch (issue) {
            setState('invalid');
            setError(issue instanceof Error ? issue.message : 'Проверьте данные задачи.');
            return false;
        }

        const savedRevision = revisionRef.current;
        const before = recordRef.current;
        const job = (async () => {
            setState('saving');
            setError(null);
            try {
                const saved =
                    before === null
                        ? await createTask(input)
                        : await updateTask(before.id, input, before.version);
                const actual = saved.find((item) => item.id === before?.id) ?? saved[0];
                if (actual === undefined)
                    throw new Error('Не удалось получить сохранённую задачу.');
                recordRef.current = actual;
                setRecord(actual);
                if (before === null && blockerRef.current.state !== 'blocked') {
                    navigate(`/tasks/${actual.id}`, { replace: true });
                }
                if (savedRevision === revisionRef.current) {
                    const normalized = draftFromTask(actual);
                    draftRef.current = normalized;
                    setDraft(normalized);
                    dirtyRef.current = false;
                    setState('saved');
                } else {
                    setState('unsaved');
                }
                return true;
            } catch (issue) {
                setState(
                    issue instanceof TaskRepositoryError && issue.status === 409
                        ? 'conflict'
                        : 'error',
                );
                setError(issue instanceof Error ? issue.message : 'Не удалось сохранить задачу.');
                return false;
            }
        })();
        flightRef.current = job;
        const succeeded = await job;
        flightRef.current = null;
        return succeeded && (dirtyRef.current ? flush() : true);
    }

    const flushRef = useRef(flush);
    flushRef.current = flush;
    if (autosaveRef.current === null) {
        autosaveRef.current = new AutosaveCoordinator(() => flushRef.current());
    }
    useEffect(() => {
        return () => autosaveRef.current?.dispose();
    }, []);
    useEffect(
        () =>
            registerImportGuard(() =>
                childTitleRef.current.trim() === ''
                    ? autosaveRef.current!.flush()
                    : Promise.resolve(false),
            ),
        [registerImportGuard],
    );

    const blocker = useBlocker(({ currentLocation, nextLocation }) => {
        if (currentLocation.pathname === nextLocation.pathname) return false;
        if (
            currentLocation.pathname === '/tasks/new' &&
            recordRef.current !== null &&
            nextLocation.pathname === `/tasks/${recordRef.current.id}`
        )
            return false;
        return (
            dirtyRef.current ||
            flightRef.current !== null ||
            childTitleRef.current.trim() !== '' ||
            deleteLockRef.current
        );
    });
    const blockerRef = useRef(blocker);
    blockerRef.current = blocker;
    function completeBlockedNavigation() {
        const pending = blockerRef.current;
        if (pending.state !== 'blocked') return;
        if (taskId === 'new' && recordRef.current !== null) {
            const destination = pending.location;
            pending.reset();
            navigate(`/tasks/${recordRef.current.id}`, { replace: true });
            window.setTimeout(
                () =>
                    navigate({
                        pathname: destination.pathname,
                        search: destination.search,
                        hash: destination.hash,
                    }),
                0,
            );
            return;
        }
        pending.proceed();
    }
    useEffect(() => {
        if (blockerRef.current.state !== 'blocked' || deleteLockRef.current) return;
        void autosaveRef.current!.flush().then((succeeded) => {
            if (
                succeeded &&
                childTitleRef.current.trim() === '' &&
                blockerRef.current.state === 'blocked'
            ) {
                completeBlockedNavigation();
            }
        });
    }, [blocker.state]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (
                !dirtyRef.current &&
                flightRef.current === null &&
                childTitleRef.current.trim() === '' &&
                !deleteLockRef.current
            )
                return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, []);

    const ready = taskId === 'new' ? recordRef.current === null : recordRef.current?.id === taskId;
    const taskMissing =
        taskId !== 'new' && !query.isLoading && query.data !== undefined && stored === null;
    if (taskId !== 'new' && query.isLoading && !ready)
        return <div className="empty-state">Загружаем задачу…</div>;
    if (taskId !== 'new' && query.isError && query.data === undefined)
        return (
            <div className="empty-state" role="alert">
                Не удалось загрузить задачу: {query.error.message}
            </div>
        );
    if (!ready && taskId !== 'new' && stored === null) {
        return (
            <div className="empty-state">
                <h2>Задача не найдена</h2>
                <p>Возможно, она была удалена в другой вкладке.</p>
                <Link to="/list">Вернуться к списку</Link>
            </div>
        );
    }
    if (!ready && taskId !== 'new') return <div className="empty-state">Загружаем задачу…</div>;

    const current = record?.id === taskId ? record : null;
    const isFormLocked =
        state === 'saving' || state === 'conflict' || isPending || isAddingChild || isDeleting;
    const children = current === null ? [] : tasks.filter((item) => item.parent_id === current.id);
    const levels = taskLevels(tasks);
    const level = current === null ? 1 : (levels.get(current.id) ?? 1);
    const parents: Task[] = [];
    if (current !== null) {
        const byId = new Map(tasks.map((item) => [item.id, item]));
        let parentId = current.parent_id;
        while (parentId !== null) {
            const parent = byId.get(parentId);
            if (parent === undefined) break;
            parents.unshift(parent);
            parentId = parent.parent_id;
        }
    }

    async function addChild() {
        if (childAddLockRef.current) return;
        const title = childTitle.trim();
        if (title === '') return;
        childAddLockRef.current = true;
        setIsAddingChild(true);
        try {
            if (!(await autosaveRef.current!.flush())) return;
            const parent = recordRef.current;
            if (parent === null) {
                setError('Сначала укажите название и сроки родительской задачи.');
                return;
            }
            await createSubtask(parent.id, title);
            childTitleRef.current = '';
            setChildTitle('');
        } catch (issue) {
            setError(issue instanceof Error ? issue.message : 'Не удалось добавить подзадачу.');
        } finally {
            childAddLockRef.current = false;
            setIsAddingChild(false);
        }
    }

    async function reloadCurrent() {
        try {
            const latest = await reloadTasks();
            const actual = latest.find((item) => item.id === recordRef.current?.id);
            if (actual === undefined) {
                setError('Задача уже удалена.');
                return;
            }
            recordRef.current = actual;
            setRecord(actual);
            const refreshed = draftFromTask(actual);
            draftRef.current = refreshed;
            setDraft(refreshed);
            dirtyRef.current = false;
            setState('saved');
            setError(null);
        } catch (issue) {
            setError(issue instanceof Error ? issue.message : 'Не удалось загрузить задачу.');
        }
    }

    async function deleteCurrent() {
        if (deleteLockRef.current) return;
        deleteLockRef.current = true;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await autosaveRef.current!.discardAfterCurrent();
            if (flightRef.current !== null) await flightRef.current;
            const actual = recordRef.current;
            if (actual === null) throw new Error('Задача уже удалена.');
            await removeTask(actual);
            dirtyRef.current = false;
            childTitleRef.current = '';
            if (blockerRef.current.state === 'blocked') blockerRef.current.reset();
            deleteLockRef.current = false;
            navigate('/list', { replace: true });
        } catch (issue) {
            setDeleteError(issue instanceof Error ? issue.message : 'Не удалось удалить задачу.');
            if (dirtyRef.current) autosaveRef.current!.changed();
            if (blockerRef.current.state === 'blocked') blockerRef.current.reset();
        } finally {
            deleteLockRef.current = false;
            setIsDeleting(false);
        }
    }

    return (
        <section className="task-page">
            <div className="task-page-heading">
                <div className="task-page-heading-main">
                    {parents.length > 0 && (
                        <nav className="task-breadcrumbs" aria-label="Родительские задачи">
                            {parents.map((parent, index) => (
                                <span key={parent.id}>
                                    {index > 0 && ' › '}
                                    <Link to={`/tasks/${parent.id}`}>{parent.title}</Link>
                                </span>
                            ))}
                        </nav>
                    )}
                    <div className="task-page-title">
                        <h2>
                            {isTitleEditing ? (
                                <input
                                    ref={titleInputRef}
                                    name="title"
                                    aria-label="Название задачи"
                                    autoFocus
                                    value={draft.title}
                                    maxLength={200}
                                    placeholder="Название задачи"
                                    readOnly={isFormLocked}
                                    onChange={(event) => changeDraft('title', event.target.value)}
                                    onBlur={() => setIsTitleEditing(false)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            titleInputRef.current?.blur();
                                        }
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="task-page-title-button"
                                    title="Изменить название"
                                    disabled={
                                        state === 'saving' ||
                                        isPending ||
                                        isAddingChild ||
                                        isDeleting
                                    }
                                    onClick={() => setIsTitleEditing(true)}
                                >
                                    {draft.title.trim() || 'Название задачи'}
                                </button>
                            )}
                        </h2>
                    </div>
                </div>
                {current !== null && (
                    <button
                        ref={deleteButtonRef}
                        className="delete-button"
                        type="button"
                        disabled={isFormLocked}
                        onClick={() => {
                            setDeleteError(null);
                            setIsDeleteDialogOpen(true);
                        }}
                    >
                        Удалить задачу
                    </button>
                )}
            </div>
            <form
                className="task-page-form"
                onSubmit={(event: FormEvent) => event.preventDefault()}
                noValidate
            >
                <div className="form-grid">
                    <label>
                        Начало
                        <input
                            name="start"
                            type="datetime-local"
                            step={3600}
                            value={draft.start}
                            disabled={isFormLocked}
                            onChange={(event) => changeDraft('start', event.target.value)}
                        />
                    </label>
                    <label>
                        Конец
                        <input
                            name="end"
                            type="datetime-local"
                            step={3600}
                            value={draft.end}
                            disabled={isFormLocked}
                            onChange={(event) => changeDraft('end', event.target.value)}
                        />
                    </label>
                </div>
                <p className="field-note">{zone} · шаг 1 час · минимум 1 час</p>
                <label>
                    Приоритет
                    <Select
                        label="Приоритет"
                        options={priorityOptions}
                        value={draft.priority}
                        isDisabled={isFormLocked}
                        onChange={(value) => changeDraft('priority', value)}
                    />
                </label>
                <label className="checkbox">
                    <input
                        type="checkbox"
                        checked={draft.isUrgent}
                        disabled={isFormLocked}
                        onChange={(event) => changeDraft('isUrgent', event.target.checked)}
                    />
                    Срочная задача
                </label>
                <label>
                    Статус
                    <Select
                        label="Статус"
                        options={statusOptions}
                        value={draft.status}
                        isDisabled={isFormLocked}
                        onChange={(value) => changeDraft('status', value)}
                    />
                </label>
                <label>
                    Описание
                    <textarea
                        name="description"
                        value={draft.description}
                        maxLength={10_000}
                        rows={3}
                        readOnly={isFormLocked}
                        onChange={(event) => changeDraft('description', event.target.value)}
                    />
                </label>
            </form>
            {error !== null && (
                <p role="alert" className="form-error">
                    {error}
                </p>
            )}
            {taskMissing &&
                (dirtyRef.current ||
                    flightRef.current !== null ||
                    childTitleRef.current.trim() !== '') && (
                    <div className="form-error" role="alert">
                        <p>
                            Задача удалена или заменена резервной копией. Черновик не сохранён; поля
                            оставлены доступными для просмотра и копирования.
                        </p>
                        <button
                            className="ghost-button"
                            type="button"
                            disabled={flightRef.current !== null}
                            onClick={() => {
                                if (flightRef.current !== null || !autosaveRef.current!.discard())
                                    return;
                                dirtyRef.current = false;
                                childTitleRef.current = '';
                                setChildTitle('');
                                if (blocker.state === 'blocked') blocker.reset();
                                navigate('/list', { replace: true });
                            }}
                        >
                            Убрать черновик и вернуться к списку
                        </button>
                    </div>
                )}
            {(state === 'error' || state === 'invalid') && (
                <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void autosaveRef.current!.flush()}
                >
                    Повторить сохранение
                </button>
            )}
            {state === 'conflict' && !taskMissing && (
                <button className="ghost-button" type="button" onClick={() => void reloadCurrent()}>
                    Загрузить актуальную задачу и отменить мои изменения
                </button>
            )}
            <section className="subtask-section" aria-labelledby="subtasks-title">
                <h3 id="subtasks-title">Подзадачи</h3>
                {children.length > 0 && (
                    <ul className="subtask-list">
                        {children.map((child) => (
                            <li key={child.id}>
                                <label className="checkbox">
                                    <input
                                        type="checkbox"
                                        aria-label={`Отметить подзадачу «${child.title}» ${child.status === 'done' ? 'незавершённой' : 'завершённой'}`}
                                        checked={child.status === 'done'}
                                        disabled={isPending}
                                        onChange={() =>
                                            void updateTask(
                                                child.id,
                                                {
                                                    status:
                                                        child.status === 'done' ? 'new' : 'done',
                                                },
                                                child.version,
                                            ).catch((issue) =>
                                                setError(
                                                    issue instanceof Error
                                                        ? issue.message
                                                        : 'Не удалось обновить подзадачу.',
                                                ),
                                            )
                                        }
                                    />
                                </label>
                                <Link className="subtask-link" to={`/tasks/${child.id}`}>
                                    {child.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                {level < MAX_TASK_LEVEL && (
                    <div className="subtask-add">
                        <input
                            aria-label="Название подзадачи"
                            placeholder="Новая подзадача"
                            maxLength={200}
                            value={childTitle}
                            readOnly={isFormLocked}
                            disabled={isAddingChild || isPending || isDeleting}
                            onChange={(event) => {
                                childTitleRef.current = event.target.value;
                                setChildTitle(event.target.value);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void addChild();
                                }
                            }}
                        />
                        <button
                            type="button"
                            className="ghost-button"
                            disabled={isAddingChild || isFormLocked || childTitle.trim() === ''}
                            onClick={() => void addChild()}
                        >
                            {isAddingChild ? 'Добавляем…' : 'Добавить'}
                        </button>
                    </div>
                )}
            </section>
            {isDeleteDialogOpen && current !== null && (
                <DeleteTaskDialog
                    title={draft.title.trim() || current.title}
                    descendantCount={descendantIds(tasks, current.id).size - 1}
                    isDeleting={isDeleting}
                    error={deleteError}
                    returnFocus={deleteButtonRef.current}
                    onClose={() => {
                        setIsDeleteDialogOpen(false);
                        setDeleteError(null);
                    }}
                    onConfirm={() => void deleteCurrent()}
                />
            )}
            {blocker.state === 'blocked' && (
                <div
                    className="task-leave-warning"
                    role="alertdialog"
                    aria-label="Несохранённые изменения"
                >
                    <p>
                        Изменения ещё не сохранены. Исправьте данные или повторите сохранение перед
                        переходом.
                    </p>
                    <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                            void autosaveRef.current!.flush().then((saved) => {
                                if (
                                    saved &&
                                    childTitleRef.current.trim() === '' &&
                                    blockerRef.current.state === 'blocked'
                                ) {
                                    completeBlockedNavigation();
                                }
                            })
                        }
                    >
                        Сохранить и перейти
                    </button>
                    <button type="button" className="ghost-button" onClick={() => blocker.reset()}>
                        Остаться
                    </button>
                    <button
                        type="button"
                        className="danger-button"
                        disabled={flightRef.current !== null}
                        onClick={() => {
                            if (flightRef.current !== null || !autosaveRef.current!.discard())
                                return;
                            dirtyRef.current = false;
                            childTitleRef.current = '';
                            setChildTitle('');
                            blocker.proceed();
                        }}
                    >
                        Выйти без сохранения
                    </button>
                </div>
            )}
        </section>
    );
}
