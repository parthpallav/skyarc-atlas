import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_CASES = ['preservation', 'customer', 'planner', 'flagsOnOff',
  'authorization', 'integrations', 'migrationRollback', 'validation', 'documentation'];
const meaningful = value => typeof value === 'string' && value.trim().length >= 20 &&
  !/\b(TODO|TBD|placeholder)\b/i.test(value);

export function validateRegistry(registry) {
  const errors = [];
  if (registry?.schemaVersion !== 1) errors.push('Registry schemaVersion must be 1.');
  if (registry?.status !== 'design-only') errors.push('Runtime wiring is not verified; registry must remain design-only.');
  const groups = Array.isArray(registry?.groups) ? registry.groups : [];
  if (!groups.length) errors.push('Registry needs feature groups.');
  const ids = new Set();
  const audiences = new Set(['customer', 'planner', 'vendor', 'field', 'admin']);
  for (const group of groups) {
    if (!/^[a-z][a-z0-9-]*$/.test(group?.id ?? '') || ids.has(group.id)) {
      errors.push(`Invalid or duplicate group: ${group?.id}`);
    }
    ids.add(group.id);
    if (typeof group.owner !== 'string' || !group.owner.trim()) errors.push(`${group.id}: missing owner.`);
    if (!meaningful(group.offBehavior)) errors.push(`${group.id}: missing off behaviour.`);
    if (group.runtimeStatus !== 'planned') errors.push(`${group.id}: runtime status requires a reviewed checker/schema migration.`);
    if (!Array.isArray(group.audiences) || !group.audiences.length ||
        group.audiences.some(a => !audiences.has(a))) errors.push(`${group.id}: invalid audiences.`);
    if (!Array.isArray(group.dependsOn)) errors.push(`${group.id}: dependsOn must be an array.`);
  }
  const byId = new Map(groups.map(group => [group.id, group]));
  for (const group of groups) {
    for (const dependency of group.dependsOn ?? []) {
      if (!ids.has(dependency)) errors.push(`${group.id}: unknown dependency ${dependency}.`);
    }
  }
  const active = new Set(), done = new Set();
  function visit(id) {
    if (active.has(id)) { errors.push(`Feature dependency cycle at ${id}.`); return; }
    if (done.has(id) || !byId.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id).dependsOn ?? []) visit(dependency);
    active.delete(id); done.add(id);
  }
  for (const id of ids) visit(id);
  if (!registry?.profiles || typeof registry.profiles !== 'object' || Array.isArray(registry.profiles)) {
    errors.push('Registry profiles must be an object.');
  }
  for (const [name, enabled] of Object.entries(registry?.profiles ?? {})) {
    if (!Array.isArray(enabled)) { errors.push(`${name}: profile must be an array.`); continue; }
    if (new Set(enabled).size !== enabled.length) errors.push(`${name}: duplicate profile groups.`);
    for (const id of enabled) {
      if (!ids.has(id)) errors.push(`${name}: unknown group ${id}.`);
      for (const dependency of byId.get(id)?.dependsOn ?? []) {
        if (!enabled.includes(dependency)) errors.push(`${name}: ${id} requires ${dependency}.`);
      }
    }
  }
  return errors;
}

export function validateReviewRecords(registry, changedPaths, records) {
  const errors = [];
  const paths = changedPaths.filter(path => !/^\.github\/feature-reviews\/[^/]+\.json$/.test(path));
  if (!changedPaths.length) return errors;
  if (!records.length) errors.push('Add or update a .github/feature-reviews/<change>.json record in this diff.');
  const knownGroups = new Set(registry.groups.map(group => group.id));
  const covered = new Set();
  for (const { path, record } of records) {
    if (record?.schemaVersion !== 1) errors.push(`${path}: schemaVersion must be 1.`);
    if (!meaningful(record?.summary)) errors.push(`${path}: provide a concrete summary.`);
    if (!Array.isArray(record?.groups) || !record.groups.length || record.groups.some(id => !knownGroups.has(id))) {
      errors.push(`${path}: select valid feature groups.`);
    }
    if (!Array.isArray(record?.reviewedPaths) || record.reviewedPaths.some(item => typeof item !== 'string')) {
      errors.push(`${path}: reviewedPaths must be a string array.`);
    } else for (const item of record.reviewedPaths) covered.add(item);
    for (const name of REQUIRED_CASES) {
      const check = record?.checks?.[name];
      if (!check || !['passed', 'not-applicable'].includes(check.status) || !meaningful(check.evidence)) {
        errors.push(`${path}: ${name} needs passed/not-applicable with specific evidence; blocked checks cannot merge.`);
      }
    }
  }
  for (const path of paths) if (!covered.has(path)) errors.push(`Missing reviewed path: ${path}`);
  if (changedPaths.includes('config/feature-groups.json') &&
      !changedPaths.includes('docs/releases/ATLAS_LEAN_LAUNCH_PLAN.md')) {
    errors.push('Registry changes must update the lean launch plan.');
  }
  return errors;
}

function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--base', '--head'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: node scripts/check-feature-review.mjs [--base REF --head REF]');
    options[args[i].slice(2)] = args[i + 1];
  }
  const git = (...values) => execFileSync('git', values, { encoding: 'utf8' });
  const commit = ref => git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
  const base = options.base ? commit(options.base) : null;
  const head = options.head ? commit(options.head) : (base ? commit('HEAD') : null);
  if (head && !base) throw new Error('--head requires --base.');
  const read = path => JSON.parse(head ? git('show', `${head}:${path}`) : readFileSync(path, 'utf8'));
  const registry = read('config/feature-groups.json');
  const errors = validateRegistry(registry);
  if (!errors.length && base) {
    const changedPaths = git('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter(Boolean);
    const records = changedPaths.filter(path => /^\.github\/feature-reviews\/[^/]+\.json$/.test(path))
      .filter(path => { try { git('cat-file', '-e', `${head}:${path}`); return true; } catch { return false; } })
      .map(path => ({ path, record: read(path) }));
    errors.push(...validateReviewRecords(registry, changedPaths, records));
    console.log(`Review contract checked ${changedPaths.length} changed paths at ${head}.`);
  }
  if (errors.length) {
    for (const error of errors) console.error(`FAIL: ${error}`);
    process.exitCode = 1;
  } else console.log(base ? 'Review contract passed. Functional evidence and independent approval remain required.' : 'Feature registry passed. PR diff coverage was not evaluated.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
}
