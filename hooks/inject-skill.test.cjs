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
    for (const relative of ['hooks/UserPromptSubmit.cjs', 'hooks/SubagentStart.cjs', 'skills/request-to-implementation/SKILL.md', 'skills/codebase-design/SKILL.md', 'skills/boundary-responsibility/SKILL.md']) {
      const destination = path.join(installed, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, relative), destination);
    }
    for (const [event, expectedSkills] of Object.entries({ UserPromptSubmit: ['request-to-implementation'], SubagentStart: ['codebase-design', 'boundary-responsibility'] })) {
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
      for (const skill of expectedSkills) {
        const source = path.join(installed, 'skills', skill, 'SKILL.md');
        assert.ok(output.additionalContext.includes(source));
        const canonicalBody = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
        assert.ok(output.additionalContext.includes(canonicalBody));
      }
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

test('entrypoints emit their fixed event without arguments or stdin routing', () => {
  for (const event of ['UserPromptSubmit', 'SubagentStart']) {
    const otherEvent = event === 'UserPromptSubmit' ? 'SubagentStart' : 'UserPromptSubmit';
    const result = spawnSync(process.execPath, [path.join(__dirname, event + '.cjs')], {
      encoding: 'utf8', input: JSON.stringify({ hook_event_name: otherEvent }),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, event);
  }
});

test('a missing canonical skill fails visibly instead of injecting partial rules', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk missing skill '));
  try {
    fs.mkdirSync(path.join(temp, 'hooks'));
    fs.mkdirSync(path.join(temp, 'skills/codebase-design'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'skills/codebase-design/SKILL.md'), '# First skill must not be partially injected');
    for (const event of ['UserPromptSubmit', 'SubagentStart']) {
      const script = path.join(temp, 'hooks', event + '.cjs');
      fs.copyFileSync(path.join(__dirname, event + '.cjs'), script);
      const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /ENOENT/);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('injection exits while stdin remains open and ignores malformed payload', async () => {
  for (const event of ['UserPromptSubmit', 'SubagentStart']) {
    const child = spawn(process.execPath, [path.join(__dirname, event + '.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
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

test('BOM and frontmatter are removed while plain skill bodies are preserved', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk skill body '));
  try {
    fs.mkdirSync(path.join(temp, 'hooks'));
    const eventSkills = { UserPromptSubmit: ['request-to-implementation'], SubagentStart: ['codebase-design', 'boundary-responsibility'] };
    for (const [event, skills] of Object.entries(eventSkills)) {
      const script = path.join(temp, 'hooks', event + '.cjs');
      fs.copyFileSync(path.join(__dirname, event + '.cjs'), script);
      for (const frontmatter of [true, false]) {
        const heading = event === 'SubagentStart' ? '아래 스킬의 지침을 위임받은 작업에 적용하고 준수하라.\n\n' : '';
        const expected = heading + skills.map(skill => {
          const source = path.join(temp, 'skills', skill, 'SKILL.md');
          fs.mkdirSync(path.dirname(source), { recursive: true });
          const body = '# ' + skill + '\r\nPreserve this.\r\n';
          fs.writeFileSync(source, (frontmatter ? '\uFEFF---\r\nname: metadata\r\n---\r\n' : '') + body);
          return '스킬 원문: ' + source + '\n상대 문서 링크는 스킬 폴더 ' + path.dirname(source) + ' 기준으로 해석하고 필요한 참조를 읽는다.\n\n' + body;
        }).join('\n\n');
        const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, expected);
      }
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
