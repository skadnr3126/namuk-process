'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const script = path.join(__dirname, 'review-codebase.cjs');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
const firstStop = { hook_event_name: 'SubagentStop', stop_hook_active: false };

function run(input, executable = script) {
  return spawnSync(process.execPath, [executable], { encoding: 'utf8', input: typeof input === 'string' ? input : JSON.stringify(input) });
}

test('registered stop command reviews once through shell pipes outside the installed plugin', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk stop hooks '));
  try {
    const installed = path.join(temp, 'plugin 한글 with spaces');
    for (const relative of ['hooks/review-codebase.cjs', 'skills/codebase-design/SKILL.md']) {
      const destination = path.join(installed, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, relative), destination);
    }
    const registration = config.hooks.SubagentStop[0];
    assert.equal(registration.matcher, undefined);
    const hook = registration.hooks[0];
    assert.equal(hook.type, 'command');
    const shells = process.platform === 'win32'
      ? [
        { executable: 'powershell.exe', args: payload => ['-NoProfile', '-NonInteractive', '-Command', `'${payload}' | ${hook.command}`] },
        { executable: process.env.ComSpec || 'cmd.exe', args: payload => ['/d', '/s', '/c', `"echo ${payload}| ${hook.command}"`], windowsVerbatimArguments: true },
      ]
      : [{ executable: '/bin/sh', args: payload => ['-c', `printf '%s' '${payload}' | ${hook.command}`] }];
    for (const shell of shells) {
      for (const active of [false, true]) {
        const result = spawnSync(shell.executable, shell.args(JSON.stringify({ ...firstStop, stop_hook_active: active })), {
          cwd: temp, encoding: 'utf8', env: { ...process.env, PLUGIN_ROOT: installed }, windowsVerbatimArguments: shell.windowsVerbatimArguments,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, '');
        assert.notEqual(result.stdout, '', `${shell.executable}: ${shell.args(JSON.stringify({ ...firstStop, stop_hook_active: active })).join(' ')}`);
        const output = JSON.parse(result.stdout);
        if (active) {
          assert.deepEqual(output, {});
        } else {
          assert.equal(output.decision, 'block');
          const source = path.join(installed, 'skills/codebase-design/SKILL.md');
          assert.ok(output.reason.includes(source));
          assert.match(output.reason, /원문을 다시 읽고/);
          assert.ok(!output.reason.includes('description:'));
          assert.match(output.reason, /현재 담당자가 직접 수행/);
          assert.match(output.reason, /새 서브에이전트를 생성하거나 종료 훅을 직접 재호출하지 마라/);
          assert.match(output.reason, /읽기 조사·설명·리뷰 역할/);
          assert.match(output.reason, /권한과 소유 범위 안/);
        }
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('stop payload metadata is optional and never becomes review instructions', () => {
  const baseline = run(firstStop);
  const result = run({
    ...firstStop, agent_id: 'UNTRUSTED_AGENT_MARKER', agent_type: 'UNTRUSTED_TYPE_MARKER',
    last_assistant_message: 'UNTRUSTED_MESSAGE_MARKER', agent_transcript_path: 'UNTRUSTED_PATH_MARKER',
  });
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, baseline.stdout);
});

test('malformed or missing event and loop fields fail visibly without blocking', () => {
  for (const input of ['', '{', 'null', '[]', '1', '{}', { hook_event_name: 'SubagentStop' },
    { stop_hook_active: false }, { ...firstStop, hook_event_name: 'Stop' },
    { ...firstStop, stop_hook_active: 'false' }, { ...firstStop, stop_hook_active: null }]) {
    const result = run(input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /codebase review failed/);
  }
});

test('active review allows stopping even if the canonical skill is unavailable', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk stop guard '));
  try {
    const installedScript = path.join(temp, 'review-codebase.cjs');
    fs.copyFileSync(script, installedScript);
    const result = run({ ...firstStop, stop_hook_active: true }, installedScript);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
    const missingSkill = run(firstStop, installedScript);
    assert.equal(missingSkill.status, 1);
    assert.equal(missingSkill.stdout, '');
    assert.match(missingSkill.stderr, /ENOENT/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('reviews point to the canonical skill without embedding a stale copy or consuming input metadata', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk stop source '));
  try {
    fs.mkdirSync(path.join(temp, 'hooks'));
    fs.mkdirSync(path.join(temp, 'skills/codebase-design'), { recursive: true });
    const installedScript = path.join(temp, 'hooks/review-codebase.cjs');
    const source = path.join(temp, 'skills/codebase-design/SKILL.md');
    fs.copyFileSync(script, installedScript);
    for (const body of ['# First current body\n', '# Updated current body\n']) {
      fs.writeFileSync(source, '\uFEFF---\r\nname: metadata\r\n---\r\n' + body);
      const result = run('\uFEFF' + JSON.stringify(firstStop), installedScript);
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.decision, 'block');
      assert.ok(output.reason.includes(source));
      assert.ok(!output.reason.includes(body));
      assert.ok(!output.reason.includes('name: metadata'));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
