import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, type Task } from '../../../lib/task';
import { matchesFilters, type Filters } from '../../../lib/taskFilters';
import type { DropdownOption } from '../../../components/ui/Dropdown';
import { MultiSelect } from '../../../components/ui/MultiSelect';
import { Select } from '../../../components/ui/Select';

type Selection = Pick<Filters, 'status' | 'priority' | 'urgent'>;
const taskCountWords = new Intl.PluralRules('ru');
const statusOptions: DropdownOption<Selection['status'][number]>[] = [
    ...STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
];
const priorityOptions: DropdownOption<Selection['priority'][number]>[] = [
    ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
];
const URGENT_OPTIONS: DropdownOption<'yes' | 'no' | ''>[] = [
    { value: 'yes', label: 'Срочные' },
    { value: 'no', label: 'Не срочные' },
];

function taskCountLabel(count: number): string {
    switch (taskCountWords.select(count)) {
        case 'one':
            return 'задачу';
        case 'few':
            return 'задачи';
        default:
            return 'задач';
    }
}

type Props = {
    filters: Filters;
    tasks: Task[];
    returnFocus: HTMLElement | null;
    onClose: () => void;
    onApply: (selection: Selection) => void;
};

export function FilterDialog({ filters, tasks, returnFocus, onClose, onApply }: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [draft, setDraft] = useState<Selection>(() => ({
        status: [...filters.status],
        priority: [...filters.priority],
        urgent: filters.urgent,
    }));
    const resultCount = useMemo(
        () => tasks.filter((task) => matchesFilters(task, { ...filters, ...draft })).length,
        [tasks, filters, draft],
    );

    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        return () => {
            element?.close();
            returnFocus?.focus();
        };
    }, [returnFocus]);

    function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
        if (event.target !== event.currentTarget) {
            return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
        ) {
            onClose();
        }
    }

    return (
        <dialog
            ref={dialog}
            className="filter-dialog"
            aria-labelledby="filter-dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={closeFromBackdrop}
        >
            <div className="dialog-heading">
                <h2 id="filter-dialog-title">Фильтры</h2>
                <button
                    type="button"
                    className="icon-button"
                    aria-label="Закрыть"
                    onClick={onClose}
                >
                    ×
                </button>
            </div>
            <div className="filter-dialog-body">
                <div className="filter-group" role="group" aria-labelledby="filter-status-label">
                    <h3 id="filter-status-label">Статус</h3>
                    <MultiSelect
                        label="Статус"
                        placeholder="Все статусы"
                        options={statusOptions}
                        value={draft.status}
                        onChange={(status) =>
                            setDraft((current) => ({
                                ...current,
                                status,
                            }))
                        }
                    />
                </div>
                <div className="filter-group" role="group" aria-labelledby="filter-priority-label">
                    <h3 id="filter-priority-label">Приоритет</h3>
                    <MultiSelect
                        label="Приоритет"
                        placeholder="Любой приоритет"
                        options={priorityOptions}
                        value={draft.priority}
                        onChange={(priority) =>
                            setDraft((current) => ({
                                ...current,
                                priority,
                            }))
                        }
                    />
                </div>
                <div className="filter-group" role="group" aria-labelledby="filter-urgent-label">
                    <h3 id="filter-urgent-label">Срочность</h3>
                    <Select
                        label="Срочность"
                        placeholder="Любая срочность"
                        options={URGENT_OPTIONS}
                        value={draft.urgent ?? ''}
                        onChange={(urgent) =>
                            setDraft((current) => ({
                                ...current,
                                urgent: urgent === '' ? null : urgent,
                            }))
                        }
                    />
                </div>
            </div>
            <div className="filter-dialog-footer">
                <button
                    type="button"
                    className="filter-clear-button"
                    onClick={() => setDraft({ status: [], priority: [], urgent: null })}
                >
                    Очистить фильтры
                </button>
                <div className="filter-dialog-actions">
                    <button type="button" className="ghost-button" onClick={onClose}>
                        Отмена
                    </button>
                    <button type="button" className="primary-button" onClick={() => onApply(draft)}>
                        Показать {resultCount} {taskCountLabel(resultCount)}
                    </button>
                </div>
            </div>
        </dialog>
    );
}
