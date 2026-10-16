'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const store = require('./gate-store.cjs');
const root = path.resolve(__dirname, '..');
const config = store.read(path.join(__dirname, 'hooks.json'));
function input(event, extra = {}) { return { hook_event_name: event, session_id: crypto.randomUUID(), turn_id: 'turn-1', agent_id: 'worker-1', ...extra }; }
function run(event, payload) { return spawnSync(process.execPath, [path.join(__dirname, event + '.cjs')], { encoding: 'utf8', input: JSON.stringify(payload) }); }
function copyTree(source, target) { fs.mkdirSync(target, { recursive: true }); for (const entry of fs.readdirSync(source, { withFileTypes: true })) { const from = path.join(source, entry.name); const to = path.join(target, entry.name); if (entry.isDirectory()) copyTree(from, to); else fs.copyFileSync(from, to); } }
function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk injection '));
  try {
    copyTree(path.join(root, 'hooks'), path.join(temp, 'plugin 한글 with spaces', 'hooks'));
    copyTree(path.join(root, 'skills'), path.join(temp, 'plugin 한글 with spaces', 'skills'));
    return fn(temp, path.join(temp, 'plugin 한글 with spaces'));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
test('manifest registers Stop and both start events with cwd-independent commands', () => {
  assert.equal(store.read(path.join(root, '.codex-plugin/plugin.json')).hooks, './hooks/hooks.json');
  fixture((temp, installed) => {
    for (const [event, skills] of Object.entries({ UserPromptSubmit: ['request-to-implementation'], SubagentStart: ['codebase-design', 'boundary-responsibility'] })) {
      const hook = config.hooks[event][0].hooks[0];
      const payload = input(event);
      const command = hook.command;
      const shells = process.platform === 'win32' ? [
        ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]],
        [command, [], true],
      ] : [['/bin/sh', ['-c', command]]];
      for (const [shell, args, useShell] of shells) {
        const result = spawnSync(shell, args, { shell: useShell, cwd: temp, env: { ...process.env, PLUGIN_ROOT: installed }, input: JSON.stringify(payload), encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        const output = JSON.parse(result.stdout).hookSpecificOutput;
        assert.equal(output.hookEventName, event);
        for (const skill of skills) {
          const source = path.join(installed, 'skills', skill, 'SKILL.md');
          const canonical = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
          assert.ok(output.additionalContext.includes(canonical));
          assert.ok(output.additionalContext.includes(source));
        }
        assert.ok(output.additionalContext.length < hook.additionalContextLimit);
        assert.ok(output.additionalContext.includes('context.json'));
        assert.ok(!output.additionalContext.includes('많은 사용자를 포함하게'));
      }
    }
    assert.ok(config.hooks.Stop);
  });
});
test('missing canonical skill gives no partial injection', () => fixture((temp, installed) => {
  fs.unlinkSync(path.join(installed, 'skills/boundary-responsibility/SKILL.md'));
  const result = spawnSync(process.execPath, [path.join(installed, 'hooks/SubagentStart.cjs')], { encoding: 'utf8', input: JSON.stringify(input('SubagentStart')) });
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /ENOENT/);
}));
test('malformed or foreign event input fails visibly without leaking prompt', () => {
  for (const event of ['UserPromptSubmit', 'SubagentStart']) for (const payload of [null, {}, { hook_event_name: 'other' }]) {
    const result = run(event, payload); assert.equal(result.status, 1); assert.equal(result.stdout, '');
  }
});
test('skill frontmatter is stripped without changing body', () => fixture((temp, installed) => {
  const source = path.join(installed, 'skills/request-to-implementation/SKILL.md');
  fs.writeFileSync(source, '\uFEFF---\r\nname: metadata\r\n---\r\n# Exact body\r\nKeep me.');
  const result = spawnSync(process.execPath, [path.join(installed, 'hooks/UserPromptSubmit.cjs')], { encoding: 'utf8', input: JSON.stringify(input('UserPromptSubmit')) });
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.ok(body.includes('# Exact body\r\nKeep me.')); assert.ok(!body.includes('name: metadata'));
}));
test('workflow documentation local links resolve', () => {
  for (const relative of ['README.md', '플러그인철학.md', 'skills/request-to-implementation/SKILL.md', 'skills/request-to-implementation/references/task-brief.md', 'skills/request-to-implementation/references/completion-record.md', 'skills/codebase-design/SKILL.md']) {
    const source = path.join(root, relative);
    for (const match of fs.readFileSync(source, 'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(match[1])) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(source), match[1].split('#')[0])), relative + ': ' + match[1]);
    }
  }
});
