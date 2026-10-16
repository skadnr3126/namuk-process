# 남욱 프로세스

사용자 요청을 검증해 작업 맥락을 만들고 구현 담당자에게 명세를 전달한 뒤 실제 결과를 완료 기준과 대조하는 플러그인입니다.

## 작업 흐름

1. 메인이 [요청 검증과 구현 위임](skills/request-to-implementation/SKILL.md)에 따라 의도·대상·제약·완료 기준을 확인합니다.
2. 설명·분석은 메인이 직접 처리합니다. 구현은 [작업 명세](skills/request-to-implementation/references/task-brief.md)와 파일 소유권을 정해 서브에이전트에 위임합니다.
3. 구현 담당자는 [코드베이스 설계](skills/codebase-design/SKILL.md)와 [경계와 책임](skills/boundary-responsibility/SKILL.md)에 따라 실제 코드를 확인하고 구현·검증합니다.
4. 담당자의 첫 종료에서 종료 훅이 별도의 `codex exec` 리뷰를 실행하고 결과를 기다립니다. 리뷰 결과를 받은 담당자가 의견을 검토하고 필요한 보완·검증을 이어갑니다.
5. 메인은 변경 내용과 리뷰·검증 근거를 확인한 뒤 완료를 판단합니다. 부족하면 같은 담당자에게 보완을 요청합니다.

사용자 요구, 확인한 사실, 가정과 미확인 사항을 구분합니다. 다음 행동을 결정할 정보가 부족할 때만 질문합니다. 커밋·푸시·Draft PR은 사용자 요청과 프로젝트 규칙이 허용한 범위에서 수행합니다.

## 번들 훅

[훅 설정](hooks/hooks.json)은 `UserPromptSubmit`에서 `request-to-implementation`, `SubagentStart`에서 `codebase-design`과 `boundary-responsibility`를 주입합니다. [UserPromptSubmit](hooks/UserPromptSubmit.cjs)와 [SubagentStart](hooks/SubagentStart.cjs)는 설치 플러그인의 스킬 본문을 읽고 BOM·YAML frontmatter를 제외합니다. 시작 주입은 stdin을 기다리지 않으며 `additionalContextLimit`은 20000입니다.

`SubagentStop`의 [리뷰 훅](hooks/review-codebase.cjs)은 설치 플러그인의 `skills/code-review/SKILL.md` 원문을 실행 시점에 읽습니다. 원문과 절대 원본 경로, 상대 문서 기준 폴더를 프롬프트에 넣고 [Codex 실행기](hooks/codex-review.cjs)를 호출합니다. 원문의 참조 문서는 리뷰어가 필요한 만큼 읽습니다. 시작 주입과 달리 리뷰에는 frontmatter를 포함한 원문을 전달합니다.

리뷰 맥락에는 `agent_id`, `agent_type`, `last_assistant_message`, `agent_transcript_path`를 JSON 데이터로 포함합니다. 리뷰어가 transcript에서 사용자 요청·담당 범위·완료 기준·검증 근거를 확인하도록 지시합니다. transcript 전체를 훅이 읽어 복사하지 않습니다. transcript가 없거나 읽을 수 없으면 마지막 응답과 실제 변경으로 확인한 범위 및 부족한 맥락을 보고하게 합니다. 긴 transcript는 필요한 부분만 읽습니다. 작업 디렉터리는 입력의 `cwd`를 쓰며, 없으면 훅의 현재 작업 디렉터리를 사용합니다.

실행기는 다음 명령에 해당하는 인자를 전달하고 프롬프트는 stdin으로 보냅니다.

```text
codex exec --disable hooks --ephemeral -C <작업경로> -s read-only -o <실행별 결과파일> -
```

자식은 읽기 전용으로 리뷰 의견을 반환합니다. `--disable hooks`와 자식 전용 `NAMUK_PROCESS_REVIEW_CHILD=1`로 훅 재귀 실행을 막습니다. 실행기는 부모의 `CODEX_THREAD_ID`와 `NAMUK_PROCESS_COMPLETION*`, `NAMUK_PROCESS_GATE*` 환경변수를 자식에게 넘기지 않습니다. 사용자 훅 설정이나 신뢰 설정은 변경하지 않습니다.

실행기는 CLI 종료까지 기다린 뒤 `-o` 결과파일을 읽습니다. 훅은 리뷰 의견을 `decision: "block"`의 `reason`으로 반환하여 담당자가 작업을 이어가게 합니다. 담당자는 권한과 소유 범위 안에서 필요한 보완·검증을 수행하고 채택하지 않은 의견은 근거를 남깁니다. 발견사항 유무와 관계없이 의견을 한 번 전달합니다. 이 훅은 리뷰 의견을 자동으로 채택하거나 완료를 승인하지 않습니다.

후속 종료의 `stop_hook_active: true`에는 `{}`를 반환하여 같은 리뷰 요청을 반복하지 않습니다. 이는 별도 완료 검사나 다른 훅의 종료 판단을 대신하지 않습니다. 수정 후 자동 재리뷰를 반복하는 기능은 포함하지 않습니다.

CLI 실패, 빈 결과, 읽을 수 없는 스킬, 잘못된 훅 입력은 실패 이유를 담은 `block`으로 담당자에게 전달합니다. 실행기는 240초 뒤 자식을 중단하며 Windows에서는 프로세스 트리도 종료합니다. 등록된 훅의 제한 시간은 정리 시간을 포함해 300초입니다. 성공·실패 후 실행별 임시 결과 폴더를 삭제합니다. 결과 본문은 잘라내지 않으므로 호스트의 훅 출력 한도를 넘지 않도록 리뷰어에게 간결한 출력을 요청합니다.

Node.js와 `--disable hooks`를 지원하고 로그인된 Codex CLI가 PATH에 있어야 합니다. 별도 실행 파일은 `NAMUK_PROCESS_CODEX_EXECUTABLE`에 절대경로로 지정할 수 있습니다. Windows의 `.exe`와 `.cmd`·`.bat` 실행을 지원합니다. 배치 실행 시 경로·인자는 환경변수의 데이터로 전달하며 프롬프트를 셸 명령에 조립하지 않습니다.

상태 메시지는 시작 시 `Loading request-to-implementation...`, `Loading codebase-design and boundary-responsibility...`, 종료 시 `Waiting for independent code review...`입니다. 훅 등록 명령은 `process.env.PLUGIN_ROOT`로 설치 경로를 찾습니다.

로컬 번들 변경만으로 현재 설치본 훅이 바뀌지는 않습니다. 설치본에 변경을 반영하고 `/hooks`에서 현재 정의를 검토·신뢰한 뒤 실제 이벤트를 확인해야 합니다. 설치·활성화와 출력 형식은 [공식 훅 문서](https://learn.chatgpt.com/docs/hooks)를 따릅니다.

## 검증

```text
node --test hooks/review-codebase.test.cjs
node --test hooks/inject-skill.test.cjs
```

리뷰 테스트는 별도 가짜 CLI 프로세스를 실행해 stdin 원문·맥락, 결과 대기와 전달, Windows 배치 실행, 재귀·중복 방지, 실패·빈 결과·시간 초과와 임시 파일 정리를 확인합니다. 실제 모델의 판단이나 호스트의 담당자 재개는 이 테스트만으로 검증하지 않습니다. 실제 Codex CLI와 신뢰된 훅 이벤트로 별도 확인해야 합니다.

- [요청 검증](skills/verify-request/SKILL.md)
- [플러그인 철학](플러그인철학.md)
