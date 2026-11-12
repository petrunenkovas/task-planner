import { lazy, Suspense, useCallback, useRef } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { FieldChooser, type FieldOption } from './components/ui/FieldChooser';
import { PlannerNavbar } from './components/layout/PlannerNavbar';
import { usePlannerController } from './hooks/usePlannerController';
import {
    BOARD_FIELD_IDS,
    BOARD_FIELD_LABELS,
    TASK_COLUMN_IDS,
    TASK_COLUMN_LABELS,
    type BoardFieldId,
    type TaskColumnId,
} from './lib/taskFields';
import { KanbanBoard } from './modules/board/components/KanbanBoard';
import { TimelineToolbar } from './modules/gantt/components/TimelineToolbar';
import { TaskFilters } from './modules/tasks/components/TaskFilters';
import { TaskPage } from './modules/tasks/components/TaskPage';
import type { Task } from './lib/task';
import { TaskList } from './modules/list/components/TaskList';
import { WORKSPACE_ROUTES, type WorkspaceView } from './routes';

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
    const location = useLocation();
    const navigate = useNavigate();
    const importGuard = useRef<() => Promise<boolean>>(async () => true);
    const registerImportGuard = useCallback((guard: () => Promise<boolean>) => {
        importGuard.current = guard;
        return () => {
            if (importGuard.current === guard) importGuard.current = async () => true;
        };
    }, []);
    const {
        taskStore,
        query,
        tasks,
        isPending,
        noticeKind,
        message,
        setMessage,
        filters,
        view,
        locationSearch,
        mode,
        setMode,
        ganttColumns,
        listColumns,
        boardFields,
        setBoardFields,
        listSort,
        ganttSort,
        ganttViewRef,
        timezone,
        filteredTasks,
        saveState,
        changeColumns,
        changeFilters,
        clearFilters,
        importTasks,
        loadDemoTasks,
        changeGanttTask,
        changeStatus,
        sortList,
        sortGantt,
    } = usePlannerController();

    async function guardedImport(imported: Task[]) {
        if (!(await importGuard.current())) {
            throw new Error('Сначала сохраните изменения задачи или исправьте поля.');
        }
        await importTasks(imported);
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

        if (tasks.length === 0) {
            return (
                <div className="empty-state">
                    <span className="empty-icon">▥</span>
                    <h2>Начните с первой задачи</h2>
                    <p>
                        Создайте свою задачу или загрузите 30 примеров для знакомства с
                        планировщиком.
                    </p>
                    <div className="empty-actions">
                        <Link className="primary-button" to="/tasks/new">
                            + Создать задачу
                        </Link>
                        <button
                            className="ghost-button"
                            disabled={isPending}
                            onClick={() => void loadDemoTasks()}
                        >
                            Загрузить примеры
                        </button>
                    </div>
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
                    onStatusChange={changeStatus}
                    onClearFilters={clearFilters}
                />
            );
        }

        if (filteredTasks.length === 0) {
            return (
                <div className="empty-state">
                    <span className="empty-icon">▥</span>
                    <h2>Ничего не найдено</h2>
                    <p>Измените запрос или сбросьте фильтры.</p>
                    <button className="primary-button" onClick={clearFilters}>
                        Сбросить фильтры
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
                        tasks={filteredTasks}
                        isBusy={isPending}
                        mode={mode}
                        selectedColumns={ganttColumns}
                        sort={ganttSort}
                        onSort={sortGantt}
                        onEdit={(id) => navigate(`/tasks/${id}`)}
                        onChange={changeGanttTask}
                        onError={setMessage}
                    />
                </Suspense>
            );
        }

        return (
            <TaskList
                tasks={filteredTasks}
                columns={listColumns}
                isPending={isPending}
                sort={listSort}
                onSort={sortList}
            />
        );
    }

    return (
        <div className="app-shell">
            <PlannerNavbar
                search={locationSearch}
                saveState={location.pathname.startsWith('/tasks/') ? null : saveState}
                isBusy={isPending}
                isBackupBusy={
                    isPending || query.isLoading || (query.isError && query.data === undefined)
                }
                onImport={guardedImport}
                onError={setMessage}
            />
            <main>
                {location.pathname.startsWith('/tasks/') ? (
                    <Routes>
                        <Route
                            path="/tasks/:taskId"
                            element={
                                <TaskPage
                                    registerImportGuard={registerImportGuard}
                                    taskStore={taskStore}
                                />
                            }
                        />
                        <Route path="*" element={<Navigate to="/list" replace />} />
                    </Routes>
                ) : (
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
                                            to={{ pathname: '/list', search: locationSearch }}
                                            replace
                                        />
                                    }
                                />
                            </Routes>
                        </div>
                    </section>
                )}
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
        </div>
    );
}
