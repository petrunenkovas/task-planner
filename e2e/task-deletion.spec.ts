import { expect, test } from '@playwright/test';

test('deletion requires confirmation, preserves a cancelled draft and removes descendants', async ({
    page,
}) => {
    await page.goto('/#/tasks/new');

    const title = page.getByRole('textbox', { name: 'Название задачи' });
    await title.fill('Родительская задача для удаления');
    await expect(page).toHaveURL(/#\/tasks\/[0-9a-f-]+$/);

    const childTitle = 'Дочерняя задача для удаления';
    await page.getByRole('textbox', { name: 'Название подзадачи' }).fill(childTitle);
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    const childLink = page.getByRole('link', { name: childTitle });
    await expect(childLink).toBeVisible();
    const childHref = await childLink.getAttribute('href');
    expect(childHref).not.toBeNull();

    // An invalid title remains a local draft, so cancel must not replace it with stored data.
    await page.locator('.task-page-title-button').click();
    await title.fill('   ');
    await page.getByRole('button', { name: 'Удалить задачу', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Удалить задачу?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Вместе с ней будут удалены подзадачи: 1.');
    await expect(page.locator('.subtask-link')).toHaveCount(1);

    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toBeHidden();
    await page.locator('.task-page-title-button').click();
    await expect(page.getByRole('textbox', { name: 'Название задачи' })).toHaveValue('   ');

    await page.getByRole('button', { name: 'Удалить задачу', exact: true }).click();
    await dialog.getByRole('button', { name: 'Удалить задачу', exact: true }).click();
    await expect(page).toHaveURL(/#\/list$/);
    await expect(page.getByRole('heading', { name: 'Начните с первой задачи' })).toBeVisible();

    await page.goto(new URL(childHref!, page.url()).href);
    await expect(page.getByRole('heading', { name: 'Задача не найдена' })).toBeVisible();
});
