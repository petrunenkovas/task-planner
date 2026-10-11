import { PRIORITIES, STATUSES, type Priority, type Status, type Task } from './task';

export type Filters = {
    q: string;
    status: Status[];
    priority: Priority[];
    urgent: string;
};

export const EMPTY_FILTERS: Filters = {
    q: '',
    status: [],
    priority: [],
    urgent: '',
};

export function matchesFilters(task: Task, filters: Filters): boolean {
    const query = filters.q.trim().toLocaleLowerCase('ru');
    const searchableText = `${task.title}\n${task.description}`.toLocaleLowerCase('ru');
    const isMatchingQuery = query === '' || searchableText.includes(query);
    const isMatchingStatus = filters.status.length === 0 || filters.status.includes(task.status);
    const isMatchingPriority =
        filters.priority.length === 0 || filters.priority.includes(task.priority);
    const isMatchingUrgency = filters.urgent === '' || task.isUrgent === (filters.urgent === 'yes');

    return isMatchingQuery && isMatchingStatus && isMatchingPriority && isMatchingUrgency;
}

export function taskFiltersFromSearch(search: string): Filters {
    const params = new URLSearchParams(search);

    return {
        q: params.get('q') ?? '',
        status: STATUSES.filter((status) => params.getAll('status').includes(status)),
        priority: PRIORITIES.filter((priority) => params.getAll('priority').includes(priority)),
        urgent: ['yes', 'no'].includes(params.get('urgent') ?? '')
            ? (params.get('urgent') ?? '')
            : '',
    };
}

export function taskFiltersToSearch(filters: Filters): URLSearchParams {
    const params = new URLSearchParams();

    if (filters.q !== '') {
        params.set('q', filters.q);
    }
    STATUSES.forEach((status) => {
        if (filters.status.includes(status)) {
            params.append('status', status);
        }
    });
    PRIORITIES.forEach((priority) => {
        if (filters.priority.includes(priority)) {
            params.append('priority', priority);
        }
    });
    if (filters.urgent === 'yes' || filters.urgent === 'no') {
        params.set('urgent', filters.urgent);
    }

    return params;
}
