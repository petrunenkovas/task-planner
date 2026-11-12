import { PRIORITIES, STATUSES, taskInputSchema, type Task } from '../../../lib/task';

const TITLES = [
    'Собрать требования',
    'Определить структуру задач',
    'Подготовить макеты',
    'Согласовать сценарии',
    'Настроить рабочее окружение',
    'Собрать список задач',
    'Добавить фильтры',
    'Подготовить доску',
    'Проверить перетаскивание',
    'Спроектировать диаграмму',
    'Настроить шкалу времени',
    'Проверить часовые пояса',
    'Добавить подзадачи',
    'Настроить импорт',
    'Проверить резервную копию',
    'Улучшить навигацию',
    'Проверить мобильный экран',
    'Проверить доступность',
    'Подготовить демо-данные',
    'Написать браузерные сценарии',
    'Настроить проверки кода',
    'Обновить документацию',
    'Провести проверку релиза',
    'Подготовить презентацию',
] as const;

const DAY = 24 * 60 * 60 * 1_000;

export function createDemoTasks(now = new Date()): Task[] {
    const origin = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 9);
    const timestamp = now.toISOString();
    const roots = TITLES.map((title, index) => {
        const input = taskInputSchema.parse({
            title,
            description: `Пример задачи для знакомства с планировщиком: ${title.toLowerCase()}.`,
            start: new Date(origin + index * 14 * DAY).toISOString(),
            end: new Date(origin + (index * 14 + 12 + (index % 3) * 2) * DAY).toISOString(),
            status: STATUSES[index % STATUSES.length],
            priority: PRIORITIES[index % PRIORITIES.length],
            isUrgent: index % 7 === 0,
            parent_id: null,
        });
        return {
            ...input,
            id: crypto.randomUUID(),
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
    });
    const children = roots
        .filter((_, index) => index % 4 === 0)
        .map((parent) => ({
            ...parent,
            id: crypto.randomUUID(),
            title: `Проверить: ${parent.title.toLowerCase()}`,
            description: '',
            parent_id: parent.id,
        }));
    return [...roots, ...children];
}
