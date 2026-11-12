import { useEffect, useRef, type MouseEvent } from 'react';

type Props = {
    title: string;
    descendantCount: number;
    isDeleting: boolean;
    error: string | null;
    returnFocus: HTMLElement | null;
    onClose: () => void;
    onConfirm: () => void;
};

export function DeleteTaskDialog({
    title,
    descendantCount,
    isDeleting,
    error,
    returnFocus,
    onClose,
    onConfirm,
}: Props) {
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        return () => {
            element?.close();
            returnFocus?.focus();
        };
    }, [returnFocus]);

    function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
        if (isDeleting || event.target !== event.currentTarget) return;
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
            className="delete-task-dialog"
            aria-labelledby="delete-task-title"
            aria-describedby="delete-task-description"
            onCancel={(event) => {
                event.preventDefault();
                if (!isDeleting) onClose();
            }}
            onClick={closeFromBackdrop}
        >
            <h2 id="delete-task-title">Удалить задачу?</h2>
            <p id="delete-task-description">
                «{title}» будет удалена без возможности восстановления.
                {descendantCount > 0 && (
                    <span> Вместе с ней будут удалены подзадачи: {descendantCount}.</span>
                )}
            </p>
            {error !== null && (
                <p role="alert" className="form-error">
                    {error}
                </p>
            )}
            <div className="delete-task-dialog-actions">
                <button
                    type="button"
                    className="ghost-button"
                    disabled={isDeleting}
                    onClick={onClose}
                >
                    Отмена
                </button>
                <button
                    type="button"
                    className="danger-button"
                    disabled={isDeleting}
                    onClick={onConfirm}
                >
                    {isDeleting ? 'Удаляем…' : 'Удалить задачу'}
                </button>
            </div>
        </dialog>
    );
}
