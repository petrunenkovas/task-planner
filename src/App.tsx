import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
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
import { TaskForm } from './modules/tasks/components/TaskForm';
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
    const {
        query,
        tasks,
        isPending,
        isReloading,
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
        editor,
        setEditor,
        editorInitiator,
        editorFocusFallback,
        formError,
        hasFormConflict,
        timezone,
        filteredTasks,
        sortedListTasks,
        sortedGanttTasks,
        saveState,
        changeColumns,
        changeFilters,
        clearFilters,
        openEditor,
        saveForm,
        deleteTask,
        reloadEditor,
        importTasks,
        openGanttEditor,
        changeGanttTask,
        changeStatus,
        sortList,
        sortGantt,
    } = usePlannerController();

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
                    onStatusChange={changeStatus}
                    onClearFilters={clearFilters}
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
                        onClick={() => (tasks.length > 0 ? clearFilters() : openEditor('new'))}
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
                        onSort={sortGantt}
                        onEdit={openGanttEditor}
                        onChange={changeGanttTask}
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
                onSort={sortList}
            />
        );
    }

    return (
        <div className="app-shell">
            <PlannerNavbar
                search={locationSearch}
                saveState={saveState}
                isBusy={isPending}
                isBackupBusy={
                    isPending || query.isLoading || (query.isError && query.data === undefined)
                }
                onImport={importTasks}
                onError={setMessage}
                onCreate={() => openEditor('new')}
            />
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
                                        to={{ pathname: '/list', search: locationSearch }}
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
