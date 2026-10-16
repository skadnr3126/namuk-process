#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reviewSkills = ['code-review'];

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  if (!input || Array.isArray(input) || input.hook_event_name !== 'SubagentStop' || typeof input.stop_hook_active !== 'boolean') {
    throw new Error('Expected SubagentStop input with a boolean stop_hook_active');
  }
  if (input.stop_hook_active) {
    process.stdout.write('{}\n');
  } else {
    if (reviewSkills.length === 0) throw new Error('Expected at least one review skill');
    const sources = reviewSkills.map(skill => {
      if (typeof skill !== 'string' || !skill.trim()) throw new Error('Expected a review skill name');
      const source = path.resolve(__dirname, '../skills', skill, 'SKILL.md');
      fs.readFileSync(source, 'utf8');
      return `스킬 원문: ${source}\n상대 문서 기준 폴더: ${path.dirname(source)}`;
    }).join('\n\n');
    const reason = `종료 전 아래 리뷰스킬을 읽고 코드 리뷰를 1회 수행하라.리뷰는 현재 담당자가 직접 수행하라. 리뷰 결과, 보완 내용, 실행한 검사와 미확인 사항을 최종 응답에 포함하라.\n
${sources}`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
  }
} catch (error) {
  process.stderr.write(`namuk-process codebase review failed: ${error.message}\n`);
  process.exitCode = 1;
}
