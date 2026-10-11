import test from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import {
    INITIAL_MUTATION_STATUS,
    mutationStatusReducer,
} from '../src/modules/tasks/model/mutationStatus';
import { resolveDateField, validationFields } from '../src/modules/tasks/model/formValidation';

test('a successful concurrent operation cannot erase another operation failure', () => {
    let state = mutationStatusReducer(INITIAL_MUTATION_STATUS, { type: 'start' });
    state = mutationStatusReducer(state, { type: 'start' });
    state = mutationStatusReducer(state, { type: 'error', text: 'Connection failed' });
    state = mutationStatusReducer(state, { type: 'finish' });
    state = mutationStatusReducer(state, { type: 'success', text: 'Saved' });
    state = mutationStatusReducer(state, { type: 'finish' });
    assert.equal(state.pending, 0);
    assert.deepEqual(state.notice, { kind: 'error', text: 'Connection failed' });
    state = mutationStatusReducer(state, { type: 'start' });
    assert.equal(state.notice, null);
});

test('failure replaces an earlier success while dismiss preserves active save count', () => {
    let state = mutationStatusReducer(INITIAL_MUTATION_STATUS, { type: 'start' });
    state = mutationStatusReducer(state, { type: 'success', text: 'Created' });
    state = mutationStatusReducer(state, { type: 'error', text: 'Conflict' });
    assert.equal(state.notice?.kind, 'error');
    state = mutationStatusReducer(state, { type: 'dismiss' });
    assert.equal(state.pending, 1);
    assert.equal(state.notice, null);
});

test('validation maps first message per field and excludes unknown server properties', () => {
    const errors = validationFields(
        new ZodError([
            { code: 'custom', path: ['title'], message: 'Required' },
            { code: 'custom', path: ['title'], message: 'Another issue' },
            { code: 'custom', path: ['end'], message: 'Too short' },
            { code: 'custom', path: ['internal'], message: 'Excluded' },
        ]),
    );
    assert.deepEqual(errors, { title: 'Required', end: 'Too short' });
});

test('invalid date input identifies its field', () => {
    assert.throws(
        () => resolveDateField('', undefined, 'end'),
        (issue) => {
            assert.ok(issue instanceof ZodError);
            assert.ok(validationFields(issue).end);
            return true;
        },
    );
});

test('a stale success timeout cannot dismiss a newer error', () => {
    const state = mutationStatusReducer(
        { pending: 0, notice: { kind: 'error', text: 'Failed' } },
        { type: 'expire-success' },
    );
    assert.equal(state.notice?.kind, 'error');
});
