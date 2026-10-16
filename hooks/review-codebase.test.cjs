'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const store = require('./gate-store.cjs');
const config = store.read(path.join(__dirname, 'hooks.json'));
const criterion = { id: 'C1', kind: 'design', condition: 'App only composes screens; assets own state', method: 'Read App and assets calls' };
const finding = { id: 'F1', criterionIds: ['C1'], scope: 'Asset loading, calculations, filters still in App', closureCondition: 'Read entire App and callers; all asset responsibilities owned by assets' };
const verified = id => ({ id, status: 'satisfied', evidence: ['src/App.tsx:5 composes AssetsPanel'], review: { by: 'main', evidence: ['Read App and caller; asset state owned by useAssets'] } });
function setup(mode = 'implementation', findings = []) {
  const input = { session_id: crypto.randomUUID(), turn_id: 't1', hook_event_name: 'Stop', stop_hook_active: false };
  const context = store.createContext(input, 'main');
  store.initialize(context, { mode, criteria: [{ ...criterion, kind: mode === 'analysis' ? 'analysis' : 'design' }], findings });
  const result = { outcome: 'complete', criteria: [verified('C1')], findings: [], remaining: [] };
  return { input, context, result };
}
function hook(input) {
  const event = input.hook_event_name || 'Stop';
  return spawnSync(process.execPath, [path.join(__dirname, event === 'SubagentStop' ? 'review-codebase.cjs' : 'Stop.cjs')], { encoding: 'utf8', input: JSON.stringify(input) });
}
function output(input) { const execution = hook(input); assert.equal(execution.status, 0, execution.stderr); return JSON.parse(execution.stdout); }
function fails(mutator, expression) { const f = setup(); mutator(f); store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), expression); assert.equal(output(f.input).decision, 'block'); }
test('valid complete passes main Stop with explicit empty findings', () => { const f = setup(); store.saveResult(f.context, f.result); assert.equal(store.check(f.context).outcome, 'complete'); assert.deepEqual(output(f.input), {}); });
test('analysis-only explicit mode validates without code changes', () => { const f = setup('analysis'); store.saveResult(f.context, f.result); assert.equal(store.check(f.context).mode, 'analysis'); assert.deepEqual(output(f.input), {}); });
test('honest incomplete retains failed/unverified criteria and unresolved findings', () => {
  const f = setup('implementation', [finding]);
  f.result = { outcome: 'incomplete', criteria: [{ id: 'C1', status: 'unverified' }], findings: [{ id: 'F1', status: 'unresolved' }], remaining: ['App asset state still mixed; not complete'] };
  store.saveResult(f.context, f.result); assert.equal(store.check(f.context).outcome, 'incomplete'); assert.match(output(f.input).systemMessage, /미완료/);
});
for (const [name, mutate, expected] of [
  ['missing criterion', f => { f.result.criteria = []; }, /Criterion IDs/],
  ['unknown criterion', f => { f.result.criteria.push(verified('C2')); }, /Criterion IDs/],
  ['duplicate criterion', f => { f.result.criteria.push(verified('C1')); }, /Criterion IDs/],
  ['missing evidence', f => { f.result.criteria[0].evidence = []; }, /actual evidence/],
  ['missing main review', f => { f.result.criteria[0].review = { by: 'self', evidence: ['worker said done'] }; }, /reviewer evidence/],
  ['failed status', f => { f.result.criteria[0].status = 'failed'; }, /satisfied status/],
  ['unverified status', f => { f.result.criteria[0].status = 'unverified'; }, /satisfied status/],
  ['remaining work', f => { f.result.remaining = ['fix assets']; }, /remaining work/],
  ['missing findings declaration', f => { delete f.result.findings; }, /Explicit findings/],
]) test(name + ' cannot complete', () => fails(mutate, expected));
test('tracked full-scope finding cannot be forgotten or closed partially', () => {
  const f = setup('implementation', [finding]);
  store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /Tracked findings/);
  f.result.findings = [{ ...verified('F1'), status: 'unresolved' }];
  store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /unresolved/);
  f.result.findings[0].status = 'resolved'; f.result.findings[0].review.evidence = [];
  store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /full-scope/);
  f.result.findings[0].review.evidence = ['Read App and useAssets; loading/calculation/filter now all owned by assets'];
  store.saveResult(f.context, f.result); assert.equal(store.check(f.context).outcome, 'complete');
});
test('discovered findings are append-only and result history preserved', () => {
  const f = setup(); store.addFinding(f.context, finding); assert.throws(() => store.addFinding(f.context, finding), /EEXIST/);
  store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /Tracked findings/);
  store.saveResult(f.context, { ...f.result, outcome: 'incomplete', remaining: ['fix F1'], findings: [{ id: 'F1', status: 'unresolved' }] });
  assert.equal(store.check(f.context).outcome, 'incomplete'); assert.equal(fs.readdirSync(path.join(f.context.directory, 'history')).length, 1);
});
test('baseline cannot be reinitialized to fewer criteria or analysis mode', () => {
  const f = setup(); assert.throws(() => store.initialize(f.context, { mode: 'analysis', criteria: [criterion] }), /EEXIST/);
});
test('implementation baseline requires explicit design review criterion', () => {
  const c = store.createContext({ session_id: crypto.randomUUID(), turn_id: 't' }, 'main');
  assert.throws(() => store.initialize(c, { mode: 'implementation', criteria: [{ ...criterion, kind: 'behavior' }] }), /design criterion/);
});
test('stale or foreign result envelope and edited baseline are rejected', () => {
  const f = setup(); const foreign = setup(); store.saveResult(foreign.context, foreign.result);
  fs.copyFileSync(path.join(foreign.context.directory, 'result.json'), path.join(f.context.directory, 'result.json'));
  assert.throws(() => store.check(f.context), /foreign record/);
  store.saveResult(f.context, f.result);
  const baselineFile = path.join(f.context.directory, 'baseline.json'); const baseline = store.read(baselineFile); baseline.payload.criteria[0].condition = 'lowered'; fs.writeFileSync(baselineFile, JSON.stringify(baseline));
  assert.throws(() => store.check(f.context), /Frozen baseline|Baseline changed/);
});
test('context binding rejects wrong turn, session and worker identity; new turn has no old result', () => {
  const f = setup(); store.saveResult(f.context, f.result);
  assert.throws(() => store.activeContext({ ...f.input, turn_id: 'old' }, 'main'), /Stale turn/);
  assert.throws(() => store.activeContext({ ...f.input, session_id: 'foreign' }, 'main'), /ENOENT/);
  assert.equal(store.createContext(f.input, 'main').token, f.context.token);
  const next = store.createContext({ ...f.input, turn_id: 't2' }, 'main'); assert.notEqual(next.token, f.context.token); assert.throws(() => store.check(next), /ENOENT/);
  const workerInput = { ...f.input, agent_id: 'agent-1' }; const worker = store.createContext(workerInput, 'worker');
  assert.throws(() => store.activeContext({ ...workerInput, agent_id: 'agent-2' }, 'worker'), /ENOENT/);
  assert.notEqual(store.createContext({ ...workerInput, turn_id: 'worker-follow-up' }, 'worker').token, worker.token);
});
test('missing records ask review at actual code-review path, then reject active invalid with bounded warning', () => {
  const f = setup(); const first = output(f.input); assert.equal(first.decision, 'block'); assert.ok(first.reason.includes(path.resolve(__dirname, '../skills/code-review/SKILL.md')));
  const second = output({ ...f.input, stop_hook_active: true }); assert.equal(second.continue, false); assert.match(second.stopReason, /incomplete/); assert.match(second.systemMessage, /승인되지/); assert.notDeepEqual(second, {});
});
test('zero-record first turn, malformed input and unavailable context never silently approve', () => {
  const payload = { hook_event_name: 'Stop', session_id: crypto.randomUUID(), stop_hook_active: false };
  assert.equal(output(payload).decision, 'block');
  for (const raw of ['{', 'null', '{}']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'Stop.cjs')], { encoding: 'utf8', input: raw });
    assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).decision, 'block');
  }
});
test('worker SubagentStop needs self-reviewed evidence and uses same active-invalid gate', () => {
  const input = { hook_event_name: 'SubagentStop', session_id: crypto.randomUUID(), turn_id: 't', agent_id: 'worker', stop_hook_active: false };
  const context = store.createContext(input, 'worker'); store.initialize(context, { mode: 'implementation', criteria: [criterion] });
  const result = { outcome: 'complete', criteria: [verified('C1')], findings: [], remaining: [] };
  store.saveResult(context, result); assert.equal(output(input).decision, 'block');
  result.criteria[0].review.by = 'self'; store.saveResult(context, result); assert.deepEqual(output(input), {});
});
test('registered Stop and SubagentStop commands execute through Windows shells in unrelated cwd', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk stop shell '));
  try {
    for (const event of ['Stop', 'SubagentStop']) {
      const payload = { hook_event_name: event, session_id: crypto.randomUUID(), agent_id: 'worker', turn_id: 't', stop_hook_active: false };
      store.createContext(payload, event === 'Stop' ? 'main' : 'worker');
      const command = config.hooks[event][0].hooks[0].command;
      const shells = process.platform === 'win32' ? [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]], [command, [], true]] : [['/bin/sh', ['-c', command]]];
      for (const [shell, args, useShell] of shells) {
        const result = spawnSync(shell, args, { shell: useShell, cwd: temp, env: { ...process.env, PLUGIN_ROOT: path.resolve(__dirname, '..') }, input: JSON.stringify(payload), encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); const parsed = JSON.parse(result.stdout); assert.equal(parsed.decision, 'block'); assert.ok(parsed.reason.includes('skills' + path.sep + 'code-review'));
      }
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('CLI writes bound files and checks result from unrelated cwd', () => {
  const f = setup(); const source = path.join(f.context.directory, 'input.json'); fs.writeFileSync(source, JSON.stringify(f.result));
  const cli = path.join(__dirname, 'completion.cjs');
  for (const args of [['result', f.context.contextPath, source], ['check', f.context.contextPath]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: os.tmpdir(), encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  }
});


test('incomplete cannot mark unsupported satisfied or resolved rows as successful', () => {
  const f = setup('implementation', [finding]);
  f.result = { outcome: 'incomplete', criteria: [{ id: 'C1', status: 'satisfied', evidence: [] }], findings: [{ id: 'F1', status: 'unresolved' }], remaining: ['Fix F1'] };
  store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /actual evidence/);
  f.result.criteria = [{ id: 'C1', status: 'unverified' }]; f.result.findings = [{ id: 'F1', status: 'resolved', evidence: [] }];
  store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /full-scope closure/);
  f.result.findings = []; store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /Tracked findings/);
  f.result.criteria = []; f.result.findings = [{ id: 'F1', status: 'unresolved' }]; store.saveResult(f.context, f.result); assert.throws(() => store.check(f.context), /Criterion IDs/);
});
test('edited frozen baseline cannot be resealed by writing a new result', () => {
  const f = setup(); const file = path.join(f.context.directory, 'baseline.json'); const baseline = store.read(file);
  baseline.payload.criteria[0].condition = 'lowered before first result'; fs.writeFileSync(file, JSON.stringify(baseline));
  assert.throws(() => store.saveResult(f.context, f.result), /Frozen baseline/);
});
test('incomplete retains evidenced positives while a separate criterion remains unverified', () => {
  const context = store.createContext({ session_id: crypto.randomUUID(), turn_id: 'mixed' }, 'main');
  store.initialize(context, { mode: 'implementation', criteria: [criterion, { id: 'C2', kind: 'behavior', condition: 'Overlapping refreshes keep latest result', method: 'Drive deferred responses in reverse order' }], findings: [finding] });
  store.saveResult(context, {
    outcome: 'incomplete', criteria: [verified('C1'), { id: 'C2', status: 'unverified' }],
    findings: [{ id: 'F1', status: 'resolved', evidence: ['App now only composes; assets own loading/calculation/filter'], review: { by: 'main', evidence: ['Read full App + assets calls; original F1 scope all moved'] } }],
    remaining: ['C2 deferred-response behavior has not been exercised'],
  });
  const checked = store.check(context); assert.equal(checked.outcome, 'incomplete'); assert.deepEqual(checked.criteria, ['C1', 'C2']);
});
