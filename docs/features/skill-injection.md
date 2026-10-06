# 스킬 주입

`UserPromptSubmit`은 메인에게 `request-to-implementation`, `SubagentStart`는 모든 서브에이전트에게 `codebase-design`을 전달한다. 구현·문서 갱신 책임은 실제 작업 명세의 역할에 따라 적용한다.

훅 실행 중 상태 메시지는 각각 `Loading request-to-implementation...`, `Loading codebase-design...`로 표시한다.

## 실행과 코드

[manifest](../../.codex-plugin/plugin.json)가 [훅 설정](../../hooks/hooks.json)을 연결한다. 각 등록 명령은 Node에서 `PLUGIN_ROOT`를 읽어 [주입 스크립트](../../hooks/inject-skill.cjs)를 불러오고 고정 이벤트 인자를 전달한다. 스크립트는 자기 설치 위치에서 스킬을 읽고 BOM과 닫힌 YAML frontmatter를 제외한 본문을 `hookSpecificOutput.additionalContext`로 반환한다. 이벤트 이름도 동일 출력에 포함한다. 원본 파일·폴더 경로를 함께 전달해 상대 참조를 읽을 수 있게 한다.

사용자 프롬프트나 stdin payload는 읽지 않는다. 이벤트는 등록 명령에 이미 정해져 있으므로 열린 입력 파이프의 EOF를 기다릴 이유가 없다. 잘못되거나 누락된 이벤트 인자와 읽을 수 없는 스킬은 stderr와 종료 코드 1로 알리고 컨텍스트를 출력하지 않는다. 훅은 프로젝트 문서를 수정하지 않는다.

## 선택 이유와 제약

[Ponytail](https://github.com/dietrichgebert/ponytail)의 명령·스킬 본문 처리·기본 서브에이전트 주입을 비교해 셸별 환경변수 문법 제거, frontmatter 제외와 stdin 대기 제거를 반영했다. 스킬 본문은 정본 파일에서 읽고 별도 정책 복사본을 두지 않는다. 추가 이벤트나 실행 모드 상태는 필요하지 않다.

Node가 PATH에 있어야 한다. 출력 한도는 각 등록에 20000으로 지정하며 스킬이 커지면 재검토한다. 설치·활성화만으로 신뢰되지 않으므로 설치본 변경 반영 후 `/hooks`에서 검토·신뢰하고 실제 이벤트 실행을 확인해야 한다.

## 검증 근거

2026-10-06, 커밋 전 작업 파일 `hooks/hooks.json`, `hooks/inject-skill.cjs`, [통합 테스트](../../hooks/inject-skill.test.cjs)를 확인했다. `node --test hooks/inject-skill.test.cjs`의 6개 테스트와 `git diff --check`가 통과했다.

Windows에서 PowerShell과 native cmd 모두 동일 명령으로 공백·한글 설치 경로와 다른 cwd에서 두 이벤트를 실행했다. 정본 본문 일치, BOM·frontmatter 제거와 plain 본문 보존, 열린 stdin 파이프에서도 종료, 잘못된 이벤트·누락 스킬 실패, manifest 및 문서 링크를 검증한다.

실제 설치본의 훅 신뢰와 이벤트 실행, POSIX 셸 실행은 미확인이다. 로컬 테스트 통과가 실제 자동 주입 활성화나 에이전트의 규칙 준수를 입증하지 않는다.
