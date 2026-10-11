import { HOUR } from './task';

export function systemTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function localInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
// Matching all nearby UTC candidates also detects repeated and skipped DST hours.
export function parseLocalInput(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
        throw new Error('Укажите корректные дату и время');
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || localInput(date) !== value) {
        throw new Error('Этот час не существует в системном часовом поясе. Выберите другое время.');
    }

    const candidates = new Set<number>();
    Array.from({ length: 25 }, (_, index) => -3 * HOUR + index * (HOUR / 4)).forEach((delta) => {
        const candidate = new Date(date.getTime() + delta);
        if (localInput(candidate) === value) {
            candidates.add(candidate.getTime());
        }
    });

    if (candidates.size > 1) {
        throw new Error(
            'Этот час повторяется при переводе часов. Выберите соседний однозначный час.',
        );
    }

    return date.toISOString();
}

export function dateLabel(value: string): string {
    return new Intl.DateTimeFormat('ru', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

export function durationLabel(start: string, end: string): string {
    const totalHours = Math.floor((Date.parse(end) - Date.parse(start)) / HOUR);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days === 0) {
        return `${hours} ч`;
    }
    if (hours === 0) {
        return `${days} дн`;
    }
    return `${days} дн ${hours} ч`;
}

export function nextHour(): Date {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    if (date.getTime() < Date.now()) {
        date.setHours(date.getHours() + 1, 0, 0, 0);
    }
    return date;
}

export function assertFormTimeZone(expected: string): void {
    if (systemTimeZone() !== expected) {
        throw new Error(
            'Системный часовой пояс изменился. Закройте форму и откройте её заново, чтобы сохранить корректные сроки.',
        );
    }
}

export function resolveInputInstant(
    value: string,
    original: string | undefined = undefined,
): string {
    if (original !== undefined && value === localInput(new Date(original))) {
        return original;
    }

    return parseLocalInput(value);
}
