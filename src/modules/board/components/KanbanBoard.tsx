import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropProvider, KeyboardSensor, PointerSensor, useDraggable } from '@dnd-kit/react';
import { Accessibility, defaultPreset } from '@dnd-kit/dom';
import { STATUSES, STATUS_LABELS, type Status, type Task } from '../../../lib/task';
import type { BoardFieldId } from '../../../lib/taskFields';
import { KANBAN_COLUMN_WIDTH, KANBAN_COLUMN_GAP } from '../model/config';
import {
    groupKanbanTasks,
    kanbanDropChange,
    kanbanPreviewIndex,
    type KanbanDragTask,
} from '../model/helpers';
import { KanbanCard } from './KanbanCard';
import { KanbanColumn } from './KanbanColumn';

type Props = {
    tasks: Task[];
    fields: BoardFieldId[];
    isBusy: boolean;
    hasTasks: boolean;
    onEdit: (task: Task, initiator: HTMLElement) => void;
    onStatusChange: (id: string, status: Status, version: number) => Promise<void>;
    onClearFilters: () => void;
};
const plugins = defaultPreset.plugins.filter((plugin) => plugin !== Accessibility);
const SENSORS = [
    PointerSensor,
    KeyboardSensor.configure({ offset: { x: KANBAN_COLUMN_WIDTH + KANBAN_COLUMN_GAP, y: 40 } }),
];

function DraggableCard(props: {
    task: Task;
    fields: BoardFieldId[];
    isBusy: boolean;
    onEdit: Props['onEdit'];
}) {
    const { ref, handleRef, isDragging } = useDraggable({
        id: props.task.id,
        disabled: props.isBusy,
    });
    return <KanbanCard {...props} cardRef={ref} handleRef={handleRef} isDragging={isDragging} />;
}

