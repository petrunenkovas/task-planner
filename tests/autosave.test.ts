import test from 'node:test';
import assert from 'node:assert/strict';
import { AutosaveCoordinator } from '../src/modules/tasks/model/autosave';

test('default timers call host functions with the global receiver', () => {
    const originalSchedule = globalThis.setTimeout;
    const originalCancel = globalThis.clearTimeout;
    let scheduled = false;
    let cancelled = false;
    try {
        globalThis.setTimeout = function (this: typeof globalThis) {
            assert.equal(this, globalThis);
            scheduled = true;
            return 1 as unknown as ReturnType<typeof setTimeout>;
        } as unknown as typeof setTimeout;
        globalThis.clearTimeout = function (this: typeof globalThis) {
            assert.equal(this, globalThis);
            cancelled = true;
        } as unknown as typeof clearTimeout;

        const coordinator = new AutosaveCoordinator(async () => true);
        coordinator.changed();
        coordinator.dispose();
        assert.equal(scheduled, true);
        assert.equal(cancelled, true);
    } finally {
        globalThis.setTimeout = originalSchedule;
        globalThis.clearTimeout = originalCancel;
    }
});

test('autosave debounces edits and a flush cancels the pending timer', async () => {
    const timers = new Map<number, () => void>();
    let nextTimer = 0;
    let saves = 0;
    const coordinator = new AutosaveCoordinator(
        async () => {
            saves += 1;
            return true;
        },
        700,
        (callback) => {
            const id = ++nextTimer;
            timers.set(id, callback);
            return id as unknown as ReturnType<typeof setTimeout>;
        },
        (timer) => timers.delete(timer as unknown as number),
    );

    coordinator.changed();
    coordinator.changed();
    assert.equal(timers.size, 1);
    assert.equal(saves, 0);
    assert.equal(await coordinator.flush(), true);
    assert.equal(saves, 1);
    assert.equal(timers.size, 0);
    coordinator.dispose();
});

test('autosave serializes edits made during an in-flight save', async () => {
    let finishFirst: (value: boolean) => void = () => undefined;
    const first = new Promise<boolean>((resolve) => {
        finishFirst = resolve;
    });
    let saves = 0;
    const coordinator = new AutosaveCoordinator(async () => {
        saves += 1;
        return saves === 1 ? first : true;
    });

    coordinator.changed();
    const flushing = coordinator.flush();
    coordinator.changed();
    finishFirst(true);
    assert.equal(await flushing, true);
    assert.equal(saves, 2);
    coordinator.dispose();
});

test('discard cancels a pending debounce without saving', async () => {
    let saveCount = 0;
    const autosave = new AutosaveCoordinator(async () => {
        saveCount += 1;
        return true;
    });

    autosave.changed();
    assert.equal(autosave.discard(), true);
    assert.equal(await autosave.flush(), true);
    assert.equal(saveCount, 0);
    autosave.dispose();
});

test('discard waits for an active save and cancels the next debounced write', async () => {
    let finishSave: (value: boolean) => void = () => undefined;
    const first = new Promise<boolean>((resolve) => {
        finishSave = resolve;
    });
    let saves = 0;
    const coordinator = new AutosaveCoordinator(async () => {
        saves += 1;
        return first;
    });

    coordinator.changed();
    const saving = coordinator.flush();
    coordinator.changed();
    const discarding = coordinator.discardAfterCurrent();
    finishSave(true);

    await discarding;
    assert.equal(await saving, true);
    assert.equal(saves, 1);
    assert.equal(await coordinator.flush(), true);
    coordinator.dispose();
});
