#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const skillNames = ["codebase-design","boundary-responsibility"];

try {
  const root = path.resolve(__dirname, '..');
  const additionalContext = '아래 스킬의 지침을 위임받은 작업에 적용하고 준수하라.\n\n' + skillNames.map(skill => {
    const source = path.join(root, 'skills', skill, 'SKILL.md');
    const content = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
    return `스킬 원문: ${source}\n상대 문서 링크는 스킬 폴더 ${path.dirname(source)} 기준으로 해석하고 필요한 참조를 읽는다.\n\n${content}`;
  }).join('\n\n');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext },
  }) + '\n');
} catch (error) {
  process.stderr.write(`namuk-process skill injection failed: ${error.message}\n`);
  process.exitCode = 1;
}
