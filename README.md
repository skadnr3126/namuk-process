# 남욱 프로세스

사용자 요청을 검증해 작업 맥락을 만들고 구현 담당자에게 명세를 전달한 뒤 실제 결과를 완료 기준과 대조하는 플러그인입니다.

## 작업 흐름

1. 메인이 [요청 검증과 구현 위임](skills/request-to-implementation/SKILL.md)에 따라 매 요청의 의도·대상·제약·완료 기준을 내부적으로 확인합니다.
2. 필요한 맥락을 조사합니다. 다음 행동을 결정할 정보가 부족할 때만 질문하고 이미 확보한 맥락은 재사용합니다.
3. 설명·분석은 메인이 직접 처리합니다. 구현은 [작업 명세](skills/request-to-implementation/references/task-brief.md)와 파일 소유권을 정해 서브에이전트에 위임합니다.
4. 구현 담당자는 [코드베이스 설계](skills/codebase-design/SKILL.md)에 따라 실제 코드를 확인하고 설계·구현·자체 검증합니다.
5. 종료 훅이 첫 종료를 보류하면 담당자가 코드베이스 설계 원문과 실제 변경·호출부·검증 근거를 대조하는 자체 리뷰를 1회 수행합니다.
6. 메인은 변경 내용과 리뷰·검증 근거를 확인한 뒤 완료를 판단합니다. 부족하면 같은 담당자에게 보완을 요청합니다.

사용자 요구, 확인한 사실, 가정과 미확인 사항을 구분합니다. 매 요청의 검증이 매번 질문하거나 모든 검증 스킬을 실행한다는 뜻은 아닙니다. 커밋·푸시·Draft PR은 사용자 요청과 프로젝트 규칙이 허용한 범위에서 수행합니다.

## 번들 훅

[훅 설정](hooks/hooks.json)은 `UserPromptSubmit`에서 `request-to-implementation`, `SubagentStart`에서 `codebase-design`을 주입합니다. [주입 스크립트](hooks/inject-skill.cjs)가 설치된 플러그인의 스킬 원문에서 BOM·YAML frontmatter를 제외한 본문을 읽으므로 훅에 판단 규칙을 복사하지 않습니다. 모든 서브에이전트 시작에 설계 스킬을 전달하고 실제 위임 역할에 따라 구현 책임을 적용합니다.

`SubagentStop`의 [리뷰 스크립트](hooks/review-codebase.cjs)는 첫 종료에 `decision: "block"`과 리뷰 지시를 `reason`으로 반환합니다. 현재 담당자가 지정된 모든 스킬 원문을 다시 읽도록 각각의 절대경로와 상대 문서 기준 폴더를 전달합니다. 종료 지시는 기본 출력 한도 안에 두고 스킬 본문을 중복 출력하지 않습니다. 담당자가 자신이 맡은 실제 변경·호출부·인터페이스 검증 근거를 원문 및 명세와 대조하고, 권한과 소유 범위 안의 문제를 보완하도록 합니다. 읽기 조사·설명·리뷰 역할은 구현을 맡지 않았음을 짧게 보고합니다. 새 리뷰어는 생성하지 않습니다.

리뷰할 스킬은 스크립트 상단의 `const reviewSkills = ['codebase-design'];` 목록에서 편집합니다. 스킬 이름을 추가하고 해당 원문을 `skills/<name>/SKILL.md`에 둡니다. 기본 목록에는 `codebase-design`만 있습니다. 목록은 하나 이상이어야 하며 이름이 비었거나 원문을 읽을 수 없으면 일부 경로만 출력하지 않고 실패합니다. 수정한 스크립트와 추가 원문을 설치본에도 반영해야 실제 종료 훅에서 사용합니다. 많은 스킬을 추가하면 종료 지시의 출력 한도를 확인해야 합니다.

