import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Gantt, Willow, type IApi, type IColumnConfig, type ITask } from '@svar-ui/react-gantt';
import {
    GANTT_CELL_WIDTHS,
    GANTT_COMPACT_MEDIA,
    GANTT_ROW_HEIGHT,
    GANTT_SCALE_HEIGHT,
} from '../model/config';
import { GANTT_COLUMN_FIELDS, toGanttTask } from '../model/helpers';
import { taskColumnWidth, taskGridLayout, type GridLayoutMode } from '../model/gridLayout';
import { createPortal } from 'react-dom';
import { upperHeaderSegments, type HeaderSegment } from '../model/timelineHeader';
import type { TaskColumnId } from '../../../lib/taskFields';
import { Locale } from '@svar-ui/react-core';
import { ru } from '@svar-ui/core-locales';
import '@svar-ui/react-gantt/all.css';
import { HOUR, type Task, type TaskInput } from '../../../lib/task';
import {
    createTimelineGeometry,
    configureHourFrame,
    ELAPSED_HOUR_UNIT,
    taskDatesFromDrag,
    type TimelineGeometry,
} from '../model/adapter';
import { scaleLabel, timelineRange, lowerUnit, type ScaleMode } from '../model/timeline';
import { SortableHeader, sortAriaValue } from '../../../components/ui/SortableHeader';
import type { TaskSort } from '../../../lib/taskSort';

function TaskBar({ data }: { data: ITask }) {
    return (
        <span className={`task-bar-content ${data.status === 'done' ? 'completed' : ''}`}>
            <span>
                {data.isUrgent ? '⚡ ' : ''}
                {data.text}
            </span>
        </span>
    );
}

function GanttHeaderCell({
    column,
    sort,
    onSort,
}: {
    column: TaskColumnId;
    sort: TaskSort | null;
    onSort: (column: TaskColumnId) => void;
}) {
    const container = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        // SVAR owns the outer columnheader and reports its internal sort state.
        // Keep that accessible state in sync with the order managed by App.
        container.current
            ?.closest('[role="columnheader"]')
            ?.setAttribute('aria-sort', sortAriaValue(sort, column));
    }, [sort, column]);

    return (
        <div ref={container} className="sort-column-header">
            <SortableHeader column={column} sort={sort} onSort={onSort} />
        </div>
    );
}

type Gesture = {
    task: Task;
    initialLeft: number;
    initialWidth: number;
    left: number;
    width: number;
    geometry: TimelineGeometry;
};
type PointerIntent = {
    id: string;
    x: number;
    y: number;
    pointerId: number;
    hasMoved: boolean;
};
type ClickIntent = { id: string; element: HTMLElement; at: number };
type Props = {
    tasks: Task[];
    isBusy: boolean;
    mode: ScaleMode;
    selectedColumns: TaskColumnId[];
    sort: TaskSort | null;
    onSort: (column: TaskColumnId) => void;
    onEdit: (id: string, initiator: HTMLElement | null) => void;
    onChange: (id: string, dates: Pick<TaskInput, 'start' | 'end'>, version: number) => void;
    onError: (message: string) => void;
};

export type GanttViewHandle = { captureScroll: () => void };

