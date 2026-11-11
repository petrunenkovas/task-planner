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
import { MAX_TASK_LEVEL } from '../../../lib/taskHierarchy';

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
    subtasks: Task[];
    parents: Task[];
    descendantCount: number;
    level: number;
    returnFocus: HTMLElement | null;
    fallbackFocus: (() => HTMLElement | null) | null;
    preserveFocusOnReopen: { current: boolean };
    scrollPosition: { current: number | null };
    isBusy: boolean;
    isReloading: boolean;
    error: string | null;
    onClose: () => void;
    onNavigate: (task: Task) => void;
    onSave: (task: TaskInput) => Promise<void>;
    onAddSubtask: (title: string, newParentInput: TaskInput | null) => Promise<boolean>;
    onToggleSubtask: (task: Task) => Promise<void>;
    onDelete: () => Promise<void>;
    onReload: (() => Promise<void>) | null;
};

export function TaskForm({
    task,
    subtasks,
    parents,
    descendantCount,
    level,
    returnFocus,
    fallbackFocus,
    preserveFocusOnReopen,
    scrollPosition,
    isBusy,
    isReloading,
    error,
    onClose,
    onNavigate,
    onSave,
    onAddSubtask,
    onToggleSubtask,
    onDelete,
    onReload,
}: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [formZone] = useState(systemTimeZone);
    const [validation, setValidation] = useState<string | null>(null);
    const [fields, setFields] = useState<FieldErrors>({});
    const [status, setStatus] = useState<Status>(task?.status ?? 'new');
    const [subtaskTitle, setSubtaskTitle] = useState('');
    const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
    const titleInput = useRef<HTMLInputElement>(null);
    const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [isSavingSubtasks, setIsSavingSubtasks] = useState(false);
    const [pendingLeave, setPendingLeave] = useState<Task | 'close' | null>(null);
    const returnFocusOnUnmount = useRef(true);
    const confirmLeaveButton = useRef<HTMLButtonElement>(null);
    const pendingLeaveTrigger = useRef<HTMLElement | null>(null);
    const start = task !== null ? new Date(task.start) : nextHour();

    useEffect(() => {
        const element = dialog.current;
        const initiator =
            returnFocus ??
            (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        preserveFocusOnReopen.current = false;
        element?.showModal();
        titleInput.current?.focus({ preventScroll: true });
        if (scrollPosition.current !== null && element !== null) {
            element.scrollTop = scrollPosition.current;
            scrollPosition.current = null;
        }
        return () => {
            element?.close();
            if (
                returnFocusOnUnmount.current &&
                !preserveFocusOnReopen.current &&
                initiator?.isConnected === true
            ) {
                initiator.focus();
            } else if (
                returnFocusOnUnmount.current &&
                !preserveFocusOnReopen.current &&
                (document.activeElement === document.body ||
                    document.activeElement === document.documentElement)
            ) {
                fallbackFocus?.()?.focus();
            }
        };
    }, []);

    useEffect(() => {
        if (pendingLeave !== null) {
            confirmLeaveButton.current?.focus();
        }
    }, [pendingLeave]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setValidation(null);
        setFields({});

        if (subtaskTitle.trim() !== '') {
            setValidation('Нажмите «Добавить», чтобы создать подзадачу.');
            return;
        }

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
                parent_id: task?.parent_id ?? null,
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
                setValidation(first !== undefined && first !== '' ? null : 'Проверьте данные');
            } else {
                let validationMessage: string | null = 'Проверьте данные';
                if (issue instanceof Error) {
                    validationMessage = issue.message === '' ? null : issue.message;
                }
                setValidation(validationMessage);
            }
        }
    }

    async function addSubtask() {
        const title = subtaskTitle.trim();
        const form = dialog.current?.querySelector('form');
        if (title === '' || form === null || form === undefined || isBusy) return;

        setValidation(null);
        setFields({});
        try {
            let newParentInput: TaskInput | null = null;
            if (task === null) {
                assertFormTimeZone(formZone);
                const data = new FormData(form);
                newParentInput = taskInputSchema.parse({
                    title: data.get('title'),
                    description: data.get('description'),
                    start: resolveDateField(String(data.get('start')), undefined, 'start'),
                    end: resolveDateField(String(data.get('end')), undefined, 'end'),
                    status: data.get('status'),
                    priority: data.get('priority'),
                    isUrgent: data.get('urgent') === 'on',
                    parent_id: null,
                });
            }
            scrollPosition.current = dialog.current?.scrollTop ?? 0;
            setIsSavingSubtasks(true);
            if (await onAddSubtask(title, newParentInput)) {
                setSubtaskTitle('');
                if (task !== null) scrollPosition.current = null;
            } else {
                scrollPosition.current = null;
            }
        } catch (issue) {
            if (issue instanceof ZodError) {
                const errors = validationFields(issue);
                setFields(errors);
                const first = Object.keys(errors)[0];
                if (first !== undefined && first !== '') {
                    form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
                }
                setValidation(first !== undefined && first !== '' ? null : 'Проверьте данные');
            } else {
                setValidation(issue instanceof Error ? issue.message : 'Проверьте данные');
            }
        } finally {
            setIsSavingSubtasks(false);
        }
    }

    function leave(target: Task | 'close', trigger: HTMLElement | null = null) {
        if (isDirty || subtaskTitle.trim() !== '') {
            pendingLeaveTrigger.current =
                trigger ??
                (document.activeElement instanceof HTMLElement ? document.activeElement : null);
            setPendingLeave(target);
            return;
        }
        if (target === 'close') onClose();
        else {
            returnFocusOnUnmount.current = false;
            onNavigate(target);
        }
    }

    function confirmLeave() {
        const target = pendingLeave;
        setPendingLeave(null);
        pendingLeaveTrigger.current = null;
        if (target === 'close') onClose();
        else if (target !== null) {
            returnFocusOnUnmount.current = false;
            onNavigate(target);
        }
    }

    function cancelLeave() {
        setPendingLeave(null);
        if (pendingLeaveTrigger.current?.isConnected === true) {
            pendingLeaveTrigger.current.focus();
        }
        pendingLeaveTrigger.current = null;
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
            leave('close');
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
                event.preventDefault();
                if (isBusy) {
                    return;
                } else {
                    leave('close');
                }
            }}
        >
            <form
                onSubmit={submit}
                onInput={(event) => {
                    if (!(
                        event.target instanceof HTMLInputElement &&
                        event.target.closest('.subtask-section')
                    )) {
                        setIsDirty(true);
                    }
                }}
                noValidate
            >
                <div className="dialog-heading">
                    <div>
                        {parents.length > 0 && (
                            <nav className="task-breadcrumbs" aria-label="Родительские задачи">
                                {parents.map((parent, index) => (
                                    <span key={parent.id}>
                                        {index > 0 && <span aria-hidden="true"> › </span>}
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={(event) => leave(parent, event.currentTarget)}
                                        >
                                            {parent.title}
                                        </button>
                                    </span>
                                ))}
                            </nav>
                        )}
                        <h2 id="task-dialog-title">
                            {task !== null ? 'Редактировать задачу' : 'Новая задача'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Закрыть"
                        disabled={isBusy}
                        onClick={(event) => leave('close', event.currentTarget)}
                    >
                        ×
                    </button>
                </div>
                {pendingLeave !== null && (
                    <div
                        className="delete-confirm"
                        role="alertdialog"
                        aria-label="Несохранённые изменения"
                    >
                        <p>Несохранённые изменения будут потеряны. Продолжить?</p>
                        <button
                            ref={confirmLeaveButton}
                            type="button"
                            className="danger-button"
                            onClick={confirmLeave}
                        >
                            Продолжить
                        </button>
                        <button type="button" className="ghost-button" onClick={cancelLeave}>
                            Остаться
                        </button>
                    </div>
                )}
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
                            onChange={(value) => {
                                setStatus(value);
                                setIsDirty(true);
                            }}
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
                            onChange={(value) => {
                                setPriority(value);
                                setIsDirty(true);
                            }}
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
                <section className="subtask-section" aria-labelledby="subtasks-title">
                    <h3 id="subtasks-title">Подзадачи</h3>
                    {isSavingSubtasks && (
                        <p className="subtask-saving" role="status" aria-live="polite">
                            Сохраняем подзадачу…
                        </p>
                    )}
                    {level >= MAX_TASK_LEVEL && subtasks.length === 0 && (
                        <p className="field-note">Пока нет подзадач</p>
                    )}
                    {subtasks.length > 0 && (
                        <ul className="subtask-list">
                            {subtasks.map((child) => (
                                <li key={child.id}>
                                    <label className="checkbox">
                                        <input
                                            type="checkbox"
                                            checked={child.status === 'done'}
                                            disabled={isBusy}
                                            onChange={() => void onToggleSubtask(child)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="subtask-link"
                                        disabled={isBusy}
                                        onClick={(event) => leave(child, event.currentTarget)}
                                    >
                                        {child.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {level < MAX_TASK_LEVEL && (
                        <div className="subtask-add">
                            <input
                                aria-label="Название подзадачи"
                                placeholder="Новая подзадача"
                                value={subtaskTitle}
                                maxLength={200}
                                disabled={isBusy}
                                onChange={(event) => setSubtaskTitle(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void addSubtask();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                className="ghost-button"
                                disabled={isBusy || isSavingSubtasks || subtaskTitle.trim() === ''}
                                onClick={() => void addSubtask()}
                            >
                                Добавить
                            </button>
                        </div>
                    )}
                </section>
                {(validation !== null || error !== null) && (
                    <p role="alert" className="form-error">
                        {validation ?? error}
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
                        <p>
                            Удалить «{task?.title}»
                            {descendantCount > 0 && ` и все её подзадачи (${descendantCount})`}?
                            Восстановить задачи будет нельзя.
                        </p>
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
                        onClick={(event) => leave('close', event.currentTarget)}
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
