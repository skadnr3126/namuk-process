# 남욱 프로세스

사용자 요청을 검증해 작업 맥락을 만들고 구현 담당자에게 명세를 전달한 뒤 실제 결과를 완료 기준과 대조하는 플러그인입니다.

## 작업 흐름

1. 메인이 [요청 검증과 구현 위임](skills/request-to-implementation/SKILL.md)에 따라 매 요청의 의도·대상·제약·완료 기준을 내부적으로 확인합니다.
2. 필요한 맥락을 조사합니다. 다음 행동을 결정할 정보가 부족할 때만 질문하고 이미 확보한 맥락은 재사용합니다.
3. 설명·분석은 메인이 직접 처리합니다. 구현은 [작업 명세](skills/request-to-implementation/references/task-brief.md)와 파일 소유권을 정해 서브에이전트에 위임합니다.
4. 구현 담당자는 [코드베이스 설계](skills/codebase-design/SKILL.md)에 따라 실제 코드를 확인하고 설계·구현·자체 검증합니다.
5. 메인은 변경 내용과 검증 근거를 확인한 뒤 완료를 판단합니다. 부족하면 같은 담당자에게 보완을 요청합니다.

사용자 요구, 확인한 사실, 가정과 미확인 사항을 구분합니다. 매 요청의 검증이 매번 질문하거나 모든 검증 스킬을 실행한다는 뜻은 아닙니다. 커밋·푸시·Draft PR은 사용자 요청과 프로젝트 규칙이 허용한 범위에서 수행합니다.

## 번들 훅

[훅 설정](hooks/hooks.json)은 `UserPromptSubmit`에서 `request-to-implementation`, `SubagentStart`에서 `codebase-design`을 주입합니다. [주입 스크립트](hooks/inject-skill.cjs)가 설치된 플러그인의 스킬 원문에서 BOM·YAML frontmatter를 제외한 본문을 읽으므로 훅에 판단 규칙을 복사하지 않습니다. 모든 서브에이전트 시작에 설계 스킬을 전달하고 실제 위임 역할에 따라 구현 책임을 적용합니다.

훅 실행 중 상태 메시지는 각각 `Loading request-to-implementation...`, `Loading codebase-design...`로 표시합니다. 스크립트는 본문과 이벤트 이름을 `hookSpecificOutput.additionalContext` 및 `hookSpecificOutput.hookEventName`으로 반환합니다. 잘못되거나 누락된 이벤트 인자와 읽을 수 없는 스킬은 stderr와 종료 코드 1로 알리고 컨텍스트를 출력하지 않습니다.

Node.js가 실행 환경의 PATH에 있어야 합니다. 하나의 `node -e` 명령이 `process.env.PLUGIN_ROOT`로 스크립트를 찾으므로 셸별 환경변수 문법과 별도 Windows 래퍼가 필요하지 않습니다. 등록된 이벤트를 고정 명령 인자로 전달하고 stdin을 읽지 않아 입력 파이프가 열려 있어도 종료합니다. 상대 문서 링크를 해석할 스킬 원본 경로도 전달합니다. `additionalContextLimit`은 본문이 기본 출력 한도로 잘리는 것을 줄이기 위해 20000으로 지정했습니다. 스킬이 커지면 이 한도를 다시 검토해야 합니다.

[Ponytail의 훅 명령](https://github.com/dietrichgebert/ponytail/blob/main/hooks/claude-codex-hooks.json), [본문 주입](https://github.com/dietrichgebert/ponytail/blob/main/hooks/ponytail-instructions.js), [서브에이전트 주입](https://github.com/dietrichgebert/ponytail/blob/main/hooks/ponytail-subagent.js)을 비교해 환경변수를 Node에서 읽는 명령, frontmatter 제외, 불필요한 stdin 대기 제거를 반영했습니다. 현재 이벤트 두 개와 Codex 출력 형식은 유지합니다.

로컬 번들 구현과 스크립트 검증을 완료해도 현재 설치본에서 자동 주입이 활성화됐다는 뜻은 아닙니다. 설치본에 변경을 반영하고 `/hooks`에서 현재 정의를 검토·신뢰한 뒤 실제 이벤트 실행을 확인해야 합니다. 설치·활성화만으로 훅을 신뢰하지 않는 동작과 출력 형식은 [공식 훅 문서](https://learn.chatgpt.com/docs/hooks)를 따릅니다. 검증·독립 리뷰 훅은 포함하지 않았습니다.

로컬 검증은 저장소 루트에서 `node --test hooks/inject-skill.test.cjs`로 실행합니다. 실제 스크립트를 다른 작업 위치와 공백·한글이 있는 설치 경로에서 실행하고, 두 이벤트의 본문 주입, 잘못된 이벤트 인자, 누락된 스킬, 열린 입력 파이프와 manifest 연결을 확인합니다.

상세 판단 기준은 [요청 검증](skills/verify-request/SKILL.md)에 모았습니다. 명확성, 실제 맥락과의 적합성, 목표와 수단의 연결을 필요한 범위에서 확인합니다.

- [플러그인 철학](플러그인철학.md)
