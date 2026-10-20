'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { reviewWithCodex, REVIEW_TIMEOUT_MS } = require('./codex-review.cjs');
const script = path.join(__dirname, 'review-codebase.cjs');
const firstStop = { hook_event_name: 'SubagentStop', stop_hook_active: false };

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk review 한글 '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fake = path.join(directory, 'fake.cjs');
  fs.writeFileSync(fake, `const fs = require('node:fs');
let prompt = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', data => prompt += data);
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  fs.writeFileSync(process.env.REVIEW_CAPTURE, JSON.stringify({prompt,args,guard:process.env.NAMUK_PROCESS_REVIEW_CHILD}));
  if (process.env.REVIEW_MODE === 'fail') { process.stderr.write('fake CLI failed'); process.exit(9); }
  if (process.env.REVIEW_MODE === 'hang') { setInterval(() => {}, 1000); return; }
  setTimeout(() => { fs.writeFileSync(args[args.indexOf('-o')+1], process.env.REVIEW_MODE === 'empty' ? '' : 'Review finding: add returns subtraction.'); }, 150);
});`);
  const executable = path.join(directory, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  fs.writeFileSync(executable, process.platform === 'win32' ? `@echo off\r\n"${process.execPath}" "%~dp0fake.cjs" %*\r\n` : `#!/bin/sh\nexec '${process.execPath}' '${fake}' "$@"\n`);
  if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);
  const capture = path.join(directory, 'capture.json');
  const env = { ...process.env, NAMUK_PROCESS_CODEX_EXECUTABLE: executable, REVIEW_CAPTURE: capture };
  delete env.NAMUK_PROCESS_REVIEW_CHILD;
  return { directory, capture, env };
}
function run(input, env) {
  return spawnSync(process.execPath, [script], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env });
}

test('hook waits for CLI, injects current skill and worker context, and returns review to worker', t => {
  const f = fixture(t);
  const started = Date.now();
  const result = run({ ...firstStop, cwd: f.directory, agent_id: 'worker-1', agent_transcript_path: 'context.jsonl', last_assistant_message: 'add(2,3) must return 5; do not execute $(bad)' }, f.env);
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.decision, 'block');
  assert.match(response.reason, /Review finding: add returns subtraction/);
  assert.ok(Date.now() - started >= 150);
  const captured = JSON.parse(fs.readFileSync(f.capture, 'utf8'));
  const source = path.resolve(__dirname, '../skills/code-review/SKILL.md');
  assert.ok(captured.prompt.includes(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')));
  assert.ok(captured.prompt.includes(source));
  assert.ok(captured.prompt.includes(path.dirname(source)));
  const { loadSkill } = require('./skill-context.cjs');
  assert.ok(captured.prompt.includes(loadSkill('codebase-design')));
  assert.match(captured.prompt, /worker-1/);
  assert.match(captured.prompt, /context.jsonl/);
  assert.match(captured.prompt, /add\(2,3\)/);
  assert.deepEqual(captured.args.slice(0, 8), ['exec', '--disable', 'hooks', '--ephemeral', '-C', f.directory, '-s', 'read-only']);
  assert.equal(captured.args.at(-1), '-');
  assert.equal(captured.guard, '1');
  assert.equal(fs.existsSync(path.dirname(captured.args[captured.args.indexOf('-o') + 1])), false);
});

test('resumed worker and child review do not execute another review', t => {
  const f = fixture(t);
  for (const [input, env] of [[{ ...firstStop, stop_hook_active: true }, f.env], ['', { ...f.env, NAMUK_PROCESS_REVIEW_CHILD: '1' }]]) {
    const result = run(input, env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.equal(fs.existsSync(f.capture), false);
  }
});

test('Windows Path environment key resolves the CLI without an explicit executable override', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const env = { ...f.env };
  delete env.NAMUK_PROCESS_CODEX_EXECUTABLE;
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.Path = f.directory + path.delimiter + process.env.Path;
  const result = run(firstStop, env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).reason, /Review finding/);
});

test('CLI failure, empty result and unavailable executable are returned as explicit blocking failures', t => {
  const f = fixture(t);
  for (const [env, message] of [[{ ...f.env, REVIEW_MODE: 'fail' }, /fake CLI failed/], [{ ...f.env, REVIEW_MODE: 'empty' }, /empty review/], [{ ...f.env, NAMUK_PROCESS_CODEX_EXECUTABLE: path.join(f.directory, 'missing') }, /not found|ENOENT/]]) {
    const result = run(firstStop, env);
    assert.equal(result.status, 0, result.stderr);
    const response = JSON.parse(result.stdout);
    assert.equal(response.decision, 'block');
    assert.match(response.reason, /완료하지 못했다/);
    assert.match(response.reason, message);
  }
});

