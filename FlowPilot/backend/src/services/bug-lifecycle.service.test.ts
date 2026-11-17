import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBugStatusTransitionError } from './bug-lifecycle.service';

test('requires an authorized quality role to run the retest lifecycle', () => {
  assert.equal(getBugStatusTransitionError('DEVELOPER', 'IN_PROGRESS', 'FIXED'), null);
  assert.equal(getBugStatusTransitionError('DEVELOPER', 'FIXED', 'RETEST')?.startsWith('Only QA'), true);
  assert.equal(getBugStatusTransitionError('QA_ENGINEER', 'FIXED', 'RETEST'), null);
  assert.equal(getBugStatusTransitionError('ADMIN', 'FIXED', 'RETEST'), null);
  assert.equal(getBugStatusTransitionError('PROJECT_MANAGER', 'FIXED', 'RETEST'), null);
  assert.equal(getBugStatusTransitionError('QA_ENGINEER', 'FIXED', 'CLOSED')?.startsWith('A bug cannot'), true);
  assert.equal(getBugStatusTransitionError('QA_ENGINEER', 'RETEST', 'CLOSED'), null);
});

test('QA, project managers, and admins can reopen verified bugs', () => {
  assert.equal(getBugStatusTransitionError('QA_ENGINEER', 'RETEST', 'REOPENED'), null);
  assert.equal(getBugStatusTransitionError('QA_ENGINEER', 'CLOSED', 'REOPENED'), null);
  assert.equal(getBugStatusTransitionError('PROJECT_MANAGER', 'CLOSED', 'REOPENED'), null);
  assert.equal(getBugStatusTransitionError('ADMIN', 'CLOSED', 'REOPENED'), null);
  assert.equal(getBugStatusTransitionError('DEVELOPER', 'CLOSED', 'REOPENED')?.startsWith('Only QA'), true);
});

test('preserves no-op status updates and legacy resolved bugs', () => {
  assert.equal(getBugStatusTransitionError('DEVELOPER', 'IN_PROGRESS', 'IN_PROGRESS'), null);
  assert.equal(getBugStatusTransitionError('QA_ENGINEER', 'RESOLVED', 'RETEST'), null);
});
