import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { type Task, type TaskInput } from './lib/task';
import {
    EMPTY_FILTERS,
    matchesFilters,
    taskFiltersFromSearch,
    taskFiltersToSearch,
    type Filters,
} from './lib/taskFilters';
import {
    matchPath,
    Navigate,
    NavLink,
    Route,
    Routes,
    useLocation,
    useSearchParams,
} from 'react-router';
import { WORKSPACE_ROUTES, type WorkspaceView } from './routes';
import { TaskRepositoryError } from './modules/tasks/data/taskRepository';
import { TaskFilters } from './modules/tasks/components/TaskFilters';
import { FieldChooser, type FieldOption } from './components/ui/FieldChooser';
import { KanbanBoard } from './modules/board/components/KanbanBoard';
import { TaskList } from './modules/tasks/components/TaskList';
import { BackupControls } from './modules/tasks/backup/BackupControls';
import { TimelineToolbar } from './modules/gantt/components/TimelineToolbar';
import { useTasks } from './modules/tasks/hooks/useTasks';
import { TaskForm } from './modules/tasks/components/TaskForm';
import { systemTimeZone } from './lib/time';
import { readPreferences, writePreferences, validatePreferences } from './preferences';
import {
    BOARD_FIELD_IDS,
    BOARD_FIELD_LABELS,
    TASK_COLUMN_IDS,
    TASK_COLUMN_LABELS,
    type BoardFieldId,
    type TaskColumnId,
} from './lib/taskFields';
import type { ScaleMode } from './modules/gantt/model/timeline';
import type { GanttViewHandle } from './modules/gantt/components/GanttView';
import { nextTaskSort, sortTasks, visibleTaskSort, type TaskSort } from './lib/taskSort';

const columnOptions: FieldOption<TaskColumnId>[] = TASK_COLUMN_IDS.map((id) => ({
    id,
    label: TASK_COLUMN_LABELS[id],
    isRequired: id === 'title',
}));
const boardOptions: FieldOption<BoardFieldId>[] = BOARD_FIELD_IDS.map((id) => ({
    id,
    label: BOARD_FIELD_LABELS[id],
}));

const GanttView = lazy(() =>
    import('./modules/gantt/components/GanttView').then((module) => ({
        default: module.GanttView,
    })),
);

