'use strict';
const fs = require('node:fs');
const path = require('node:path');
const store = require('./gate-store.cjs');
function reject(input, message) {
  if (input.stop_hook_active) return { continue: false, stopReason: 'namuk-process: completion verification failed; task remains incomplete.',
    systemMessage: '완료 검증 실패로 자동 보완을 종료합니다. 전체 완료로 승인되지 않았습니다. 미해결: ' + message };
  return { decision: 'block', reason: message + '\n완료 근거를 보완하거나 outcome=incomplete와 remaining을 기록하라. 종료 훅을 직접 호출하거나 새 에이전트를 만들지 마라. 다음 검사도 실패하면 미완료로 종료한다.' };
}
function run(event) {
  let input;
  try {
    input = store.read(0);
    if (!input || input.hook_event_name !== event || typeof input.stop_hook_active !== 'boolean') throw new Error('Expected ' + event + ' input with boolean stop_hook_active');
    const context = store.activeContext(input, event === 'Stop' ? 'main' : 'worker');
    try {
      const result = store.check(context);
      process.stdout.write(JSON.stringify(result.outcome === 'incomplete' ? { systemMessage: '미완료 기록 확인: ' + result.remaining.join('; ') } : {}) + '\n');
    } catch (error) {
      const review = path.resolve(__dirname, '../skills/code-review/SKILL.md');
      fs.readFileSync(review, 'utf8');
      const instructions = `완료 기록 검사 실패: ${error.message}\n스킬 원문: ${review}\n현재 담당자가 원문과 실제 산출물·호출부를 직접 검토하라. 읽기 조사·설명 역할이면 코드 수정을 요구하지 않는다. 보완은 권한과 소유 범위 안에서 수행한다.\n` + require('./injection.cjs').recordInstructions(context);
      process.stdout.write(JSON.stringify(reject(input, instructions)) + '\n');
    }
  } catch (error) {
    const message = 'namuk-process completion gate failed: ' + error.message;
    process.stdout.write(JSON.stringify(reject(input && typeof input === 'object' ? input : {}, message)) + '\n');
  }
}
module.exports = { run };
