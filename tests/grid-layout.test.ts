import test from 'node:test';
import assert from 'node:assert/strict';
import { taskColumnWidth, taskGridLayout } from '../src/modules/gantt/model/gridLayout';
import { TASK_COLUMN_IDS } from '../src/lib/taskFields';

test('grid uses the sum of fixed selected column widths instead of shrinking or stretching columns', () => {
    assert.equal(taskGridLayout(['title'], { isCompact: false, isHidden: false }).gridWidth, 220);
    assert.equal(
        taskGridLayout(['title', 'status', 'start'], { isCompact: false, isHidden: false })
            .gridWidth,
        540,
    );
    assert.equal(
        taskGridLayout(['title', 'status', 'start'], { isCompact: true, isHidden: false })
            .gridWidth,
        470,
    );
    for (const compact of [false, true]) {
        const layout = taskGridLayout([...TASK_COLUMN_IDS], {
            isCompact: compact,
            isHidden: false,
        });
        assert.equal(
            layout.gridWidth,
            TASK_COLUMN_IDS.reduce(
                (sum, id) => sum + taskColumnWidth(id, { isCompact: compact }),
                0,
            ),
        );
        assert.ok(layout.minimumWidth >= layout.gridWidth + 324);
    }
});

test('visible grid avoids SVAR automatic grid-only mode while mobile collapse restores narrow chart', () => {
    assert.equal(taskGridLayout(['title'], { isCompact: true, isHidden: false }).minimumWidth, 651);
    assert.equal(
        taskGridLayout(['title', 'start'], { isCompact: true, isHidden: true }).minimumWidth,
        320,
    );
});