export function KanbanBoard({
    tasks,
    fields,
    isBusy,
    hasTasks,
    onEdit,
    onStatusChange,
    onClearFilters,
}: Props) {
    const groups = useMemo(() => groupKanbanTasks(tasks), [tasks]);
    const captured = useRef<KanbanDragTask | null>(null);
    const initiator = useRef<HTMLElement | null>(null);
    const focusTarget = useRef<HTMLDivElement>(null);
    const [announcement, setAnnouncement] = useState<string | null>(null);
    const [preview, setPreview] = useState<{
        taskId: string;
        width: number;
        height: number;
        target: Status | null;
    } | null>(null);
    useEffect(() => {
        if (preview !== null && (isBusy || !tasks.some((task) => task.id === preview.taskId))) {
            setPreview(null);
            captured.current = null;
        }
    }, [isBusy, tasks, preview]);
    const previewIndex =
        preview?.target !== null && preview?.target !== undefined
            ? kanbanPreviewIndex(tasks, preview.taskId, preview.target)
            : null;
    const ghost =
        preview !== null && previewIndex !== null ? (
            <div
                className="kanban-ghost"
                aria-hidden="true"
                style={{ width: preview.width, height: preview.height }}
            />
        ) : null;

    function restoreFocus(element: HTMLElement | null) {
        window.requestAnimationFrame(() => {
            const active = document.activeElement;
            if (
                active === document.body ||
                active === document.documentElement ||
                active === null
            ) {
                (element?.isConnected === true ? element : focusTarget.current)?.focus();
            }
        });
    }

    async function changeStatus(
        task: KanbanDragTask,
        target: unknown,
        element: HTMLElement | null,
    ) {
        const change = kanbanDropChange(task, target);
        if (change === null || isBusy) {
            return;
        }
        setAnnouncement(`Перемещаем задачу в «${STATUS_LABELS[change.status]}»`);
        try {
            await onStatusChange(change.id, change.status, change.version);
            setAnnouncement(`Статус задачи изменён: ${STATUS_LABELS[change.status]}`);
        } catch (error) {
            setAnnouncement(
                error instanceof Error
                    ? `Не удалось переместить задачу: ${error.message}`
                    : 'Не удалось переместить задачу',
            );
        } finally {
            restoreFocus(element);
        }
    }

    return (
        <div className="kanban-workspace" ref={focusTarget} tabIndex={-1} aria-label="Доска задач">
            <span id="kanban-drag-help" className="sr-only">
                Пробел — начать перенос, стрелки — выбрать колонку, пробел — завершить, Escape —
                отменить.
            </span>
            {tasks.length === 0 && (
                <div className="kanban-empty-hint">
                    {hasTasks ? (
                        <>
                            <span>Ничего не найдено.</span>{' '}
                            <button className="reset-button" onClick={onClearFilters}>
                                Сбросить фильтры
                            </button>
                        </>
                    ) : (
                        'Создайте первую задачу кнопкой «Новая задача».'
                    )}
                </div>
            )}
            <DragDropProvider
                sensors={SENSORS}
                plugins={plugins}
                onDragStart={(event) => {
                    const task = tasks.find((item) => item.id === event.operation.source?.id);
                    captured.current =
                        task !== undefined && !isBusy
                            ? { id: task.id, version: task.version, status: task.status }
                            : null;
                    const rect = event.operation.source?.element?.getBoundingClientRect();
                    setPreview(
                        task !== undefined && !isBusy && rect !== undefined
                            ? {
                                  taskId: task.id,
                                  width: rect.width,
                                  height: rect.height,
                                  target: null,
                              }
                            : null,
                    );
                    initiator.current =
                        document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                    if (task !== undefined) {
                        setAnnouncement(`Перемещение задачи «${task.title}»`);
                    }
                }}
                onDragOver={(event) => {
                    const target = event.operation.target?.id;
                    const status = STATUSES.find((value) => value === target);
                    const targetStatus =
                        status !== undefined &&
                        captured.current !== null &&
                        kanbanPreviewIndex(tasks, captured.current.id, status) !== null
                            ? status
                            : null;
                    setPreview((current) =>
                        current !== null && current.target !== targetStatus
                            ? { ...current, target: targetStatus }
                            : current,
                    );
                    setAnnouncement(
                        status !== undefined
                            ? `Область назначения: ${STATUS_LABELS[status]}`
                            : 'Вне колонок: статус не изменится',
                    );
                }}
                onDragEnd={(event) => {
                    const task = captured.current;
                    const element = initiator.current;
                    captured.current = null;
                    initiator.current = null;
                    setPreview(null);
                    if (event.canceled) {
                        setAnnouncement('Перемещение отменено');
                        restoreFocus(element);
                        return;
                    }
                    if (kanbanDropChange(task, event.operation.target?.id) === null) {
                        setAnnouncement('Статус не изменён');
                        restoreFocus(element);
                        return;
                    }
                    if (task !== null) {
                        void changeStatus(task, event.operation.target?.id, element);
                    }
                }}
            >
                <div
                    className="kanban-board"
                    style={{
                        gap: KANBAN_COLUMN_GAP,
                        gridTemplateColumns: `repeat(${STATUSES.length}, ${KANBAN_COLUMN_WIDTH}px)`,
                    }}
                >
                    {STATUSES.map((status) => (
                        <KanbanColumn
                            key={status}
                            status={status}
                            count={groups[status].length}
                            isBusy={isBusy}
                            hasPreview={ghost !== null && preview?.target === status}
                        >
                            {groups[status].map((task, index) => (
                                <Fragment key={task.id}>
                                    {preview?.target === status && previewIndex === index && ghost}
                                    <DraggableCard
                                        task={task}
                                        fields={fields}
                                        isBusy={isBusy}
                                        onEdit={onEdit}
                                    />
                                </Fragment>
                            ))}
                            {preview?.target === status &&
                                previewIndex === groups[status].length &&
                                ghost}
                        </KanbanColumn>
                    ))}
                </div>
            </DragDropProvider>
            <span className="sr-only" role="status" aria-live="polite">
                {announcement}
            </span>
        </div>
    );
}
