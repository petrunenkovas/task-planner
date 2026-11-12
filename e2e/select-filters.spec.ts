import { expect, test } from '@playwright/test';

test('select saves a task status and multiselect filters one or both statuses', async ({
    page,
}) => {
    const newTask = 'Новая задача для проверки фильтра';
    const doneTask = 'Завершённая задача для проверки фильтра';

    await page.goto('/#/tasks/new');
    await page.getByRole('textbox', { name: 'Название задачи' }).fill(newTask);
    await expect(page).toHaveURL(/#\/tasks\/[0-9a-f-]+$/);

    await page.getByRole('link', { name: /Новая задача/ }).click();
    await page.getByRole('textbox', { name: 'Название задачи' }).fill(doneTask);
    await expect(page).toHaveURL(/#\/tasks\/[0-9a-f-]+$/);
    await page.getByRole('button', { name: 'Статус: Новая' }).click();
    await page
        .getByRole('listbox', { name: 'Статус' })
        .getByRole('option', { name: 'Завершена' })
        .click();
    await expect(page.getByRole('button', { name: 'Статус: Завершена' })).toBeVisible();

    await page.getByRole('link', { name: 'Список' }).click();
    await expect(page).toHaveURL(/#\/list$/);
    await expect(page.getByRole('link', { name: doneTask })).toBeVisible();
    await page.getByRole('link', { name: doneTask }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Статус: Завершена' })).toBeVisible();

    await page.getByRole('link', { name: 'Список' }).click();
    await expect(page.getByRole('link', { name: newTask })).toBeVisible();
    await expect(page.getByRole('link', { name: doneTask })).toBeVisible();

    await page.getByRole('button', { name: 'Фильтры' }).click();
    const dialog = page.getByRole('dialog', { name: 'Фильтры' });
    await dialog.getByRole('button', { name: 'Статус: Все статусы' }).click();
    await dialog
        .getByRole('listbox', { name: 'Статус' })
        .getByRole('option', { name: 'Завершена' })
        .click();
    await dialog.getByRole('button', { name: 'Статус: Завершена' }).click();
    await dialog.getByRole('button', { name: /^Показать \d+/ }).click();
    await expect(page.getByRole('link', { name: doneTask })).toBeVisible();
    await expect(page.getByRole('link', { name: newTask })).toHaveCount(0);

    await page.getByRole('button', { name: /^Фильтры/ }).click();
    await dialog.getByRole('button', { name: 'Статус: Завершена' }).click();
    await dialog
        .getByRole('listbox', { name: 'Статус' })
        .getByRole('option', { name: 'Новая' })
        .click();
    await expect(dialog.getByRole('button', { name: 'Статус: Новая, Завершена' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Статус: Новая, Завершена' }).click();
    await dialog.getByRole('button', { name: /^Показать \d+/ }).click();
    await expect(page.getByRole('link', { name: newTask })).toBeVisible();
    await expect(page.getByRole('link', { name: doneTask })).toBeVisible();
});
