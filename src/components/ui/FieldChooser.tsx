import { useEffect, useRef } from 'react';

export type FieldOption<T extends string> = { id: T; label: string; isRequired?: boolean };

type Props<T extends string> = {
    label: string;
    options: readonly FieldOption<T>[];
    selected: readonly T[];
    onChange: (selected: T[]) => void;
};

export function FieldChooser<T extends string>({ label, options, selected, onChange }: Props<T>) {
    const chooser = useRef<HTMLDetailsElement>(null);
    const trigger = useRef<HTMLElement>(null);

    useEffect(() => {
        function closeOutside(event: PointerEvent | FocusEvent) {
            if (
                chooser.current?.open &&
                event.target instanceof Node &&
                !chooser.current.contains(event.target)
            ) {
                chooser.current.open = false;
            }
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (
                event.key === 'Escape' &&
                chooser.current?.open &&
                event.target instanceof Node &&
                chooser.current.contains(event.target)
            ) {
                event.preventDefault();
                chooser.current.open = false;
                trigger.current?.focus();
            }
        }

        document.addEventListener('pointerdown', closeOutside);
        document.addEventListener('focusin', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            document.removeEventListener('focusin', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    return (
        <details ref={chooser} className="field-chooser">
            <summary ref={trigger} aria-label={label} title={label}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
                </svg>
            </summary>
            <div className="field-options">
                <div className="field-options-actions">
                    <button type="button" onClick={() => onChange(options.map(({ id }) => id))}>
                        Выбрать все
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            onChange(
                                options
                                    .filter(({ isRequired }) => isRequired === true)
                                    .map(({ id }) => id),
                            )
                        }
                    >
                        Сбросить все
                    </button>
                </div>
                {options.map(({ id, label: fieldLabel, isRequired }) => (
                    <label key={id}>
                        <input
                            type="checkbox"
                            checked={selected.includes(id)}
                            disabled={isRequired}
                            onChange={() =>
                                onChange(
                                    selected.includes(id)
                                        ? selected.filter((field) => field !== id)
                                        : [...selected, id],
                                )
                            }
                        />
                        {fieldLabel}
                        {isRequired === true ? ' (обязательная)' : ''}
                    </label>
                ))}
            </div>
        </details>
    );
}