export const GanttView = forwardRef<GanttViewHandle, Props>(function GanttView(props, ref) {
    const [isCompact, setIsCompact] = useState(
        () => window.matchMedia(GANTT_COMPACT_MEDIA).matches,
    );
    const [isGridHidden, setIsGridHidden] = useState(false);
    const columnMode = isCompact ? 'compact' : 'regular';
    let layoutMode: GridLayoutMode = columnMode;
    if (isCompact && isGridHidden) {
        layoutMode = 'chart-only';
    }
    useEffect(() => {
        const media = window.matchMedia(GANTT_COMPACT_MEDIA);
        const update = () => setIsCompact(media.matches);
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    const latest = useRef(props);
    latest.current = props;
    const wrapper = useRef<HTMLDivElement>(null);
    const apiRef = useRef<IApi>(null);
    const restoredScroll = useRef<{ left: number; top: number } | null>(null);
    const pendingFocusColumn = useRef<TaskColumnId | null>(null);
    const captureScroll = useCallback(() => {
        const state = apiRef.current?.getState();
        if (state !== undefined) {
            restoredScroll.current = { left: state.scrollLeft, top: state.scrollTop };
        }
    }, []);
    useImperativeHandle(ref, () => ({ captureScroll }), [captureScroll]);
    const sortColumn = useCallback(
        (column: TaskColumnId) => {
            pendingFocusColumn.current = column;
            captureScroll();
            latest.current.onSort(column);
        },
        [captureScroll],
    );
    const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
    const [headerSegments, setHeaderSegments] = useState<HeaderSegment[]>([]);
    const hasTwoLevels = props.mode === 'hour' || props.mode === 'week' || props.mode === 'quarter';
    const columns = useMemo<IColumnConfig[]>(
        () =>
            props.selectedColumns.map((id) => {
                const header = {
                    cell: () => (
                        <GanttHeaderCell
                            column={id}
                            sort={latest.current.sort}
                            onSort={sortColumn}
                        />
                    ),
                };
                if (id === 'title') {
                    return {
                        id: 'text',
                        header,
                        width: taskColumnWidth(id, columnMode),
                        resize: false,
                        cell: ({ row }) => (
                            <button
                                className="chart-task-title"
                                disabled={latest.current.isBusy}
                                onClick={(event) =>
                                    latest.current.onEdit(String(row.id), event.currentTarget)
                                }
                                title={String(row.text)}
                            >
                                {String(row.text)}
                            </button>
                        ),
                    };
                }
                const field = GANTT_COLUMN_FIELDS[id];
                return {
                    id: field,
                    header,
                    width: taskColumnWidth(id, columnMode),
                    resize: false,
                    cell: ({ row }) => (
                        <span className="chart-column-value" title={String(row[field] ?? '')}>
                            {String(row[field] ?? '')}
                        </span>
                    ),
                };
            }),
        [columnMode, props.selectedColumns, props.sort, sortColumn],
    );
    const { gridWidth, minimumWidth } = taskGridLayout(props.selectedColumns, layoutMode);
    const bounds = useMemo(() => timelineRange(props.tasks, props.mode), [props.tasks, props.mode]);
    const cellWidth = GANTT_CELL_WIDTHS[props.mode];
    configureHourFrame(bounds.start);
    const previousUserSelect = useRef<string | null>(null);
    const restoreSelection = useCallback(() => {
        if (previousUserSelect.current !== null) {
            document.body.style.userSelect = previousUserSelect.current;
            previousUserSelect.current = null;
        }
    }, []);
    const gesture = useRef<Gesture | null>(null);
    const pointerIntent = useRef<PointerIntent | null>(null);
    const clickIntent = useRef<ClickIntent | null>(null);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const api = apiRef.current;
        if (api === null) {
            return;
        }
        const refresh = () => {
            const state = api.getState();
            if (
                state._scales === null ||
                state._scales === undefined ||
                state.cellWidth === undefined ||
                state.cellWidth === 0
            ) {
                return;
            }
            const range = { start: state._scales.start, end: state._scales.end };
            const next = upperHeaderSegments(
                props.mode,
                range,
                createTimelineGeometry(props.mode, range, state.cellWidth),
            );
            setHeaderSegments((previous) =>
                previous.length === next.length &&
                previous.every((cell, index) => {
                    const candidate = next[index];
                    return (
                        candidate !== undefined &&
                        cell.key === candidate.key &&
                        cell.left === candidate.left &&
                        cell.width === candidate.width &&
                        cell.label === candidate.label
                    );
                })
                    ? previous
                    : next,
            );
        };
        const reactive = api.getReactiveState();
        // Store.subscribe returns a disposer at runtime; its shared declaration
        // currently types that return value as void.
        const signals = [reactive._scales, reactive.cellWidth] as unknown as Array<{
            subscribe: (callback: () => void) => () => void;
        }>;
        const unsubscribe = signals.map((signal) => signal.subscribe(refresh));
        const frame = window.requestAnimationFrame(() =>
            setHeaderTarget(
                wrapper.current?.querySelector<HTMLElement>('.wx-chart .wx-scale') ?? null,
            ),
        );
        return () => {
            unsubscribe.forEach((dispose) => dispose());
            window.cancelAnimationFrame(frame);
            setHeaderTarget(null);
        };
    }, [props.mode, props.sort?.column, props.sort?.direction, revision]);
    const taskIds = props.tasks
        .map((task) => task.id)
        .sort()
        .join(',');
    const tasks = useMemo(() => props.tasks.map(toGanttTask), [props.tasks]);

    const resetGesture = useCallback(() => {
        const state = apiRef.current?.getState();

        gesture.current = null;
        restoreSelection();

        if (state !== undefined) {
            restoredScroll.current = { left: state.scrollLeft, top: state.scrollTop };
        }

        // A cancelled or invalid gesture leaves transient $x/$w in the store.
        // Recreate it from confirmed props, preserving the user's scroll position.
        setRevision((value) => value + 1);
    }, [restoreSelection]);

    const init = useCallback(
        (api: IApi) => {
            apiRef.current = api;
            api.intercept('show-editor', (event) => {
                latest.current.onEdit(String(event.id), null);

                return false;
            });

            (
                [
                    'add-task',
                    'delete-task',
                    'move-task',
                    'resize-grid',
                    'set-display-mode',
                    'add-link',
                    'update-link',
                    'delete-link',
                ] as const
            ).forEach((action) => {
                api.intercept(action, () => false);
            });

            api.intercept('drag-task', (event) => {
                if (event.inProgress === false) {
                    gesture.current = null;

                    return true;
                }

                if (
                    latest.current.isBusy ||
                    event.left === undefined ||
                    event.width === undefined
                ) {
                    return false;
                }

                if (gesture.current === null || gesture.current.task.id !== String(event.id)) {
                    const original = latest.current.tasks.find(
                        (task) => task.id === String(event.id),
                    );
                    const chartTask = api.getTask(event.id);
                    const state = api.getState();
                    const scales = state._scales;

                    if (
                        original === undefined ||
                        scales === null ||
                        scales === undefined ||
                        state.cellWidth === undefined ||
                        state.cellWidth === 0
                    ) {
                        return false;
                    }

                    gesture.current = {
                        task: original,
                        initialLeft: Number(chartTask.$x),
                        initialWidth: Number(chartTask.$w),
                        left: event.left,
                        width: event.width,
                        // resize-chart may expand cells to fill a short range.
                        // Capture the actual frame rather than configured props.
                        geometry: createTimelineGeometry(
                            latest.current.mode,
                            {
                                start: scales.start,
                                end: scales.end,
                            },
                            state.cellWidth,
                        ),
                    };
                } else {
                    gesture.current.left = event.left;
                    gesture.current.width = event.width;
                }

                return true;
            });

            api.intercept('update-task', (event) => {
                const current = gesture.current;

                if (
                    event.inProgress ||
                    current === null ||
                    latest.current.isBusy ||
                    current.task.id !== String(event.id)
                ) {
                    return false;
                }

                let edge: 'move' | 'start' | 'end' = 'end';
                if (
                    event.task.start !== null &&
                    event.task.start !== undefined &&
                    event.task.end !== null &&
                    event.task.end !== undefined
                ) {
                    edge = 'move';
                } else if (event.task.start !== null && event.task.start !== undefined) {
                    edge = 'start';
                }
                const pixelDelta =
                    edge === 'end'
                        ? current.left + current.width - current.initialLeft - current.initialWidth
                        : current.left - current.initialLeft;
                const dates = taskDatesFromDrag(current.task, edge, pixelDelta, current.geometry);

                gesture.current = null;

                if (Date.parse(dates.end) - Date.parse(dates.start) < HOUR) {
                    latest.current.onError('Минимальная длительность — один час');
                    resetGesture();

                    return false;
                }

                event.task = {
                    start: new Date(dates.start),
                    end: new Date(dates.end),
                    duration: (Date.parse(dates.end) - Date.parse(dates.start)) / HOUR,
                };
                delete event.diff;
                latest.current.onChange(current.task.id, dates, current.task.version);

                return true;
            });
        },
        [resetGesture],
    );

    useEffect(() => {
        gesture.current = null;
        restoreSelection();
        void apiRef.current?.exec('scroll-chart', { left: 0, top: 0 });
    }, [props.mode, taskIds, restoreSelection]);

    useEffect(() => {
        const scroll = restoredScroll.current;
        restoredScroll.current = null;
        const focusColumn = pendingFocusColumn.current;
        pendingFocusColumn.current = null;
        let isActive = true;

        if (scroll !== null) {
            void Promise.resolve(apiRef.current?.exec('scroll-chart', scroll)).then(() => {
                if (isActive && focusColumn !== null) {
                    wrapper.current
                        ?.querySelector<HTMLButtonElement>(`[data-sort-column="${focusColumn}"]`)
                        ?.focus({ preventScroll: true });
                }
            });
        } else if (focusColumn !== null) {
            wrapper.current
                ?.querySelector<HTMLButtonElement>(`[data-sort-column="${focusColumn}"]`)
                ?.focus({ preventScroll: true });
        }
        return () => {
            isActive = false;
        };
    }, [revision, props.sort?.column, props.sort?.direction]);

    useEffect(() => {
        const onCancel = () => {
            if (gesture.current !== null || previousUserSelect.current !== null) {
                resetGesture();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onCancel();
            }
        };

        const onMouseUp = () => queueMicrotask(restoreSelection);

        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchend', onMouseUp);
        window.addEventListener('touchcancel', onCancel);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchend', onMouseUp);
            window.removeEventListener('touchcancel', onCancel);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKeyDown);
            restoreSelection();
        };
    }, [resetGesture, restoreSelection]);

    const captureSelection = () => {
        if (previousUserSelect.current === null) {
            previousUserSelect.current = document.body.style.userSelect;
        }
    };

    const captureTaskPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || (event.target as Element).closest('.wx-link') !== null) {
            pointerIntent.current = null;
            return;
        }

        const task = (event.target as Element).closest<HTMLElement>('[data-task-id]');
        const id = task?.dataset.taskId;
        if (id === undefined || id === '') {
            pointerIntent.current = null;
            return;
        }
        pointerIntent.current = {
            id,
            x: event.clientX,
            y: event.clientY,
            pointerId: event.pointerId,
            hasMoved: false,
        };
    };

    const captureTaskPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const intent = pointerIntent.current;
        if (intent === null || intent.pointerId !== event.pointerId) {
            return;
        }

        // Keep the same threshold as SVAR's drag handler so a click is never
        // swallowed while its chart still treats the gesture as a click.
        if (Math.hypot(event.clientX - intent.x, event.clientY - intent.y) >= 20) {
            intent.hasMoved = true;
        }
    };

    const captureTaskPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const intent = pointerIntent.current;
        pointerIntent.current = null;

        if (intent === null || intent.pointerId !== event.pointerId || intent.hasMoved) {
            clickIntent.current = null;
            return;
        }

        const task = (event.target as Element).closest<HTMLElement>('[data-task-id]');
        if (
            task?.dataset.taskId === intent.id &&
            (event.target as Element).closest('.wx-link') === null
        ) {
            clickIntent.current = { id: intent.id, element: task, at: Date.now() };
        }
    };

    const openTaskOnClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as Element;
        if (target.closest('.wx-link') !== null) {
            return;
        }

        const task = target.closest<HTMLElement>('[data-task-id]');
        if (task === null) {
            return;
        }

        const intent = clickIntent.current;
        clickIntent.current = null;
        const isPointerClick = Boolean(
            intent && intent.id === task.dataset.taskId && Date.now() - intent.at < 1000,
        );
        if (!isPointerClick && event.detail !== 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        const id = task.dataset.taskId;
        if (id !== undefined && id !== '' && !latest.current.isBusy) {
            latest.current.onEdit(id, task);
        }
    };

    const links = useMemo(() => [], []);
    const markers = useMemo(() => [{ start: new Date(), text: 'Сейчас' }], []);
    const scales = useMemo(
        () => [
            ...(hasTwoLevels ? [{ unit: lowerUnit(props.mode), step: 1, format: () => '' }] : []),
            {
                unit: lowerUnit(props.mode),
                step: 1,
                format: (date: Date) => scaleLabel(date, props.mode),
            },
        ],
        [props.mode, hasTwoLevels],
    );

    return (
        <div
            ref={wrapper}
            style={{ minWidth: minimumWidth }}
            className={`gantt-wrap ${isCompact ? 'has-grid-toggle' : ''}`}
            aria-label="Диаграмма Гантта"
            onMouseDownCapture={captureSelection}
            onTouchStartCapture={captureSelection}
            onPointerDownCapture={captureTaskPointerDown}
            onPointerMoveCapture={captureTaskPointerMove}
            onPointerUpCapture={captureTaskPointerUp}
            onPointerCancelCapture={() => {
                pointerIntent.current = null;
                clickIntent.current = null;
            }}
            onClickCapture={openTaskOnClick}
        >
            {isCompact && (
                <button
                    className="grid-toggle"
                    aria-expanded={!isGridHidden}
                    onClick={() => setIsGridHidden((value) => !value)}
                >
                    {isGridHidden ? 'Показать задачи' : 'Скрыть задачи'}
                </button>
            )}
            <Locale words={ru}>
                <Willow fonts={false}>
                    <Gantt
                        key={`${props.mode}:${revision}:${props.sort?.column ?? ''}:${props.sort?.direction ?? ''}`}
                        tasks={tasks}
                        links={links}
                        columns={isCompact && isGridHidden ? [] : columns}
                        gridWidth={gridWidth}
                        displayMode={isCompact && isGridHidden ? 'chart' : 'all'}
                        init={init}
                        start={bounds.start}
                        end={bounds.end}
                        scales={scales}
                        durationUnit="hour"
                        lengthUnit={ELAPSED_HOUR_UNIT}
                        cellWidth={cellWidth}
                        cellHeight={GANTT_ROW_HEIGHT}
                        scaleHeight={GANTT_SCALE_HEIGHT}
                        readonly={props.isBusy}
                        taskTemplate={TaskBar}
                        cellBorders="full"
                        markers={markers}
                    />
                </Willow>
            </Locale>
            {hasTwoLevels &&
                headerTarget &&
                createPortal(
                    <div className="calendar-upper-header">
                        {headerSegments.map((segment) => (
                            <div
                                key={segment.key}
                                className="calendar-header-cell"
                                style={{ left: segment.left, width: segment.width }}
                                title={segment.label}
                            >
                                {segment.label}
                            </div>
                        ))}
                    </div>,
                    headerTarget,
                )}
            <span className="sr-only">
                Задач на диаграмме: {props.tasks.length}. Нажмите название задачи, чтобы открыть
                форму редактирования. Сроки также можно изменить в форме.
            </span>
        </div>
    );
});
