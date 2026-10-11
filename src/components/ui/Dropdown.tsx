import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

export type DropdownOption<T extends string = string> = { value: T; label: string };

const MENU_GAP = 4;
const VIEWPORT_GAP = 20;
const MINIMUM_MENU_HEIGHT = 42;

export type DropdownProps<T extends string> = {
    label: string;
    placeholder?: string;
    options: DropdownOption<T>[];
    selected: readonly T[];
    onChoose: (value: T) => void;
    isMultiple: boolean;
    name?: string;
    isDisabled?: boolean;
    isInvalid?: boolean;
    describedBy?: string;
};

export function Dropdown<T extends string>({
    label,
    placeholder,
    options,
    selected,
    onChoose,
    isMultiple,
    name,
    isDisabled = false,
    isInvalid = false,
    describedBy,
}: DropdownProps<T>) {
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const selectedOptions = options.filter(({ value }) => selected.includes(value));
    let valueLabel = selectedOptions[0]?.label ?? placeholder ?? options[0]?.label ?? 'Выбрать';
    if (isMultiple && selected.length > 0) {
        valueLabel = selectedOptions.map(({ label: optionLabel }) => optionLabel).join(', ');
    } else if (isMultiple) {
        valueLabel = placeholder ?? options[0]?.label ?? 'Выбрать';
    }

    useLayoutEffect(() => {
        const element = menu.current;
        if (!isOpen || element === null) {
            return;
        }

        const viewportBottom = () => {
            const viewport = window.visualViewport;
            return viewport !== null && viewport !== undefined
                ? viewport.offsetTop + viewport.height
                : window.innerHeight;
        };
        const viewportTop = () => window.visualViewport?.offsetTop ?? 0;

        const positionMenu = () => {
            const bounds = trigger.current?.getBoundingClientRect();
            if (bounds === undefined) {
                return;
            }

            const top = bounds.bottom + MENU_GAP;
            element.style.left = `${bounds.left}px`;
            element.style.top = `${top}px`;
            element.style.width = `${bounds.width}px`;
            element.style.maxHeight = `${Math.max(0, viewportBottom() - top - VIEWPORT_GAP)}px`;
        };

        const makeRoomAndPosition = () => {
            const bounds = trigger.current?.getBoundingClientRect();
            if (
                bounds !== undefined &&
                viewportBottom() - bounds.bottom - MENU_GAP - VIEWPORT_GAP < MINIMUM_MENU_HEIGHT
            ) {
                trigger.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
            }
            positionMenu();
        };

        const isTriggerVisible = (bounds: DOMRect) => {
            let visibleTop = viewportTop();
            let visibleBottom = viewportBottom();

            const ancestors: HTMLElement[] = [];
            let parent = trigger.current?.parentElement ?? null;
            while (parent !== null) {
                ancestors.push(parent);
                parent = parent.parentElement;
            }
            ancestors
                .filter((ancestor) =>
                    ['auto', 'scroll', 'hidden', 'clip'].includes(
                        getComputedStyle(ancestor).overflowY,
                    ),
                )
                .forEach((ancestor) => {
                    const clippingBounds = ancestor.getBoundingClientRect();
                    visibleTop = Math.max(visibleTop, clippingBounds.top);
                    visibleBottom = Math.min(visibleBottom, clippingBounds.bottom);
                });

            return bounds.bottom > visibleTop && bounds.top < visibleBottom;
        };

        const closeMenu = () => {
            if (element.contains(document.activeElement)) {
                trigger.current?.focus({ preventScroll: true });
            }
            setIsOpen(false);
        };

        const updateOrClose = () => {
            const bounds = trigger.current?.getBoundingClientRect();
            if (
                bounds === undefined ||
                !isTriggerVisible(bounds) ||
                viewportBottom() - bounds.bottom - MENU_GAP - VIEWPORT_GAP < MINIMUM_MENU_HEIGHT
            ) {
                closeMenu();
                return;
            }
            positionMenu();
        };

        const onTriggerResize = () => {
            const bounds = trigger.current?.getBoundingClientRect();
            if (bounds === undefined || !isTriggerVisible(bounds)) {
                closeMenu();
                return;
            }
            makeRoomAndPosition();
            const resizedBounds = trigger.current?.getBoundingClientRect();
            if (
                resizedBounds === undefined ||
                viewportBottom() - resizedBounds.bottom - MENU_GAP - VIEWPORT_GAP <
                    MINIMUM_MENU_HEIGHT
            ) {
                closeMenu();
            }
        };

        const onScroll = (event: Event) => {
            if (!element.contains(event.target as Node)) {
                updateOrClose();
            }
        };

        makeRoomAndPosition();
        element.showPopover();
        const triggerObserver = new ResizeObserver(onTriggerResize);
        if (trigger.current !== null) {
            triggerObserver.observe(trigger.current);
        }
        document.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', updateOrClose);
        window.visualViewport?.addEventListener('resize', updateOrClose);
        window.visualViewport?.addEventListener('scroll', updateOrClose);

        return () => {
            triggerObserver.disconnect();
            document.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', updateOrClose);
            window.visualViewport?.removeEventListener('resize', updateOrClose);
            window.visualViewport?.removeEventListener('scroll', updateOrClose);
            if (element.matches(':popover-open')) {
                element.hidePopover();
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const closeOutside = (event: PointerEvent) => {
            if (root.current?.contains(event.target as Node) !== true) {
                setIsOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen(false);
                trigger.current?.focus();
            }
        };

        document.addEventListener('pointerdown', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isOpen]);

    function choose(value: T) {
        onChoose(value);
        if (!isMultiple) {
            setIsOpen(false);
            trigger.current?.focus();
        }
    }

    function focusOption(event: ReactKeyboardEvent<HTMLButtonElement>) {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            return;
        }

        event.preventDefault();
        const items = Array.from(
            menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
        );
        if (items.length === 0) {
            return;
        }

        const currentIndex = items.indexOf(event.currentTarget);
        let nextIndex = currentIndex;
        if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = items.length - 1;
        } else {
            nextIndex =
                (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        }
        items[nextIndex]?.focus();
    }

    function openFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            return;
        }

        event.preventDefault();
        setIsOpen(true);
        const key = event.key;
        requestAnimationFrame(() => {
            const items = menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
            const selectedIndex = options.findIndex(({ value }) => selected.includes(value));
            const index = selectedIndex >= 0 ? selectedIndex : 0;
            (key === 'ArrowUp' ? items?.[items.length - 1] : items?.[index])?.focus();
        });
    }

    return (
        <div ref={root} className={`dropdown-select ${isOpen ? 'is-open' : ''}`}>
            {name !== undefined &&
                name !== '' &&
                (selected.length > 0 ? selected : ['']).map((value, index) => (
                    <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
                ))}
            <button
                ref={trigger}
                type="button"
                className="dropdown-select-trigger"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={`${label}: ${valueLabel}`}
                aria-invalid={isInvalid || undefined}
                aria-describedby={describedBy}
                data-field-name={name}
                disabled={isDisabled}
                onClick={() => setIsOpen((value) => !value)}
                onKeyDown={openFromKeyboard}
            >
                <span>{valueLabel}</span>
                <span className="select-chevron" aria-hidden="true" />
            </button>
            {isOpen && (
                <div
                    ref={menu}
                    className="dropdown-select-menu"
                    popover="manual"
                    role="listbox"
                    aria-label={label}
                    aria-multiselectable={isMultiple || undefined}
                >
                    {options.map(({ value, label: optionLabel }) => {
                        const isSelectedOption = selected.includes(value);

                        return (
                            <button
                                key={value}
                                type="button"
                                role="option"
                                aria-selected={isSelectedOption}
                                className="dropdown-select-option"
                                onClick={() => choose(value)}
                                onKeyDown={focusOption}
                            >
                                {optionLabel}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
