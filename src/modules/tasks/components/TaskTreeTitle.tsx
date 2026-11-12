import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Task } from '../../../lib/task';
import type { TaskTreeRow } from '../model/taskTree';

type Props = Pick<TaskTreeRow, 'depth' | 'hasChildren' | 'isExpanded'> & {
    task: Task;
    titleClassName: string;
    isDisabled: boolean;
    onToggle: (id: string) => void;
};

export function TaskTreeTitle({
    task,
    depth,
    hasChildren,
    isExpanded,
    titleClassName,
    isDisabled,
    onToggle,
}: Props) {
    return (
        <div className="task-tree-title" style={{ '--task-tree-depth': depth } as CSSProperties}>
            {hasChildren ? (
                <button
                    type="button"
                    className="task-tree-toggle"
                    aria-label={`${isExpanded ? 'Свернуть' : 'Раскрыть'} подзадачи: ${task.title}`}
                    aria-expanded={isExpanded}
                    disabled={isDisabled}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggle(task.id);
                    }}
                >
                    <span className="task-tree-chevron" aria-hidden="true" />
                </button>
            ) : (
                <span className="task-tree-toggle-placeholder" aria-hidden="true" />
            )}
            <Link className={titleClassName} to={`/tasks/${task.id}`} title={task.title}>
                {task.title}
            </Link>
        </div>
    );
}
