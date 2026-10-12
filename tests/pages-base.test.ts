import test from 'node:test';
import assert from 'node:assert/strict';
import { pagesBase } from '../pages-base';

test('Pages uses root for user sites and repository path for project sites', () => {
    assert.equal(pagesBase(undefined), '/');
    assert.equal(pagesBase(''), '/');
    assert.equal(pagesBase('owner'), '/');
    assert.equal(pagesBase('owner/owner.github.io'), '/');
    assert.equal(pagesBase('Owner/OWNER.github.io'), '/');
    assert.equal(pagesBase('owner/task-planner'), '/task-planner/');
});
