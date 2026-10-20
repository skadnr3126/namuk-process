'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('hook configuration registers only the supported start events', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.hooks).sort(), ['SessionStart', 'SubagentStart', 'UserPromptSubmit']);
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '남욱 설치 경로 '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'plugin');
  const cwd = path.join(directory, '다른 작업');
  fs.mkdirSync(cwd);
  function copyDirectory(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name);
      const to = path.join(destination, entry.name);
      if (entry.isDirectory()) copyDirectory(from, to);
      else fs.copyFileSync(from, to);
    }
  }
  copyDirectory(__dirname, path.join(root, 'hooks'));
  copyDirectory(path.resolve(__dirname, '../skills'), path.join(root, 'skills'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8'));
  function command(event) {
    return config.hooks[event][0].hooks[0].command.match(/^node -e "(.*)"$/)[1];
  }
  const options = { cwd, env: { ...process.env, PLUGIN_ROOT: root }, encoding: 'utf8' };
  const run = event => spawnSync(process.execPath, ['-e', command(event)], options);
  return { root, cwd, config, command, options, run };
}

test('registered main, worker and restored-session commands deliver the entire installed design from another cwd', t => {
  const f = fixture(t);
  const source = path.join(f.root, 'skills/codebase-design/SKILL.md');
  const original = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const bodies = [original, '# Changed 설치 원문\n\n[relative](references/example.md)\n끝 전체 본문'];
  for (const body of bodies) {
    fs.writeFileSync(source, '\uFEFF---\r\nname: codebase-design\r\ndescription: fixture\r\n---\r\n' + body);
    for (const event of ['UserPromptSubmit', 'SubagentStart', 'SessionStart']) {
      const result = f.run(event);
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout).hookSpecificOutput;
      assert.equal(output.hookEventName, event);
      const expected = `스킬 원문: ${source}\n상대 문서 링크는 스킬 폴더 ${path.dirname(source)} 기준으로 해석하고 필요한 참조를 읽는다.\n\n${body}`;
      assert.ok(output.additionalContext.endsWith(expected));
      assert.equal(output.additionalContext.split(expected).length, 2);
      assert.ok(output.additionalContext.length <= f.config.hooks[event][0].hooks[0].additionalContextLimit);
      if (event === 'UserPromptSubmit') assert.ok(output.additionalContext.includes(path.join(f.root, 'skills/request-to-implementation/SKILL.md')));
      else assert.equal(output.additionalContext, expected);
    }
  }
  assert.equal(f.config.hooks.SessionStart[0].matcher, 'compact|resume|fork');
  for (const source of ['compact', 'resume', 'fork']) assert.ok(new RegExp(`^(?:${f.config.hooks.SessionStart[0].matcher})$`).test(source));
  assert.equal(new RegExp(`^(?:${f.config.hooks.SessionStart[0].matcher})$`).test('startup'), false);
});

test('missing, empty and oversized design emits no partial context on any start path', t => {
  const f = fixture(t);
  const source = path.join(f.root, 'skills/codebase-design/SKILL.md');
  for (const body of [null, '\uFEFF---\nname: fixture\n---\n  \n', '가'.repeat(20001)]) {
    if (body === null) fs.unlinkSync(source); else fs.writeFileSync(source, body);
    for (const event of ['UserPromptSubmit', 'SubagentStart', 'SessionStart']) {
      const result = f.run(event);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /ENOENT|Empty skill body|exceeds/);
    }
  }
});

test('combined main context budget includes workflow and origin headers', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'skills/codebase-design/SKILL.md'), '가'.repeat(17000));
  assert.equal(f.run('SubagentStart').status, 0);
  const result = f.run('UserPromptSubmit');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /exceeds/);
});

test('start commands exit without waiting for an open stdin pipe', async t => {
  const f = fixture(t);
  for (const event of ['UserPromptSubmit', 'SubagentStart', 'SessionStart']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', f.command(event)], { ...f.options, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', data => output += data);
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`${event} waited for stdin`)); }, 4000);
      child.on('error', error => { clearTimeout(timeout); child.kill(); reject(error); });
      child.on('close', code => {
        clearTimeout(timeout);
        try { assert.equal(code, 0); assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, event); resolve(); } catch (error) { reject(error); }
      });
    });
  }
});

test('registered command runs unchanged through Windows PowerShell with a Korean installation path', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const env = { ...f.options.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') env[key] = path.dirname(process.execPath) + path.delimiter + env[key];
  }
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', f.config.hooks.UserPromptSubmit[0].hooks[0].command], {
    ...f.options, env,
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'UserPromptSubmit');
  const source = path.join(f.root, 'skills/codebase-design/SKILL.md');
  const body = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  assert.ok(output.additionalContext.includes(source));
  assert.ok(output.additionalContext.endsWith(body));
});
