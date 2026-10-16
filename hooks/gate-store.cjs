'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const text = value => typeof value === 'string' && value.trim().length > 0;
const list = value => Array.isArray(value) && value.length > 0 && value.every(text);
function demand(condition, message) { if (!condition) throw new Error(message); }
function write(file, value, exclusive = false) {
  if (exclusive) return fs.writeFileSync(file, JSON.stringify(value, null, 2), { flag: 'wx' });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
function location(input, role) {
  demand(text(input.session_id), 'session_id is required for completion records');
  if (role === 'worker') demand(text(input.agent_id), 'agent_id is required for worker records');
  const base = path.join(os.tmpdir(), 'namuk-process-gates', hash(path.resolve(__dirname, '..')).slice(0, 16), hash(input.session_id));
  return { base, pointer: path.join(base, role === 'main' ? 'main.json' : hash(input.agent_id) + '.json') };
}
function createContext(input, role) {
  const { base, pointer } = location(input, role);
  fs.mkdirSync(base, { recursive: true });
  if (fs.existsSync(pointer)) {
    const previous = read(pointer);
    if (text(input.turn_id) && previous.turnId === input.turn_id) return loadContext(previous.contextPath);
  }
  const token = crypto.randomUUID();
  const directory = path.join(base, token);
  fs.mkdirSync(directory);
  const context = { version: 1, role, sessionId: input.session_id, turnId: input.turn_id || null,
    agentId: role === 'worker' ? input.agent_id : null, token, directory };
  const contextPath = path.join(directory, 'context.json');
  write(contextPath, context, true);
  write(pointer, { contextPath, turnId: context.turnId });
  return { ...context, contextPath };
}
function loadContext(file) {
  const context = read(file);
  demand(context.version === 1 && text(context.token) && ['main', 'worker'].includes(context.role), 'Invalid context');
  demand(path.resolve(context.directory) === path.dirname(path.resolve(file)), 'Context directory mismatch');
  return { ...context, contextPath: path.resolve(file) };
}
function activeContext(input, role) {
  const context = loadContext(read(location(input, role).pointer).contextPath);
  demand(context.sessionId === input.session_id && context.role === role, 'Foreign session context');
  demand(role !== 'worker' || context.agentId === input.agent_id, 'Foreign agent context');
  demand(!text(input.turn_id) || !context.turnId || context.turnId === input.turn_id, 'Stale turn context');
  return context;
}
function envelope(context, payload) { return { token: context.token, sessionId: context.sessionId, turnId: context.turnId, agentId: context.agentId, payload }; }
function bound(context, name) {
  const record = read(path.join(context.directory, name));
  for (const key of ['token', 'sessionId', 'turnId', 'agentId']) demand(record[key] === context[key], 'Stale or foreign record: ' + key);
  return record;
}
function validateFinding(finding, ids) {
  demand(finding && text(finding.id) && text(finding.scope) && text(finding.closureCondition), 'Finding requires id, original scope, closureCondition');
  demand(list(finding.criterionIds) && finding.criterionIds.every(id => ids.includes(id)), 'Finding references unknown criteria');
}
function initialize(context, baseline) {
  demand(baseline && ['implementation', 'analysis'].includes(baseline.mode), 'Explicit implementation or analysis mode required');
  demand(Array.isArray(baseline.criteria) && baseline.criteria.length > 0, 'At least one completion criterion is required');
  const ids = baseline.criteria.map(item => item.id);
  demand(ids.every(text) && new Set(ids).size === ids.length, 'Criterion IDs must be unique nonempty strings');
  for (const item of baseline.criteria) demand(text(item.condition) && text(item.method) && ['behavior', 'design', 'analysis'].includes(item.kind), 'Each criterion requires condition, method and kind (behavior/design/analysis)');
  if (baseline.mode === 'implementation') demand(baseline.criteria.some(item => item.kind === 'design'), 'Implementation requires a design criterion');
  const findings = baseline.findings || [];
  demand(Array.isArray(findings), 'findings must be an array');
  findings.forEach(item => validateFinding(item, ids));
  demand(new Set(findings.map(item => item.id)).size === findings.length, 'Duplicate finding ID');
  write(path.join(context.directory, 'baseline.json'), envelope(context, baseline), true);
  write(path.join(context.directory, 'baseline-seal.json'), envelope(context, { digest: hash(baseline) }), true);
}
function addFinding(context, finding) {
  const baseline = bound(context, 'baseline.json').payload;
  validateFinding(finding, baseline.criteria.map(item => item.id));
  demand(!(baseline.findings || []).some(item => item.id === finding.id), 'Finding ID already in baseline');
  const directory = path.join(context.directory, 'findings');
  fs.mkdirSync(directory, { recursive: true });
  write(path.join(directory, hash(finding.id) + '.json'), envelope(context, finding), true);
}
function saveResult(context, result) {
  const baseline = bound(context, 'baseline.json').payload;
  demand(bound(context, 'baseline-seal.json').payload.digest === hash(baseline), 'Frozen baseline was edited');
  const target = path.join(context.directory, 'result.json');
  if (fs.existsSync(target)) {
    const history = path.join(context.directory, 'history');
    fs.mkdirSync(history, { recursive: true });
    fs.copyFileSync(target, path.join(history, crypto.randomUUID() + '.json'));
  }
  write(target, { ...envelope(context, result), baselineDigest: hash(baseline) });
}
function check(context) {
  const baseline = bound(context, 'baseline.json').payload;
  demand(bound(context, 'baseline-seal.json').payload.digest === hash(baseline), 'Frozen baseline was edited');
  const record = bound(context, 'result.json');
  demand(record.baselineDigest === hash(baseline), 'Baseline changed after result');
  const result = record.payload;
  demand(result && ['complete', 'incomplete'].includes(result.outcome), 'Explicit result outcome required');
  demand(Array.isArray(result.remaining) && result.remaining.every(text), 'remaining must be a string array');
  const complete = result.outcome === 'complete';
  demand(complete ? result.remaining.length === 0 : result.remaining.length > 0,
    complete ? 'Complete outcome has remaining work' : 'Incomplete outcome requires remaining work or limitation');
  const expectedReviewer = context.role === 'main' ? 'main' : 'self';
  const reviewed = item => list(item.evidence) && item.review && item.review.by === expectedReviewer && list(item.review.evidence);
  demand(Array.isArray(result.criteria), 'Missing criteria results');
  const expectedIds = baseline.criteria.map(item => item.id).sort();
  demand(JSON.stringify(expectedIds) === JSON.stringify(result.criteria.map(item => item.id).sort()), 'Criterion IDs missing, dropped, duplicated or added');
  for (const item of result.criteria) {
    demand(['satisfied', 'failed', 'unverified'].includes(item.status), 'Invalid criterion status: ' + item.id);
    demand(!complete || item.status === 'satisfied', 'Criterion requires satisfied status: ' + item.id);
    demand(item.status !== 'satisfied' || reviewed(item), 'Satisfied criterion requires actual evidence and reviewer evidence: ' + item.id);
  }
  const findings = [...(baseline.findings || [])];
  const directory = path.join(context.directory, 'findings');
  if (fs.existsSync(directory)) for (const name of fs.readdirSync(directory)) findings.push(bound(context, path.join('findings', name)).payload);
  demand(Array.isArray(result.findings), 'Explicit findings results required (empty array when none)');
  demand(JSON.stringify(findings.map(item => item.id).sort()) === JSON.stringify(result.findings.map(item => item.id).sort()), 'Tracked findings missing, duplicated or unregistered');
  for (const item of result.findings) {
    demand(['resolved', 'unresolved'].includes(item.status), 'Invalid finding status: ' + item.id);
    demand(!complete || item.status === 'resolved', 'Finding remains unresolved: ' + item.id);
    demand(item.status !== 'resolved' || reviewed(item), 'Resolved finding lacks full-scope closure review: ' + item.id);
  }
  return { valid: true, outcome: result.outcome, mode: baseline.mode, criteria: expectedIds, remaining: result.remaining };
}
module.exports = { read, createContext, activeContext, loadContext, initialize, addFinding, saveResult, check };
