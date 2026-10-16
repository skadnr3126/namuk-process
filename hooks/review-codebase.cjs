#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reviewSkills = ['codebase-design','boundary-responsibility'];

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
    const reason = `종료 전에 다음 코드 리뷰를 1회 수행하라.\n
이번 위임에서 구현이나 코드 변경을 맡았다면 아래 경로의 모든 원문을 다시 읽고, 자신이 맡은 실제 변경과 관련 호출부를 읽어 리뷰하라. 필요한 상대 문서는 각 스킬 폴더 기준으로 읽어라. 실제 인터페이스와 그 인터페이스를 통한 동작 검증 근거를 모든 원문 기준 및 작업 명세와 대조하라. 기준 위반은 파일 위치와 이유로 설명하고, 권한과 소유 범위 안의 문제는 보완한 뒤 관련 검사를 실행하라. 범위 밖 문제와 실행하지 못한 검증은 메인에 보고하라. 리뷰만을 위해 작업 범위를 넓히지 마라.
이번 위임이 읽기 조사·설명·리뷰 역할이었다면 구현을 맡지 않았음을 짧게 보고하고 종료하라. 다른 작업자의 변경을 자신의 구현으로 판단하지 마라.
이 리뷰는 현재 담당자가 직접 수행하라. 리뷰를 위해 새 서브에이전트를 생성하거나 종료 훅을 직접 재호출하지 마라. 리뷰 결과, 보완 내용, 실행한 검사와 미확인 사항을 최종 응답에 포함하라. 훅 실행 자체를 리뷰 완료의 근거로 삼지 마라.\n
${sources}`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
  }
} catch (error) {
  process.stderr.write(`namuk-process codebase review failed: ${error.message}\n`);
  process.exitCode = 1;
}
