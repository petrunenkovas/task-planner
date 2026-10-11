import test from 'node:test';
import assert from 'node:assert/strict';
import { taskColumnWidth, taskGridLayout } from '../src/modules/gantt/model/gridLayout';
import { TASK_COLUMN_IDS } from '../src/lib/taskFields';

test('grid uses the sum of fixed selected column widths instead of shrinking or stretching columns', () => {
    assert.equal(taskGridLayout(['title'], 'regular').gridWidth, 220);
    assert.equal(taskGridLayout(['title', 'status', 'start'], 'regular').gridWidth, 540);
    assert.equal(taskGridLayout(['title', 'status', 'start'], 'compact').gridWidth, 470);
    for (const mode of ['regular', 'compact'] as const) {
        const layout = taskGridLayout([...TASK_COLUMN_IDS], mode);
        assert.equal(
            layout.gridWidth,
            TASK_COLUMN_IDS.reduce((sum, id) => sum + taskColumnWidth(id, mode), 0),
        );
        assert.ok(layout.minimumWidth >= layout.gridWidth + 324);
    }
});

test('visible grid avoids SVAR automatic grid-only mode while mobile collapse restores narrow chart', () => {
    assert.equal(taskGridLayout(['title'], 'compact').minimumWidth, 651);
    assert.equal(taskGridLayout(['title', 'start'], 'chart-only').minimumWidth, 320);
});
