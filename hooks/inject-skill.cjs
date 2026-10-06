#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const skills = {
  UserPromptSubmit: 'request-to-implementation',
  SubagentStart: 'codebase-design',
};

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const event = input?.hook_event_name;
  if (typeof event !== 'string' || !Object.hasOwn(skills, event)) {
    throw new Error('Unsupported hook_event_name');
  }
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'skills', skills[event], 'SKILL.md');
  const content = fs.readFileSync(source, 'utf8');
  const additionalContext = `스킬 원문: ${source}\n상대 문서 링크는 스킬 폴더 ${path.dirname(source)} 기준으로 해석하고 필요한 참조를 읽는다.\n\n${content}`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext },
  }) + '\n');
} catch (error) {
  process.stderr.write(`namuk-process skill injection failed: ${error.message}\n`);
  process.exitCode = 1;
}
