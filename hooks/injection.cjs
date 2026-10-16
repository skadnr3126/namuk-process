'use strict';
const fs = require('node:fs');
const path = require('node:path');
const store = require('./gate-store.cjs');
function recordInstructions(context) {
  return `완료 검사 컨텍스트: ${context.contextPath}\nCLI: node "${path.join(__dirname, 'completion.cjs')}" init|finding|result|check "${context.contextPath}" [입력 JSON 파일]\n작업 전 init으로 mode(implementation 또는 analysis), criteria[{id,kind(behavior/design/analysis),condition,method}], 선택 findings[{id,criterionIds,scope,closureCondition}]를 고정한다. 구현에는 design 기준을 반드시 포함한다. 발견한 문제는 finding으로 즉시 추가한다. 종료 전 ${path.resolve(__dirname, '../skills/code-review/SKILL.md')}를 현재 담당자가 직접 읽고 실제 산출물·호출부를 리뷰한 뒤 result로 outcome(complete 또는 incomplete), criteria[{id,status(satisfied/failed/unverified),evidence:[실제 근거],review:{by:"${context.role === 'main' ? 'main' : 'self'}",evidence:[재확인 근거]}}], findings[{id,status(resolved/unresolved),evidence,review}], remaining:[남은 항목]을 저장하고 check한다. 미완료이면 incomplete와 remaining을 기록한다. 분석 요청도 analysis로 명시한다. 코드 품질·원래 문제 전체 해소 여부는 실제 산출물을 읽고 판단한다. JSON 검사는 의미를 증명하지 않는다. 상세 형식은 ${path.resolve(__dirname, '../skills/request-to-implementation/references/completion-record.md')}를 읽는다.`;
}
function inject(event, skills, prefix = '') {
  try {
    const input = store.read(0);
    if (!input || input.hook_event_name !== event) throw new Error('Expected ' + event + ' input');
    const root = path.resolve(__dirname, '..');
    const bodies = skills.map(skill => {
      const source = path.join(root, 'skills', skill, 'SKILL.md');
      const content = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
      return `스킬 원문: ${source}\n상대 문서 링크는 스킬 폴더 ${path.dirname(source)} 기준으로 해석하고 필요한 참조를 읽는다.\n\n${content}`;
    });
    const context = store.createContext(input, event === 'UserPromptSubmit' ? 'main' : 'worker');
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: prefix + bodies.join('\n\n') + '\n\n' + recordInstructions(context) } }) + '\n');
  } catch (error) {
    process.stderr.write('namuk-process skill injection failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
module.exports = { inject, recordInstructions };


