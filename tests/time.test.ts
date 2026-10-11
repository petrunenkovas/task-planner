import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertFormTimeZone,
    durationLabel,
    localInput,
    parseLocalInput,
    resolveInputInstant,
    nextHour,
} from '../src/lib/time';
function inZone(zone: string, fn: () => void) {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
        fn();
    } finally {
        if (previous === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = previous;
        }
    }
}

test('duration label shows complete days and remaining hours', () => {
    assert.equal(durationLabel('2026-09-27T10:00:00.000Z', '2026-09-29T13:00:00.000Z'), '2 дн 3 ч');
    assert.equal(durationLabel('2026-09-27T10:00:00.000Z', '2026-09-29T10:00:00.000Z'), '2 дн');
    assert.equal(durationLabel('2026-09-27T10:00:00.000Z', '2026-09-27T13:00:00.000Z'), '3 ч');
});

test('local input round trips in Moscow and fractional-offset zones', () => {
    inZone('Europe/Moscow', () =>
        assert.equal(parseLocalInput('2026-09-27T10:00'), '2026-09-27T07:00:00.000Z'),
    );
    inZone('Asia/Kolkata', () => {
        assert.equal(parseLocalInput('2026-09-27T10:00'), '2026-09-27T04:30:00.000Z');
        assert.equal(localInput(new Date('2026-09-27T07:00:00Z')), '2026-09-27T12:30');
        assert.equal(
            parseLocalInput(localInput(new Date('2026-09-27T07:00:00Z'))),
            '2026-09-27T07:00:00.000Z',
        );
        assert.equal(nextHour().getMinutes(), 0);
    });
    inZone('Asia/Kathmandu', () =>
        assert.equal(parseLocalInput('2026-09-27T10:00'), '2026-09-27T04:15:00.000Z'),
    );
});
test('rejects DST skipped/repeated hours and invalid dates without silently picking an instant', () => {
    inZone('America/New_York', () => {
        assert.throws(() => parseLocalInput('2026-03-08T02:00'), /не существует/);
        assert.throws(() => parseLocalInput('2026-11-01T01:00'), /повторяется/);
        assert.equal(parseLocalInput('2026-11-01T03:00'), '2026-11-01T08:00:00.000Z');
        assert.throws(() => parseLocalInput('2026-02-30T10:00'), /не существует/);
    });
    inZone('Australia/Lord_Howe', () =>
        assert.throws(() => parseLocalInput('2026-04-05T01:30'), /повторяется/),
    );
});

test('open form detects a system timezone switch before parsing its old draft', () => {
    inZone('Asia/Kolkata', () =>
        assert.throws(() => assertFormTimeZone('Europe/Moscow'), /пояс изменился/),
    );
    inZone('Europe/Moscow', () => assert.doesNotThrow(() => assertFormTimeZone('Europe/Moscow')));
});

test('unchanged form values preserve original instants in fractional-offset zones and repeated DST hours', () => {
    inZone('Asia/Kolkata', () => {
        const original = '2026-09-27T07:00:00.000Z';

        assert.equal(resolveInputInstant('2026-09-27T12:30', original), original);
    });
    inZone('America/New_York', () => {
        const original = '2026-11-01T06:00:00.000Z';

        assert.equal(resolveInputInstant('2026-11-01T01:00', original), original);
        assert.throws(() => resolveInputInstant('2026-11-01T01:00'), /повторяется/);
    });
});