export function App() {
    const {
        query,
        tasks,
        isPending,
        isReloading,
        noticeKind,
        message,
        setMessage,
        updateTask,
        createTask,
        removeTask,
        reloadTasks,
        replaceTasks,
    } = useTasks();

    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const filters = useMemo(() => taskFiltersFromSearch(searchParams.toString()), [searchParams]);
    const view =
        WORKSPACE_ROUTES.find((route) =>
            matchPath({ path: route.path, end: true }, location.pathname),
        )?.view ?? 'list';
    const [preferences] = useState(() => {
        try {
            return readPreferences(window.localStorage);
        } catch {
            return validatePreferences(null);
        }
    });
    const [mode, setMode] = useState<ScaleMode>(preferences.mode);
    const [ganttColumns, setGanttColumns] = useState<TaskColumnId[]>(preferences.ganttColumns);
    const [listColumns, setListColumns] = useState<TaskColumnId[]>(preferences.listColumns);
    const [boardFields, setBoardFields] = useState<BoardFieldId[]>(preferences.boardFields);
    const [listSort, setListSort] = useState<TaskSort | null>(null);
    const [ganttSort, setGanttSort] = useState<TaskSort | null>(null);
    const ganttViewRef = useRef<GanttViewHandle>(null);

    useEffect(() => {
        try {
            writePreferences(window.localStorage, {
                version: 2,
                mode,
                ganttColumns,
                listColumns,
                boardFields,
            });
        } catch {
            /* Browser storage can be disabled. */
        }
    }, [mode, ganttColumns, listColumns, boardFields]);

    const [editor, setEditor] = useState<Task | 'new' | null>(null);
    const editorInitiator = useRef<HTMLElement | null>(null);
    const editorFocusFallback = useRef<(() => HTMLElement | null) | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [hasFormConflict, setHasFormConflict] = useState(false);
    const [timezone, setTimezone] = useState(systemTimeZone);

    useEffect(() => {
        const refreshZone = () => setTimezone(systemTimeZone());
        window.addEventListener('focus', refreshZone);
        return () => {
            window.removeEventListener('focus', refreshZone);
        };
    }, []);

    const filteredTasks = useMemo(
        () => tasks.filter((task) => matchesFilters(task, filters)),
        [tasks, filters],
    );
    const sortedListTasks = useMemo(
        () => sortTasks(filteredTasks, listSort),
        [filteredTasks, listSort],
    );
    const sortedGanttTasks = useMemo(
        () => sortTasks(filteredTasks, ganttSort),
        [filteredTasks, ganttSort],
    );

    function changeColumns(view: 'list' | 'gantt', columns: TaskColumnId[]) {
        if (view === 'list') {
            setListColumns(columns);
            setListSort((current) => visibleTaskSort(current, columns));
        } else {
            if (ganttSort !== null && !columns.includes(ganttSort.column)) {
                ganttViewRef.current?.captureScroll();
            }
            setGanttColumns(columns);
            setGanttSort((current) => visibleTaskSort(current, columns));
        }
    }

    function changeFilters(patch: Partial<Filters>) {
        const updated = { ...filters, ...patch };
        setSearchParams(taskFiltersToSearch(updated), { replace: true });
    }

    function formErrorMessage(error: unknown, fallback: string): string | null {
        if (error instanceof Error) {
            return error.message === '' ? null : error.message;
        }
        return fallback;
    }

    function openEditor(task: Task | 'new', initiator: HTMLElement | null = null) {
        editorInitiator.current =
            initiator ??
            (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        const board = editorInitiator.current?.closest<HTMLElement>('.kanban-workspace');
        editorFocusFallback.current =
            board !== null && board !== undefined
                ? () => {
                      const title =
                          task !== 'new'
                              ? board.querySelector<HTMLElement>(
                                    `[data-task-id="${CSS.escape(task.id)}"] .task-title-button`,
                                )
                              : null;
                      return title ?? (board.isConnected ? board : null);
                  }
                : null;
        setFormError(null);
        setHasFormConflict(false);
        setEditor(task);
    }

    async function saveForm(input: TaskInput) {
        setFormError(null);
        try {
            if (editor !== null && editor !== 'new') {
                await updateTask(editor.id, input, editor.version);
            } else {
                await createTask(input);
            }

            setEditor(null);
        } catch (error) {
            setFormError(formErrorMessage(error, 'Не удалось сохранить'));
            setHasFormConflict(error instanceof TaskRepositoryError && error.status === 409);
        }
    }

    async function deleteTask() {
        if (editor === null || editor === 'new') {
            return;
        }
        setFormError(null);

        try {
            await removeTask(editor);
            setEditor(null);
        } catch (error) {
            setFormError(formErrorMessage(error, 'Не удалось удалить'));
            setHasFormConflict(error instanceof TaskRepositoryError && error.status === 409);
        }
    }

    async function reloadEditor() {
        if (editor === null || editor === 'new') {
            return;
        }
        try {
            const current = await reloadTasks();
            const actual = current.find((task) => task.id === editor.id);
            setEditor(actual ?? null);
            setFormError(null);
            setHasFormConflict(false);
            if (actual === undefined) {
                setMessage('Задача уже удалена');
            }
        } catch (error) {
            setFormError(formErrorMessage(error, 'Не удалось обновить'));
        }
    }

    function renderWorkspaceContent(view: WorkspaceView) {
        if (query.isLoading) {
            return (
                <div className="empty-state">
                    <span className="empty-icon">◌</span>
                    <h2>Загружаем ваши планы…</h2>
                </div>
            );
        }

        if (query.isError && query.data === undefined) {
            return (
                <div className="empty-state">
                    <h2>Не удалось загрузить задачи</h2>
                    <p>{query.error.message}</p>
                    <button className="primary-button" onClick={() => void query.refetch()}>
                        Повторить
                    </button>
                </div>
            );
        }

        if (view === 'board') {
            return (
                <KanbanBoard
                    tasks={filteredTasks}
                    fields={boardFields}
                    isBusy={isPending}
                    hasTasks={tasks.length > 0}
                    onEdit={openEditor}
                    onStatusChange={(id, status, version) => updateTask(id, { status }, version)}
                    onClearFilters={() => changeFilters(EMPTY_FILTERS)}
                />
            );
        }

        if (filteredTasks.length === 0) {
            return (
                <div className="empty-state">
                    <span className="empty-icon">▥</span>
                    <h2>{tasks.length > 0 ? 'Ничего не найдено' : 'Начните с первой задачи'}</h2>
                    <p>
                        {tasks.length > 0
                            ? 'Измените запрос или сбросьте фильтры.'
                            : 'Добавьте задачу и выберите время — она появится на диаграмме.'}
                    </p>
                    <button
                        className="primary-button"
                        onClick={() =>
                            tasks.length > 0 ? changeFilters(EMPTY_FILTERS) : openEditor('new')
                        }
                    >
                        {tasks.length > 0 ? 'Сбросить фильтры' : '+ Создать задачу'}
                    </button>
                </div>
            );
        }

        if (view === 'gantt') {
            return (
                <Suspense fallback={<div className="empty-state">Загружаем диаграмму…</div>}>
                    <GanttView
                        ref={ganttViewRef}
                        key={timezone}
                        tasks={sortedGanttTasks}
                        isBusy={isPending}
                        mode={mode}
                        selectedColumns={ganttColumns}
                        sort={ganttSort}
                        onSort={(column) =>
                            setGanttSort((current) => nextTaskSort(current, column))
                        }
                        onEdit={(id, initiator) => {
                            const task = tasks.find((task) => task.id === id);
                            if (task !== undefined && !isPending) {
                                openEditor(task, initiator);
                            }
                        }}
                        onChange={(id, dates, version) => {
                            void updateTask(id, dates, version).catch((error) =>
                                setMessage(
                                    error instanceof Error ? error.message : 'Не удалось сохранить',
                                ),
                            );
                        }}
                        onError={setMessage}
                    />
                </Suspense>
            );
        }

        return (
            <TaskList
                tasks={sortedListTasks}
                columns={listColumns}
                isPending={isPending}
                onEdit={openEditor}
                sort={listSort}
                onSort={(column) => setListSort((current) => nextTaskSort(current, column))}
            />
        );
    }

    let saveState: string | null = null;
    if (isPending) {
        saveState = 'Сохранение…';
    } else if (query.isFetching || isReloading) {
        saveState = 'Обновление…';
    }

    return (
        <div className="app-shell">
            <header className="app-navbar">
                <div className="navbar-content">
                    <div className="navbar-start">
                        <div className="navbar-brand">
                            <h1>Планировщик задач</h1>
                        </div>
                        <nav className="view-tabs" aria-label="Представление задач">
                            {WORKSPACE_ROUTES.map((route) => (
                                <NavLink
                                    key={route.path}
                                    to={{ pathname: route.path, search: location.search }}
                                    className={({ isActive }) => (isActive ? 'selected' : '')}
                                >
                                    {route.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                    <div className="navbar-end">
                        <span className="save-state" role="status">
                            {saveState}
                        </span>
                        <BackupControls
                            isBusy={
                                isPending ||
                                query.isLoading ||
                                (query.isError && query.data === undefined)
                            }
                            onImport={async (imported) => {
                                await replaceTasks(imported);
                                setEditor(null);
                            }}
                            onError={setMessage}
                        />
                        <button
                            className="primary-button"
                            onClick={() => openEditor('new')}
                            disabled={isPending}
                        >
                            + Новая задача
                        </button>
                    </div>
                </div>
            </header>
            <main>
                <section className="workspace-card">
                    {query.isError && query.data !== undefined && (
                        <div className="refresh-error" role="alert">
                            <span>Не удалось обновить задачи: {query.error.message}</span>
                            <button onClick={() => void query.refetch()}>Повторить</button>
                        </div>
                    )}
                    <TaskFilters
                        tasks={tasks}
                        filters={filters}
                        onChange={changeFilters}
                        settings={
                            view === 'board' ? (
                                <FieldChooser
                                    key="board"
                                    label="Настроить поля карточек"
                                    options={boardOptions}
                                    selected={boardFields}
                                    onChange={setBoardFields}
                                />
                            ) : (
                                <FieldChooser
                                    key={view}
                                    label="Настроить колонки"
                                    options={columnOptions}
                                    selected={view === 'gantt' ? ganttColumns : listColumns}
                                    onChange={(columns) => changeColumns(view, columns)}
                                />
                            )
                        }
                    />
                    {view === 'gantt' && filteredTasks.length > 0 && (
                        <div className="chart-controls">
                            <TimelineToolbar mode={mode} onModeChange={setMode} />
                        </div>
                    )}
                    <div className={`workspace-content ${view}`}>
                        <Routes>
                            {WORKSPACE_ROUTES.map((route) => (
                                <Route
                                    key={route.path}
                                    path={route.path}
                                    element={renderWorkspaceContent(route.view)}
                                />
                            ))}
                            <Route
                                path="*"
                                element={
                                    <Navigate
                                        to={{ pathname: '/list', search: location.search }}
                                        replace
                                    />
                                }
                            />
                        </Routes>
                    </div>
                </section>
                {message !== null && (
                    <div
                        className={`toast ${noticeKind ?? 'error'}`}
                        role={noticeKind === 'error' ? 'alert' : 'status'}
                    >
                        <span>{message}</span>
                        <button aria-label="Закрыть уведомление" onClick={() => setMessage(null)}>
                            ×
                        </button>
                    </div>
                )}
            </main>
            {editor !== null && (
                <TaskForm
                    key={editor === 'new' ? 'new' : `${editor.id}:${editor.version}`}
                    returnFocus={editorInitiator.current}
                    fallbackFocus={editorFocusFallback.current}
                    task={editor === 'new' ? null : editor}
                    isBusy={isPending || isReloading}
                    isReloading={isReloading}
                    error={formError}
                    onReload={hasFormConflict ? reloadEditor : null}
                    onClose={() => setEditor(null)}
                    onSave={saveForm}
                    onDelete={deleteTask}
                />
            )}
        </div>
    );
}
