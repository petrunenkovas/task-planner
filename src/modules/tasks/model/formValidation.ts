import { ZodError } from 'zod';
import { resolveInputInstant } from '../../../lib/time';

export type FieldErrors = Partial<
    Record<'title' | 'description' | 'start' | 'end' | 'status' | 'priority', string>
>;

export function validationFields(error: ZodError): FieldErrors {
    const fields: FieldErrors = {};
    error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof FieldErrors;
        if (
            ['title', 'description', 'start', 'end', 'status', 'priority'].includes(field) &&
            fields[field] === undefined
        ) {
            fields[field] = issue.message;
        }
    });
    return fields;
}

export function resolveDateField(
    value: string,
    original: string | undefined,
    field: 'start' | 'end',
): string {
    try {
        return resolveInputInstant(value, original);
    } catch (error) {
        throw new ZodError([
            {
                code: 'custom',
                path: [field],
                message: error instanceof Error ? error.message : 'Проверьте дату',
            },
        ]);
    }
}
