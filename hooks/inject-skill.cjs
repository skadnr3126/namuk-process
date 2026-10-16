#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const skills = {
  UserPromptSubmit: 'request-to-implementation',
  SubagentStart: ['codebase-design', 'boundary-responsibility']
};

try {
  const event = process.argv.at(-1);
  if (typeof event !== 'string' || !Object.hasOwn(skills, event)) {
    throw new Error('Expected UserPromptSubmit or SubagentStart event argument');
  }
  const root = path.resolve(__dirname, '..');
  const skillNames = Array.isArray(skills[event]) ? skills[event] : [skills[event]];
  const additionalContext = skillNames.map(skill => {
    const source = path.join(root, 'skills', skill, 'SKILL.md');
    const content = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
    return `스킬 원문: ${source}\n상대 문서 링크는 스킬 폴더 ${path.dirname(source)} 기준으로 해석하고 필요한 참조를 읽는다.\n\n${content}`;
  }).join('\n\n');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext },
  }) + '\n');
} catch (error) {
  process.stderr.write(`namuk-process skill injection failed: ${error.message}\n`);
  process.exitCode = 1;
}
