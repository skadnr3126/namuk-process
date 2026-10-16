# 남욱 프로세스

사용자 의도에 맞는 코드를 만들고, 완료 기준별 근거와 미해결 문제를 확인하는 플러그인입니다. 스킬은 판단 기준을 제공하고, 훅은 지침 전달과 완료 기록 검사를 담당합니다. 자동 검사가 설계 타당성이나 코드 정확성을 보장하지는 않습니다.

## 작업 흐름

1. 메인이 요청·범위·제약을 검증하고 기준 ID별 통과 조건과 확인 방법을 고정합니다. 훅이 제공한 현재 컨텍스트에 `init`으로 기록합니다.
2. 설명·분석은 메인이 처리합니다. 구현은 파일 소유권과 [작업 명세](skills/request-to-implementation/references/task-brief.md)를 정해 위임합니다. 신규 기능이나 여러 책임을 바꾸면 코드 작성 전에 변경 이유·담당 모듈·원본 상태 소유자와 갱신 경로·호출자 계약을 짧게 기록합니다.
3. 구현 담당자는 실제 코드와 명세를 대조하고, 동작 변경은 [debug-verify](skills/debug-verify/SKILL.md)로 검증합니다. 문서 변경은 해당 산출물과 참조·주입 결과로 확인합니다.
4. 담당자는 실제 근거와 자체 검토를 반환합니다. 메인은 주요 코드와 호출부를 직접 읽고 원래 기준과 문제의 전체 범위를 재확인합니다. 일부 파일 분리나 빌드 성공으로 책임 검토를 대신하지 않습니다.
5. 기준별 결과·문제·남은 항목을 `result`로 기록하고 `check`를 실행합니다. 진행할 수 없으면 `incomplete`로 남은 작업과 이유를 보고합니다. 필수 기준이 미확인·미충족이거나 문제가 열려 있으면 전체 완료로 보고하지 않습니다.

사용자 요구·확인한 사실·가정을 구분합니다. 모든 요청에 질문이나 대규모 문서를 요구하지 않으며, 서비스 규모와 설계 투자는 실제 요구에서 정합니다. 커밋·푸시·PR은 별도로 허용된 범위에서 수행합니다.

## 스킬

| 스킬 | 담당 |
| --- | --- |
| [request-to-implementation](skills/request-to-implementation/SKILL.md) | 요청부터 위임·결과 회수·완료 판단까지 관리 |
| [verify-request](skills/verify-request/SKILL.md) | 불확실한 요청의 명확성·맥락·목표와 수단 판단 |
| [codebase-design](skills/codebase-design/SKILL.md) | 인터페이스·교체 지점·깊은 모듈 설계 |
| [boundary-responsibility](skills/boundary-responsibility/SKILL.md) | 변경 이유·지식 배치·상태 소유권 |
| [code-review](skills/code-review/SKILL.md) | 현재 사용 문제와 근거 있는 다음 변경 비용 리뷰 |
| [debug-verify](skills/debug-verify/SKILL.md) | 실제 동작·값·저장 결과 확인과 원인 추적 |
| [explain-execution-flow](skills/explain-execution-flow/SKILL.md) | 코드와 실제 값으로 실행 흐름 설명 |
| [feature-future](skills/feature-future/SKILL.md) | 사용자가 명시적으로 호출하는 미션·설계 고찰 대화 |

`code-review`가 `feature-future`의 판단 관점을 읽어도 그 대화 모드를 활성화하지 않습니다.

## 훅과 완료 기록

[hooks.json](hooks/hooks.json)은 다음 이벤트를 등록합니다.

- `UserPromptSubmit`: 메인 워크플로우와 현재 요청의 완료 기록 컨텍스트를 전달합니다.
- `SubagentStart`: 코드베이스 설계·경계와 책임, 해당 담당자의 기록 컨텍스트를 전달합니다. 실제 구현 여부는 위임 명세로 구분합니다.
- `Stop`: 메인의 기준별 근거·재확인·미해결 항목을 검사합니다.
- `SubagentStop`: 담당자의 기록을 검사하고 [code-review](skills/code-review/SKILL.md)를 기준으로 자체 검토하도록 안내합니다. 독립 리뷰어를 자동 생성하지 않습니다.

시작 훅은 설치된 스킬 원문에서 BOM·frontmatter를 제외한 본문을 읽습니다. [review-codebase.cjs](hooks/review-codebase.cjs)는 `SubagentStop`, [Stop.cjs](hooks/Stop.cjs)는 `Stop`을 공통 [stop-gate.cjs](hooks/stop-gate.cjs)에 연결합니다. 공통 종료 검사의 리뷰 대상은 `code-review`입니다. 검토자는 시작 지침의 링크와 실패 안내의 원문 경로를 따라 실제 변경을 대조합니다. 설치본의 종료 검사와 스킬 원문도 함께 반영해야 합니다.

[완료 기록 계약](skills/request-to-implementation/references/completion-record.md)에 CLI 입력과 예시가 있습니다. `hooks/completion.cjs`의 명령은 `init`, `finding`, `result`, `check`입니다. 시작 훅이 준 컨텍스트 경로를 사용하며, 이전 세션·턴·다른 담당자의 기록을 재사용하지 않습니다. 기준은 생성 후 덮어쓰지 않고 발견 문제는 추가해 추적합니다.

자동 검사는 고정한 기준 ID의 누락, 상태, 필수 근거와 검토 필드, 미해결 문제와 남은 항목을 검사합니다. 메인의 `main` 재확인과 담당자의 `self` 검토는 구분합니다. 반복 방지 플래그만으로 잘못된 완료 기록을 승인하지 않습니다. 기록 누락·오류를 고치도록 한 번 안내한 뒤에도 잘못됐으면 실패를 명시합니다. 답변 문장을 분석해 완료 주장을 판정하지 않으므로 기록·실제 근거·최종 보고를 일치시키는 의미 검토는 모델의 책임입니다.

## 설치 후 적용과 검증

Node.js가 PATH에 있어야 합니다. 훅 명령은 `process.env.PLUGIN_ROOT`로 설치 위치를 찾습니다. 시작 컨텍스트에 기록 경로가 실제로 전달되고, 종료 시 그 컨텍스트의 기록이 검사되는지 확인합니다. 지원되지 않는 입력이나 파일 오류를 성공으로 처리하지 않습니다.

설치본을 갱신해도 현재 채팅에서 새 훅이 활성화됐다고 볼 수 없습니다. `/hooks`에서 현재 정의를 검토·신뢰하고 실제 이벤트 실행을 확인해야 합니다. 신뢰·보안 설정을 자동 수정하지 않습니다. 업데이트 전에 시작해 새 컨텍스트가 없는 작업은 기준별 근거와 미해결 문제를 수동 대조하고 자동 검사의 미적용을 밝힙니다.

저장소 루트에서 다음 검사를 실행합니다.

```text
node --test hooks/*.test.cjs
```

테스트는 실제 등록 명령의 실행, 본문 주입, 입력 오류, 경로 차이와 완료 기록의 통과·차단 조건을 검증합니다. 의미 있는 설계 검토나 실제 새 작업의 준수율을 증명하는 테스트는 아닙니다. 별도로 변경된 스킬의 frontmatter·참조 링크와 실제 코드 검토 근거를 확인합니다.

판단 기준과 구성 이유는 [플러그인 철학](플러그인철학.md)에 있습니다.
