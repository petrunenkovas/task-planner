import { useRef, useState, type ReactNode } from 'react';
import type { Task } from '../../../lib/task';
import type { Filters } from '../../../lib/taskFilters';
import { FilterDialog } from './FilterDialog';

type Props = {
    tasks: Task[];
    filters: Filters;
    onChange: (patch: Partial<Filters>) => void;
    settings: ReactNode;
};

export function TaskFilters({ tasks, filters, onChange, settings }: Props) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const activeGroups =
        Number(filters.status.length > 0) +
        Number(filters.priority.length > 0) +
        Number(filters.urgent !== '');
    return (
        <div className="filter-bar">
            <div className="search-field">
                <span aria-hidden="true">⌕</span>
                <input
                    ref={searchInput}
                    aria-label="Поиск задач"
                    placeholder="Найти задачу…"
                    value={filters.q}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => onChange({ q: event.target.value })}
                />
                <button
                    type="button"
                    className="search-clear"
                    aria-label="Очистить поиск"
                    title="Очистить поиск"
                    disabled={filters.q === ''}
                    onClick={() => {
                        onChange({ q: '' });
                        searchInput.current?.focus();
                    }}
                >
                    ×
                </button>
            </div>
            <button
                ref={trigger}
                type="button"
                className="filter-modal-trigger"
                aria-haspopup="dialog"
                onClick={() => setIsDialogOpen(true)}
            >
                Фильтры
                {activeGroups > 0 && <span className="filter-count">{activeGroups}</span>}
            </button>
            {settings}
            {isDialogOpen && (
                <FilterDialog
                    filters={filters}
                    tasks={tasks}
                    returnFocus={trigger.current}
                    onClose={() => setIsDialogOpen(false)}
                    onApply={(selection) => {
                        onChange(selection);
                        setIsDialogOpen(false);
                    }}
                />
            )}
        </div>
    );
}
