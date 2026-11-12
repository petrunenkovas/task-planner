import { expect, test } from '@playwright/test';

test('list column settings select all fields and reset to required fields', async ({ page }) => {
    const taskTitle = 'Задача для проверки колонок';
    const optionalColumns = [
        'Описание',
        'Начало',
        'Конец',
        'Длительность',
        'Статус',
        'Приоритет',
        'Срочность',
    ];

    await page.goto('/#/tasks/new');
    await page.getByRole('textbox', { name: 'Название задачи' }).fill(taskTitle);
    await expect(page).toHaveURL(/#\/tasks\/[0-9a-f-]+$/);
    await page.getByRole('link', { name: 'Список' }).click();
    await expect(page.getByRole('link', { name: taskTitle })).toBeVisible();

    await page.locator('summary[aria-label="Настроить колонки"]').click();
    await page.getByRole('button', { name: 'Выбрать все' }).click();

    for (const column of optionalColumns) {
        await expect(page.getByRole('columnheader', { name: new RegExp(column) })).toBeVisible();
    }
    for (const checkbox of await page.getByRole('checkbox').all()) {
        await expect(checkbox).toBeChecked();
    }

    await page.getByRole('button', { name: 'Сбросить все' }).click();

    await expect(page.getByRole('columnheader', { name: /Название/ })).toBeVisible();
    for (const column of optionalColumns) {
        await expect(page.getByRole('columnheader', { name: new RegExp(column) })).toHaveCount(0);
    }
});
