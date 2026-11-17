import assert from 'node:assert/strict';
import test from 'node:test';
import { getTaskTransitionError, hasBugFixHandoffEvidence, hasTaskImplementationEvidence } from './developer-workflow.service';

test('developer task transitions follow the execution and review flow', () => {
  assert.equal(getTaskTransitionError('DEVELOPER', 'TO_DO', 'IN_PROGRESS'), null);
  assert.equal(getTaskTransitionError('DEVELOPER', 'IN_PROGRESS', 'IN_REVIEW'), null);
  assert.equal(getTaskTransitionError('DEVELOPER', 'TO_DO', 'DONE'), 'A task cannot move from TO_DO to DONE.');
  assert.equal(getTaskTransitionError('PROJECT_MANAGER', 'TO_DO', 'DONE'), null);
});

test('review and completion require implementation notes or a pull request URL', () => {
  assert.equal(hasTaskImplementationEvidence('  ', null), false);
  assert.equal(hasTaskImplementationEvidence('Change implemented', null), true);
  assert.equal(hasTaskImplementationEvidence(null, 'https://github.com/acme/app/pull/42'), true);
});

test('bug retest handoff requires notes and a pull request URL or commit hash', () => {
  assert.equal(hasBugFixHandoffEvidence('Fix details', null, null), false);
  assert.equal(hasBugFixHandoffEvidence('  ', null, 'a1b2c3d'), false);
  assert.equal(hasBugFixHandoffEvidence('Fix details', 'https://github.com/acme/app/pull/42', null), true);
  assert.equal(hasBugFixHandoffEvidence('Fix details', null, 'a1b2c3d'), true);
});
