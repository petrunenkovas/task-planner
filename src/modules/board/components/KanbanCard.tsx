import type { Ref } from 'react';
import { PRIORITY_LABELS, type Task } from '../../../lib/task';
import type { BoardFieldId } from '../../../lib/taskFields';

type Props = {
    task: Task;
    fields: BoardFieldId[];
    isBusy: boolean;
    isDragging?: boolean;
    cardRef?: Ref<HTMLDivElement>;
    handleRef?: Ref<HTMLButtonElement>;
    onEdit: (task: Task, initiator: HTMLElement) => void;
};
export function KanbanCard({
    task,
    fields,
    isBusy,
    isDragging,
    cardRef,
    handleRef,
    onEdit,
}: Props) {
    return (
        <div
            ref={cardRef}
            data-task-id={task.id}
            className={`kanban-card ${isDragging === true ? 'dragging' : ''}`}
        >
            <div className="kanban-card-heading">
                <button
                    className="task-title-button"
                    disabled={isBusy}
                    onClick={(event) => onEdit(task, event.currentTarget)}
                >
                    {task.title}
                </button>
                <button
                    ref={handleRef}
                    className="kanban-drag-handle"
                    disabled={isBusy}
                    aria-label={`Переместить задачу «${task.title}»`}
                    aria-describedby="kanban-drag-help"
                >
                    ⠿
                </button>
            </div>
            {fields.includes('description') && task.description !== '' && (
                <p className="kanban-card-description">{task.description}</p>
            )}
            {(fields.includes('priority') || (fields.includes('urgent') && task.isUrgent)) && (
                <div className="kanban-card-tags">
                    {fields.includes('priority') && (
                        <span>{PRIORITY_LABELS[task.priority]} приоритет</span>
                    )}
                    {fields.includes('urgent') && task.isUrgent && (
                        <span className="kanban-urgent">Срочная</span>
                    )}
                </div>
            )}
        </div>
    );
}
