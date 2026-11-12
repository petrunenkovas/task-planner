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
import { nextTaskSort, visibleTaskSort, type TaskSort } from '../lib/taskSort';
import { systemTimeZone } from '../lib/time';
import type { BoardFieldId, TaskColumnId } from '../lib/taskFields';
import { createDemoTasks } from '../modules/tasks/model/demoTasks';
import { useTasks } from '../modules/tasks/hooks/useTasks';
import type { GanttViewHandle } from '../modules/gantt/components/GanttView';
import type { ScaleMode } from '../modules/gantt/model/timeline';
import { readPreferences, writePreferences, validatePreferences } from '../preferences';
import { WORKSPACE_ROUTES } from '../routes';

export function usePlannerController() {
    const taskStore = useTasks();
    const {
        query,
        tasks,
        isPending,
        isReloading,
        noticeKind,
        message,
        setMessage,
        updateTask,
        replaceTasks,
        seedDemoTasks,
    } = taskStore;

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

    async function importTasks(imported: Task[]) {
        await replaceTasks(imported);
    }

    async function loadDemoTasks() {
        try {
            await seedDemoTasks(createDemoTasks());
        } catch {
            // useTasks displays the repository error in the app toast.
        }
    }

    function changeGanttTask(id: string, dates: Pick<TaskInput, 'start' | 'end'>, version: number) {
        void updateTask(id, dates, version).catch((error) =>
            setMessage(error instanceof Error ? error.message : 'Не удалось сохранить'),
        );
    }

    async function changeStatus(
        id: string,
        status: Task['status'],
        version: number,
    ): Promise<void> {
        await updateTask(id, { status }, version);
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
        taskStore,
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
    };
}