리뷰로 이어진 종료는 stdin JSON의 `stop_hook_active: true`를 확인해 `{}`를 반환합니다. `continue: false`를 쓰지 않으므로 다른 훅의 종료 판단을 덮어쓰지 않습니다. 잘못된 JSON, 누락되거나 잘못된 이벤트 이름·불리언 플래그, 읽을 수 없는 원문은 stderr와 종료 코드 1로 알리고 차단 지시를 출력하지 않습니다. 이 훅은 담당자의 자체 리뷰를 한 번 요청하며, 실제 리뷰 수행이나 코드 정확성을 자동으로 판정하지 않습니다.

시작 주입 중 상태 메시지는 각각 `Loading request-to-implementation...`, `Loading codebase-design...`이며 종료 리뷰는 `Reviewing codebase-design...`입니다. 주입 스크립트는 본문과 이벤트 이름을 `hookSpecificOutput.additionalContext` 및 `hookSpecificOutput.hookEventName`으로 반환합니다. 잘못되거나 누락된 이벤트 인자와 읽을 수 없는 스킬은 stderr와 종료 코드 1로 알리고 컨텍스트를 출력하지 않습니다.

Node.js가 실행 환경의 PATH에 있어야 합니다. 하나의 `node -e` 명령이 `process.env.PLUGIN_ROOT`로 스크립트를 찾으므로 셸별 환경변수 문법과 별도 Windows 래퍼가 필요하지 않습니다. 시작 주입은 등록된 이벤트를 고정 명령 인자로 전달하고 stdin을 읽지 않아 입력 파이프가 열려 있어도 종료합니다. 종료 리뷰는 stdin JSON을 읽고 반복 방지 플래그를 확인하므로 입력 파이프가 닫혀야 합니다. `additionalContextLimit`은 시작 시 주입 본문이 기본 출력 한도로 잘리는 것을 줄이기 위해 20000으로 지정했습니다. 이 설정은 종료 리뷰의 `reason` 한도를 늘리지 않습니다. 스킬이 커지면 주입 한도를 다시 검토해야 합니다.

[Ponytail의 훅 명령](https://github.com/dietrichgebert/ponytail/blob/main/hooks/claude-codex-hooks.json), [본문 주입](https://github.com/dietrichgebert/ponytail/blob/main/hooks/ponytail-instructions.js), [서브에이전트 주입](https://github.com/dietrichgebert/ponytail/blob/main/hooks/ponytail-subagent.js)을 비교해 환경변수를 Node에서 읽는 명령, frontmatter 제외, 시작 주입의 불필요한 stdin 대기 제거를 반영했습니다. 기존 두 주입 이벤트는 유지하고 `SubagentStop`을 추가했습니다.

로컬 번들 구현과 스크립트 검증을 완료해도 현재 설치본에서 훅이 활성화됐다는 뜻은 아닙니다. 설치본에 변경을 반영하고 `/hooks`에서 현재 정의를 검토·신뢰한 뒤 실제 이벤트 실행을 확인해야 합니다. 설치·활성화만으로 훅을 신뢰하지 않는 동작과 출력 형식은 [공식 훅 문서](https://learn.chatgpt.com/docs/hooks)를 따릅니다. 별도 에이전트의 독립 리뷰는 포함하지 않습니다.

로컬 검증은 저장소 루트에서 `node --test hooks/inject-skill.test.cjs hooks/review-codebase.test.cjs`로 실행합니다. 실제 등록 명령을 다른 작업 위치와 공백·한글이 있는 설치 경로에서 실행합니다. 두 이벤트의 본문 주입, 잘못된 이벤트 인자, 누락된 스킬, 열린 입력 파이프와 manifest 연결을 확인합니다. 종료 리뷰는 Windows PowerShell·cmd 파이프로 첫 차단과 반복 방지, 잘못된 입력, 선택적 메타데이터, 원본 경로 전달을 확인합니다.

상세 판단 기준은 [요청 검증](skills/verify-request/SKILL.md)에 모았습니다. 명확성, 실제 맥락과의 적합성, 목표와 수단의 연결을 필요한 범위에서 확인합니다.

- [플러그인 철학](플러그인철학.md)
