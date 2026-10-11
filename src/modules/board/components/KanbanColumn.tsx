import type { CSSProperties, ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/react';
import { KANBAN_STATUS_COLORS } from '../model/config';
import { STATUS_LABELS, type Status } from '../../../lib/task';

type Props = {
    status: Status;
    count: number;
    isBusy: boolean;
    hasPreview: boolean;
    children: ReactNode;
};
export function KanbanColumn({ status, count, isBusy, hasPreview, children }: Props) {
    const colors = KANBAN_STATUS_COLORS[status];
    const { ref } = useDroppable({ id: status, disabled: isBusy });
    return (
        <section
            ref={ref}
            style={
                {
                    '--kanban-accent': colors.accent,
                    '--kanban-surface': colors.surface,
                    '--kanban-text': colors.text,
                } as CSSProperties
            }
            className="kanban-column"
            aria-label={STATUS_LABELS[status]}
        >
            <h3>
                {STATUS_LABELS[status]} <span>{count}</span>
            </h3>
            <div className="kanban-column-cards">
                {children}
                {count === 0 && !hasPreview && <p className="kanban-empty-column">Нет задач</p>}
            </div>
        </section>
    );
}
