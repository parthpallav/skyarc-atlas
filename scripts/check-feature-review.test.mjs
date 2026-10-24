import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_CASES, validateRegistry, validateReviewRecords } from './check-feature-review.mjs';

const registry = () => ({schemaVersion: 1, status: 'design-only', groups: [
  {id: 'catalog', owner: 'Atlas', audiences: ['planner'], dependsOn: [], runtimeStatus: 'planned', offBehavior: 'Keep all stored inventory and existing references available.'},
  {id: 'planning', owner: 'Atlas', audiences: ['planner'], dependsOn: ['catalog'], runtimeStatus: 'planned', offBehavior: 'Keep saved plans and block only new plan generation.'}
], profiles: {launch: ['catalog', 'planning']}});
const record = () => ({path: '.github/feature-reviews/change.json', record: {
  schemaVersion: 1, summary: 'Preserve planner behaviour while simplifying the review page.',
  groups: ['planning'], reviewedPaths: ['apps/web/page.tsx'],
  checks: Object.fromEntries(REQUIRED_CASES.map(name => [name, {status: 'not-applicable', evidence: 'Fixture only: no runtime action changes in this example.'}]))
}});

test('accepts a valid dependency-closed design registry', () => assert.deepEqual(validateRegistry(registry()), []));
test('rejects cycles and missing dependencies', () => {
  const value = registry(); value.groups[0].dependsOn = ['planning', 'unknown'];
  assert.match(validateRegistry(value).join(' '), /cycle/);
  assert.match(validateRegistry(value).join(' '), /unknown dependency/);
});
test('rejects a profile without a required dependency', () => {
  const value = registry(); value.profiles.launch = ['planning'];
  assert.match(validateRegistry(value).join(' '), /requires catalog/);
});
test('rejects false runtime implementation claims', () => {
  const value = registry(); value.groups[0].runtimeStatus = 'live';
  assert.match(validateRegistry(value).join(' '), /runtime status/);
});
test('requires a changed review record and exact file coverage', () => {
  assert.match(validateReviewRecords(registry(), ['apps/web/page.tsx'], []).join(' '), /Add or update/);
  assert.match(validateReviewRecords(registry(), ['apps/web/other.tsx'], [record()]).join(' '), /Missing reviewed path/);
});
test('rejects unknown groups, blocked checks and placeholder evidence', () => {
  const value = record(); value.record.groups = ['missing'];
  value.record.checks.authorization.status = 'blocked';
  value.record.checks.customer.evidence = 'TODO fill in customer review evidence';
  const errors = validateReviewRecords(registry(), ['apps/web/page.tsx'], [value]).join(' ');
  assert.match(errors, /valid feature groups/); assert.match(errors, /authorization/); assert.match(errors, /customer/);
});
test('requires plan maintenance when the registry changes', () => {
  const value = record(); value.record.reviewedPaths = ['config/feature-groups.json'];
  assert.match(validateReviewRecords(registry(), ['config/feature-groups.json'], [value]).join(' '), /update the lean launch plan/);
});
test('accepts reviewed file coverage, including deletion paths', () => {
  assert.deepEqual(validateReviewRecords(registry(), ['apps/web/page.tsx', record().path], [record()]), []);
});

test('CLI checks committed Git diffs and rejects missing evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-review-'));
  const git = (...args) => execFileSync('git', args, {cwd: directory, encoding: 'utf8'}).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    mkdirSync(join(directory, 'config'));
    writeFileSync(join(directory, 'config/feature-groups.json'), JSON.stringify(registry()));
    git('add', '.'); git('commit', '-qm', 'Baseline'); const base = git('rev-parse', 'HEAD');
    mkdirSync(join(directory, 'apps/web'), {recursive: true});
    writeFileSync(join(directory, 'apps/web/page.tsx'), 'export default function Page() { return null; }');
    git('add', '.'); git('commit', '-qm', 'Change without evidence');
    const script = fileURLToPath(new URL('./check-feature-review.mjs', import.meta.url));
    const run = () => spawnSync(process.execPath, [script, '--base', base, '--head', 'HEAD'], {cwd: directory, encoding: 'utf8'});
    const failed = run(); assert.equal(failed.status, 1); assert.match(failed.stderr, /Add or update/);
    mkdirSync(join(directory, '.github/feature-reviews'), {recursive: true});
    writeFileSync(join(directory, record().path), JSON.stringify(record().record));
    git('add', '.'); git('commit', '-qm', 'Add coverage');
    const passed = run(); assert.equal(passed.status, 0, passed.stderr); assert.match(passed.stdout, /Review contract passed/);
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
