import { useEffect, useMemo, useRef, useState } from 'react';
import { matchPath, useLocation, useSearchParams } from 'react-router';
import { type Task, type TaskInput } from '../lib/task';
import {
    EMPTY_FILTERS,
    matchesFilters,
    taskFiltersFromSearch,
    taskFiltersToSearch,
    type Filters,
} from '../lib/taskFilters';
import { nextTaskSort, sortTasks, visibleTaskSort, type TaskSort } from '../lib/taskSort';
import { systemTimeZone } from '../lib/time';
import type { BoardFieldId, TaskColumnId } from '../lib/taskFields';
import { TaskRepositoryError } from '../modules/tasks/data/taskRepository';
import { useTasks } from '../modules/tasks/hooks/useTasks';
import type { GanttViewHandle } from '../modules/gantt/components/GanttView';
import type { ScaleMode } from '../modules/gantt/model/timeline';
import { readPreferences, writePreferences, validatePreferences } from '../preferences';
import { WORKSPACE_ROUTES } from '../routes';

export function usePlannerController() {
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

    function clearFilters() {
        changeFilters(EMPTY_FILTERS);
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

    async function importTasks(imported: Task[]) {
        await replaceTasks(imported);
        setEditor(null);
    }

    function openGanttEditor(id: string, initiator: HTMLElement | null) {
        const task = tasks.find((item) => item.id === id);
        if (task !== undefined && !isPending) {
            openEditor(task, initiator);
        }
    }

    function changeGanttTask(id: string, dates: Pick<TaskInput, 'start' | 'end'>, version: number) {
        void updateTask(id, dates, version).catch((error) =>
            setMessage(error instanceof Error ? error.message : 'Не удалось сохранить'),
        );
    }

    function changeStatus(id: string, status: Task['status'], version: number) {
        return updateTask(id, { status }, version);
    }

    function sortList(column: TaskColumnId) {
        setListSort((current) => nextTaskSort(current, column));
    }

    function sortGantt(column: TaskColumnId) {
        setGanttSort((current) => nextTaskSort(current, column));
    }

    let saveState: string | null = null;
    if (isPending) {
        saveState = 'Сохранение…';
    } else if (query.isFetching || isReloading) {
        saveState = 'Обновление…';
    }

    return {
        query,
        tasks,
        isPending,
        isReloading,
        noticeKind,
        message,
        setMessage,
        filters,
        view,
        locationSearch: location.search,
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
    };
}
