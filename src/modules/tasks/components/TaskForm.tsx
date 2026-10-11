import { ZodError } from 'zod';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import {
    HOUR,
    PRIORITIES,
    PRIORITY_LABELS,
    STATUSES,
    STATUS_LABELS,
    taskInputSchema,
    type Priority,
    type Status,
    type Task,
    type TaskInput,
} from '../../../lib/task';
import { assertFormTimeZone, localInput, nextHour, systemTimeZone } from '../../../lib/time';

import { resolveDateField, validationFields, type FieldErrors } from '../model/formValidation';
import type { DropdownOption } from '../../../components/ui/Dropdown';
import { Select } from '../../../components/ui/Select';

const statusOptions: DropdownOption<Status>[] = STATUSES.map((value) => ({
    value,
    label: STATUS_LABELS[value],
}));
const priorityOptions: DropdownOption<Priority>[] = PRIORITIES.map((value) => ({
    value,
    label: PRIORITY_LABELS[value],
}));

type Props = {
    task: Task | null;
    returnFocus: HTMLElement | null;
    fallbackFocus: (() => HTMLElement | null) | null;
    isBusy: boolean;
    isReloading: boolean;
    error: string;
    onClose: () => void;
    onSave: (task: TaskInput) => Promise<void>;
    onDelete: () => Promise<void>;
    onReload: (() => Promise<void>) | null;
};

