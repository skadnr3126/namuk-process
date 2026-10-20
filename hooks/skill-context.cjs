'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadSkill(name, { frontmatter = false } = {}) {
  const source = path.resolve(__dirname, '..', 'skills', name, 'SKILL.md');
  const raw = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  if (!body.trim()) throw new Error(`Empty skill body: ${source}`);
  const content = frontmatter ? raw : body;
  return `스킬 원문: ${source}\n상대 문서 링크는 스킬 폴더 ${path.dirname(source)} 기준으로 해석하고 필요한 참조를 읽는다.\n\n${content}`;
}

function checkBudget(context, limit) {
  if (context.length > limit) throw new Error(`Skill context exceeds additionalContextLimit ${limit}; no partial context emitted`);
  return context;
}

function emitStartContext(event, names) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
    const limit = config.hooks[event][0].hooks[0].additionalContextLimit;
    if (!Number.isInteger(limit) || limit <= 0) throw new Error(`Invalid additionalContextLimit for ${event}`);
    const additionalContext = checkBudget(names.map(name => loadSkill(name)).join('\n\n'), limit);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }) + '\n');
  } catch (error) {
    process.stderr.write(`namuk-process skill injection failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { loadSkill, checkBudget, emitStartContext };
