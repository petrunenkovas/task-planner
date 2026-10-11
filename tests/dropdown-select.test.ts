import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Select } from '../src/components/ui/Select';
import { MultiSelect } from '../src/components/ui/MultiSelect';

const options = [
    { value: 'planned', label: 'Запланирована' },
    { value: 'done', label: 'Завершена' },
];

test('Select renders one form value and the selected option label', () => {
    const html = renderToStaticMarkup(
        createElement(Select, {
            label: 'Статус',
            name: 'status',
            options,
            value: 'done',
            onChange: () => undefined,
        }),
    );

    assert.match(html, /type="hidden" name="status" value="done"/);
    assert.equal((html.match(/\sname="status"/g) ?? []).length, 1);
    assert.match(html, /aria-label="Статус: Завершена"/);
    assert.match(html, /aria-haspopup="listbox" aria-expanded="false"/);
});

test('MultiSelect renders selected labels and one form value per selection', () => {
    const html = renderToStaticMarkup(
        createElement(MultiSelect, {
            label: 'Статус',
            name: 'status',
            options,
            value: ['planned', 'done'],
            onChange: () => undefined,
        }),
    );

    assert.match(html, /type="hidden" name="status" value="planned"/);
    assert.match(html, /type="hidden" name="status" value="done"/);
    assert.equal((html.match(/\sname="status"/g) ?? []).length, 2);
    assert.match(html, /aria-label="Статус: Запланирована, Завершена"/);
});

test('an empty MultiSelect displays its placeholder and preserves an empty form value', () => {
    const html = renderToStaticMarkup(
        createElement(MultiSelect, {
            label: 'Статус',
            name: 'status',
            placeholder: 'Все статусы',
            options,
            value: [],
            onChange: () => undefined,
        }),
    );

    assert.match(html, /type="hidden" name="status" value=""/);
    assert.match(html, /aria-label="Статус: Все статусы"/);
});