export function TaskForm({
    task,
    returnFocus,
    fallbackFocus,
    isBusy,
    isReloading,
    error,
    onClose,
    onSave,
    onDelete,
    onReload,
}: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [formZone] = useState(systemTimeZone);
    const [validation, setValidation] = useState('');
    const [fields, setFields] = useState<FieldErrors>({});
    const [status, setStatus] = useState<Status>(task?.status ?? 'planned');
    const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
    const titleInput = useRef<HTMLInputElement>(null);
    const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
    const start = task !== null ? new Date(task.start) : nextHour();

    useEffect(() => {
        const element = dialog.current;
        const initiator =
            returnFocus ??
            (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        element?.showModal();
        titleInput.current?.focus();
        return () => {
            element?.close();
            if (initiator?.isConnected === true) {
                initiator.focus();
            } else if (
                document.activeElement === document.body ||
                document.activeElement === document.documentElement
            ) {
                fallbackFocus?.()?.focus();
            }
        };
    }, []);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setValidation('');
        setFields({});

        const element = event.currentTarget;
        const form = new FormData(element);

        try {
            assertFormTimeZone(formZone);

            const value = taskInputSchema.parse({
                title: form.get('title'),
                description: form.get('description'),
                start: resolveDateField(String(form.get('start')), task?.start, 'start'),
                end: resolveDateField(String(form.get('end')), task?.end, 'end'),
                status: form.get('status'),
                priority: form.get('priority'),
                isUrgent: form.get('urgent') === 'on',
            });

            await onSave(value);
        } catch (issue) {
            if (issue instanceof ZodError) {
                const errors = validationFields(issue);
                setFields(errors);
                const first = Object.keys(errors)[0];
                if (first !== undefined && first !== '') {
                    const invalidField =
                        element.querySelector<HTMLElement>(`[data-field-name="${first}"]`) ??
                        element.querySelector<HTMLElement>(`[name="${first}"]`);
                    invalidField?.focus();
                }
                setValidation(first !== undefined && first !== '' ? '' : 'Проверьте данные');
            } else {
                setValidation(issue instanceof Error ? issue.message : 'Проверьте данные');
            }
        }
    }

    function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
        if (isBusy || event.target !== event.currentTarget) {
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

    let submitLabel = 'Создать задачу';
    if (isReloading === true) {
        submitLabel = 'Обновление…';
    } else if (isBusy) {
        submitLabel = 'Сохранение…';
    } else if (task !== null) {
        submitLabel = 'Сохранить';
    }

    return (
        <dialog
            ref={dialog}
            className="task-dialog"
            aria-labelledby="task-dialog-title"
            onClick={closeFromBackdrop}
            onCancel={(event) => {
                if (isBusy) {
                    event.preventDefault();
                } else {
                    onClose();
                }
            }}
        >
            <form onSubmit={submit} noValidate>
                <div className="dialog-heading">
                    <div>
                        <h2 id="task-dialog-title">
                            {task !== null ? 'Редактировать задачу' : 'Новая задача'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Закрыть"
                        disabled={isBusy}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>
                <label>
                    Название
                    <input
                        name="title"
                        aria-invalid={Boolean(fields.title)}
                        aria-describedby={fields.title ? 'field-title-error' : undefined}
                        defaultValue={task?.title}
                        placeholder="Что нужно сделать?"
                        maxLength={200}
                        required
                        ref={titleInput}
                        disabled={isBusy}
                    />
                    {fields.title !== undefined && fields.title !== '' && (
                        <span id="field-title-error" className="field-error" role="alert">
                            {fields.title}
                        </span>
                    )}
                </label>
                <label>
                    Описание
                    <textarea
                        name="description"
                        aria-invalid={Boolean(fields.description)}
                        aria-describedby={
                            fields.description ? 'field-description-error' : undefined
                        }
                        defaultValue={task?.description}
                        placeholder="Детали, заметки и ожидаемый результат"
                        rows={3}
                        maxLength={10000}
                        disabled={isBusy}
                    />
                    {fields.description !== undefined && fields.description !== '' && (
                        <span id="field-description-error" className="field-error" role="alert">
                            {fields.description}
                        </span>
                    )}
                </label>
                <div className="form-grid">
                    <label>
                        Начало
                        <input
                            name="start"
                            aria-invalid={Boolean(fields.start)}
                            aria-describedby={fields.start ? 'field-start-error' : undefined}
                            type="datetime-local"
                            step={3600}
                            defaultValue={localInput(start)}
                            required
                            disabled={isBusy}
                        />
                        {fields.start !== undefined && fields.start !== '' && (
                            <span id="field-start-error" className="field-error" role="alert">
                                {fields.start}
                            </span>
                        )}
                    </label>
                    <label>
                        Конец
                        <input
                            name="end"
                            aria-invalid={Boolean(fields.end)}
                            aria-describedby={fields.end ? 'field-end-error' : undefined}
                            type="datetime-local"
                            step={3600}
                            defaultValue={localInput(
                                task ? new Date(task.end) : new Date(start.getTime() + 2 * HOUR),
                            )}
                            required
                            disabled={isBusy}
                        />
                        {fields.end !== undefined && fields.end !== '' && (
                            <span id="field-end-error" className="field-error" role="alert">
                                {fields.end}
                            </span>
                        )}
                    </label>
                </div>
                <p className="field-note">{formZone} · шаг 1 час · минимум 1 час</p>
                <div className="form-grid">
                    <label>
                        Статус
                        <Select
                            name="status"
                            label="Статус"
                            options={statusOptions}
                            value={status}
                            isInvalid={Boolean(fields.status)}
                            describedBy={fields.status ? 'field-status-error' : undefined}
                            isDisabled={isBusy}
                            onChange={setStatus}
                        />
                        {fields.status !== undefined && fields.status !== '' && (
                            <span id="field-status-error" className="field-error" role="alert">
                                {fields.status}
                            </span>
                        )}
                    </label>
                    <label>
                        Приоритет
                        <Select
                            name="priority"
                            label="Приоритет"
                            options={priorityOptions}
                            value={priority}
                            isInvalid={Boolean(fields.priority)}
                            describedBy={fields.priority ? 'field-priority-error' : undefined}
                            isDisabled={isBusy}
                            onChange={setPriority}
                        />
                        {fields.priority !== undefined && fields.priority !== '' && (
                            <span id="field-priority-error" className="field-error" role="alert">
                                {fields.priority}
                            </span>
                        )}
                    </label>
                </div>
                <label className="checkbox">
                    <input
                        name="urgent"
                        type="checkbox"
                        defaultChecked={task?.isUrgent}
                        disabled={isBusy}
                    />
                    Срочная задача
                </label>
                {(validation !== '' || error !== '') && (
                    <p role="alert" className="form-error">
                        {validation !== '' ? validation : error}
                    </p>
                )}
                {onReload !== null && (
                    <div className="delete-confirm">
                        <p>Загрузка актуальной задачи заменит введённые в форме данные.</p>
                        <button
                            className="ghost-button"
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onReload()}
                        >
                            Загрузить актуальную задачу
                        </button>
                    </div>
                )}
                {isDeleteConfirmed && (
                    <div className="delete-confirm">
                        <p>Удалить «{task?.title}»? Восстановить задачу будет нельзя.</p>
                        <button
                            className="danger-button"
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onDelete()}
                        >
                            Да, удалить
                        </button>
                        <button
                            className="ghost-button"
                            type="button"
                            disabled={isBusy}
                            onClick={() => setIsDeleteConfirmed(false)}
                        >
                            Оставить
                        </button>
                    </div>
                )}
                <div className="dialog-footer">
                    {task !== null && (
                        <button
                            className="delete-button"
                            type="button"
                            disabled={isBusy}
                            onClick={() => setIsDeleteConfirmed(true)}
                        >
                            Удалить
                        </button>
                    )}
                    <span className="spacer" />
                    <button
                        className="ghost-button"
                        type="button"
                        disabled={isBusy}
                        onClick={onClose}
                    >
                        Отмена
                    </button>
                    <button className="primary-button" type="submit" disabled={isBusy}>
                        {submitLabel}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