test('installed hook reads the current canonical skill and blocks if it disappears', t => {
  const f = fixture(t);
  const installed = path.join(f.directory, 'plugin with spaces');
  fs.mkdirSync(path.join(installed, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(installed, 'skills/code-review'), { recursive: true });
  for (const name of ['review-codebase.cjs', 'codex-review.cjs', 'skill-context.cjs']) {
    fs.copyFileSync(path.join(__dirname, name), path.join(installed, 'hooks', name));
  }
  const source = path.join(installed, 'skills/code-review/SKILL.md');
  const design = path.join(installed, 'skills/codebase-design/SKILL.md');
  fs.mkdirSync(path.dirname(design), { recursive: true });
  fs.writeFileSync(design, '\uFEFF---\nname: codebase-design\ndescription: fixture\n---\n# Design 전체 본문\nend marker');
  for (const body of ['# First review 기준', '# Updated review 기준']) {
    fs.writeFileSync(source, body);
    const result = spawnSync(process.execPath, [path.join(installed, 'hooks/review-codebase.cjs')], { cwd: f.directory, input: JSON.stringify(firstStop), encoding: 'utf8', env: f.env });
    assert.equal(JSON.parse(result.stdout).decision, 'block');
    assert.ok(JSON.parse(fs.readFileSync(f.capture, 'utf8')).prompt.includes(body));
    const prompt = JSON.parse(fs.readFileSync(f.capture, 'utf8')).prompt;
    assert.ok(prompt.includes('# Design 전체 본문\nend marker'));
    assert.ok(prompt.includes(design));
  }
  fs.unlinkSync(source);
  const missing = spawnSync(process.execPath, [path.join(installed, 'hooks/review-codebase.cjs')], { input: JSON.stringify(firstStop), encoding: 'utf8', env: f.env });
  assert.equal(JSON.parse(missing.stdout).decision, 'block');
  assert.match(JSON.parse(missing.stdout).reason, /ENOENT/);
  fs.writeFileSync(source, '# Review restored');
  fs.unlinkSync(f.capture);
  for (const body of [null, '---\nname: empty\n---\n', 'x'.repeat(20001)]) {
    if (body === null) fs.unlinkSync(design); else fs.writeFileSync(design, body);
    const failure = spawnSync(process.execPath, [path.join(installed, 'hooks/review-codebase.cjs')], { input: JSON.stringify(firstStop), encoding: 'utf8', env: f.env });
    assert.equal(JSON.parse(failure.stdout).decision, 'block');
    assert.match(JSON.parse(failure.stdout).reason, /ENOENT|Empty skill body|exceeds/);
    assert.equal(fs.existsSync(f.capture), false);
  }
});

test('runner times out a hanging process and removes result directory', async t => {
  const f = fixture(t);
  await assert.rejects(reviewWithCodex({ cwd: f.directory, prompt: 'review', timeoutMs: 1500, env: { ...f.env, REVIEW_MODE: 'hang' } }), /timed out/);
  const capture = JSON.parse(fs.readFileSync(f.capture, 'utf8'));
  assert.equal(fs.existsSync(path.dirname(capture.args[capture.args.indexOf('-o') + 1])), false);
});

test('malformed hook input blocks with a diagnostic rather than silently passing', () => {
  for (const payload of ['', '{', 'null', '[]', '{}', { ...firstStop, stop_hook_active: 'false' }, { ...firstStop, hook_event_name: 'Stop' }]) {
    const result = run(payload, { ...process.env, NAMUK_PROCESS_REVIEW_CHILD: '' });
    assert.equal(JSON.parse(result.stdout).decision, 'block');
    assert.match(JSON.parse(result.stdout).reason, /완료하지 못했다/);
  }
});

test('registered command loads runner from installed plugin and timeout allows cleanup', t => {
  const f = fixture(t);
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
  const hook = config.hooks.SubagentStop[0].hooks[0];
  assert.ok(hook.timeout * 1000 > REVIEW_TIMEOUT_MS);
  assert.equal(hook.statusMessage, 'Waiting for independent code review...');
  const result = spawnSync(process.execPath, ['-e', "require(require('node:path').join(process.env.PLUGIN_ROOT,'hooks/review-codebase.cjs'))"], {
    cwd: f.directory, encoding: 'utf8', input: JSON.stringify(firstStop), env: { ...f.env, PLUGIN_ROOT: path.resolve(__dirname, '..') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).reason, /Review finding/);
});
