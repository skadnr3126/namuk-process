'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));

test('manifest and event commands execute canonical skills from an unrelated cwd', () => {
  assert.equal(manifest.hooks, './hooks/hooks.json');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk hooks '));
  try {
    const installed = path.join(temp, 'plugin 한글 with spaces');
    fs.mkdirSync(installed);
    for (const relative of ['hooks/inject-skill.cjs', 'skills/request-to-implementation/SKILL.md', 'skills/codebase-design/SKILL.md']) {
      const destination = path.join(installed, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, relative), destination);
    }
    for (const [event, skill] of Object.entries({ UserPromptSubmit: 'request-to-implementation', SubagentStart: 'codebase-design' })) {
      const registration = config.hooks[event][0];
      assert.equal(registration.matcher, undefined);
      const hook = registration.hooks[0];
      assert.equal(hook.type, 'command');
      const windows = process.platform === 'win32';
      const command = hook.command;
      assert.equal(hook.commandWindows, undefined);
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
      const canonicalBody = fs.readFileSync(source, 'utf8').split(/\r?\n---\r?\n/)[1];
      assert.equal(output.additionalContext.split('\n\n').slice(1).join('\n\n'), canonicalBody);
      assert.ok(!output.additionalContext.includes('description:'));
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

test('missing or unsupported event arguments emit no developer context', () => {
  for (const args of [[], ['Stop'], ['toString']]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'inject-skill.cjs'), ...args], { encoding: 'utf8', input: '{"hook_event_name":"UserPromptSubmit"}' });
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
    const result = spawnSync(process.execPath, [script, 'UserPromptSubmit'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /ENOENT/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('injection exits while stdin remains open and ignores malformed payload', async () => {
  for (const event of ['UserPromptSubmit', 'SubagentStart']) {
    const child = spawn(process.execPath, [path.join(__dirname, 'inject-skill.cjs'), event], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {});
    child.stdin.write('{INVALID_UNTRUSTED_PROMPT');
    try {
      const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('Hook waited for stdin EOF')); }, 3000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', status => { clearTimeout(timer); resolve(status); });
      });
      assert.equal(code, 0, stderr);
      assert.equal(JSON.parse(stdout).hookSpecificOutput.hookEventName, event);
      assert.ok(!stdout.includes('INVALID_UNTRUSTED_PROMPT'));
    } finally {
      child.stdin.destroy();
      if (child.exitCode === null) child.kill();
    }
  }
});

test('BOM and frontmatter are removed while a plain skill body is preserved', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk skill body '));
  try {
    fs.mkdirSync(path.join(temp, 'hooks'));
    fs.mkdirSync(path.join(temp, 'skills/request-to-implementation'), { recursive: true });
    const script = path.join(temp, 'hooks/inject-skill.cjs');
    const source = path.join(temp, 'skills/request-to-implementation/SKILL.md');
    fs.copyFileSync(path.join(__dirname, 'inject-skill.cjs'), script);
    for (const content of ['\uFEFF---\r\nname: metadata\r\n---\r\n# Body\r\nPreserve this.\r\n', '# Body\r\nPreserve this.\r\n']) {
      fs.writeFileSync(source, content);
      const result = spawnSync(process.execPath, [script, 'UserPromptSubmit'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      assert.equal(context.split('\n\n').slice(1).join('\n\n'), '# Body\r\nPreserve this.\r\n');
    }
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
