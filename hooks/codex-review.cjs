'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const REVIEW_TIMEOUT_MS = 240000;

function commandFor(args, env) {
  const executable = env.NAMUK_PROCESS_CODEX_EXECUTABLE || 'codex';
  if (process.platform !== 'win32') return { executable, args };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
  const candidates = path.isAbsolute(executable) ? [executable]
    : (env[pathKey] || '').split(path.delimiter).flatMap(directory =>
      ['.exe', '.cmd', '.bat', ''].map(extension => path.join(directory, executable + extension)));
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error(`Codex executable not found: ${executable}`);
  if (!/\.(cmd|bat)$/i.test(found)) return { executable: found, args };
  // Arguments travel as data through the environment, never as shell source.
  env.NAMUK_PROCESS_CODEX_COMMAND = found;
  env.NAMUK_PROCESS_CODEX_ARGS = JSON.stringify(args);
  return { executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', '$reviewArgs = ConvertFrom-Json $env:NAMUK_PROCESS_CODEX_ARGS; & $env:NAMUK_PROCESS_CODEX_COMMAND @reviewArgs; exit $LASTEXITCODE'] };
}

async function reviewWithCodex({ cwd, prompt, timeoutMs = REVIEW_TIMEOUT_MS, env = process.env }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'namuk-codex-review-'));
  const output = path.join(directory, 'review.txt');
  try {
    const childEnv = { ...env, NAMUK_PROCESS_REVIEW_CHILD: '1' };
    for (const key of Object.keys(childEnv)) {
      if (/^(NAMUK_PROCESS_(COMPLETION|GATE)|CODEX_THREAD_ID)/.test(key)) delete childEnv[key];
    }
    const args = ['exec', '--disable', 'hooks', '--ephemeral', '-C', cwd, '-s', 'read-only', '-o', output, '-'];
    const command = commandFor(args, childEnv);
    await new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.args, { cwd, env: childEnv, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      let stderr = '';
      let timedOut = false;
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
      child.stdin.on('error', () => {});
      child.on('error', reject);
      const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        } else child.kill('SIGKILL');
      }, timeoutMs);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (timedOut) reject(new Error(`codex exec timed out after ${timeoutMs}ms`));
        else if (code !== 0) reject(new Error(`codex exec failed (${code ?? signal}): ${stderr.trim()}`));
        else resolve();
      });
      child.stdin.end(prompt);
    });
    const result = fs.readFileSync(output, 'utf8').trim();
    if (!result) throw new Error('codex exec returned an empty review');
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
module.exports = { reviewWithCodex, REVIEW_TIMEOUT_MS };
