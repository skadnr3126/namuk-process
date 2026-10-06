'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));

test('manifest and event commands execute canonical skills from an unrelated cwd', () => {
  assert.equal(manifest.hooks, './hooks/hooks.json');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk hooks '));
  try {
    const installed = path.join(temp, 'plugin with spaces');
    fs.mkdirSync(installed);
    for (const directory of ['hooks', 'skills']) {
      fs.cpSync(path.join(root, directory), path.join(installed, directory), { recursive: true });
    }
    for (const [event, skill] of Object.entries({ UserPromptSubmit: 'request-to-implementation', SubagentStart: 'codebase-design' })) {
      const registration = config.hooks[event][0];
      assert.equal(registration.matcher, undefined);
      const hook = registration.hooks[0];
      assert.equal(hook.type, 'command');
      const windows = process.platform === 'win32';
      const command = windows ? hook.commandWindows : hook.command;
      const executable = windows ? 'powershell.exe' : '/bin/sh';
      const args = windows ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
      const result = spawnSync(executable, args, {
        cwd: temp, encoding: 'utf8', env: { ...process.env, PLUGIN_ROOT: installed },
        input: JSON.stringify({ hook_event_name: event, prompt: 'UNTRUSTED_PROMPT_MARKER', agent_type: 'arbitrary' }),
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      const output = JSON.parse(result.stdout).hookSpecificOutput;
      assert.equal(output.hookEventName, event);
      const source = path.join(installed, 'skills', skill, 'SKILL.md');
      assert.ok(output.additionalContext.includes(source));
      assert.ok(output.additionalContext.endsWith(fs.readFileSync(source, 'utf8')));
      assert.ok(!output.additionalContext.includes('UNTRUSTED_PROMPT_MARKER'));
      assert.ok(output.additionalContext.length < hook.additionalContextLimit);
      if (windows) {
        const native = spawnSync(command, {
          shell: true, cwd: temp, encoding: 'utf8', env: { ...process.env, PLUGIN_ROOT: installed },
          input: JSON.stringify({ hook_event_name: event }),
        });
        assert.equal(native.status, 0, native.stderr);
        assert.deepEqual(JSON.parse(native.stdout).hookSpecificOutput, output);
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('invalid or unsupported input emits no developer context', () => {
  for (const input of ['', '{', 'null', '{}', '{"hook_event_name":"Stop"}', '{"hook_event_name":"toString"}']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'inject-skill.cjs')], { encoding: 'utf8', input });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /skill injection failed/);
  }
});

test('a missing canonical skill fails visibly instead of injecting partial rules', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk missing skill '));
  try {
    fs.mkdirSync(path.join(temp, 'hooks'));
    const script = path.join(temp, 'hooks/inject-skill.cjs');
    fs.copyFileSync(path.join(__dirname, 'inject-skill.cjs'), script);
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', input: '{"hook_event_name":"UserPromptSubmit"}' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /ENOENT/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('workflow and hook documentation links resolve to existing local files', () => {
  for (const relative of [
    'README.md', '플러그인철학.md', 'skills/request-to-implementation/SKILL.md',
    'skills/request-to-implementation/references/task-brief.md', 'skills/codebase-design/SKILL.md',
  ]) {
    const source = path.join(root, relative);
    const markdown = fs.readFileSync(source, 'utf8');
    for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|#)/.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(source), target.split('#')[0])), `${relative}: ${target}`);
    }
  }
});
