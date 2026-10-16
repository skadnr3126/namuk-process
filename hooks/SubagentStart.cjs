#!/usr/bin/env node
'use strict';
require('./injection.cjs').inject('SubagentStart', ['codebase-design', 'boundary-responsibility'],
  '사용자가 정한 목적과 위임받은 작업 범위에 아래 설계 지침을 적용한다. 사용자 수나 미래 확장을 임의로 가정하지 않는다. 메인이 전달한 완료 기준 ID를 보존하고 실제 근거와 미해결 항목을 반환한다.\n\n');
