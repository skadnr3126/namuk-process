# Feature map

이번 작업에서 확인한 기능의 색인이다. 기능별 문서는 구현 담당자가 갱신하고 공통 색인은 메인이 검증 근거를 확인해 취합한다.

| 기능 | 기능 문서 | 코드 | 검증 |
|---|---|---|---|
| 스킬 주입 | [동작과 제약](features/skill-injection.md) | [훅 설정](../hooks/hooks.json), [주입 스크립트](../hooks/inject-skill.cjs) | `node --test hooks/inject-skill.test.cjs`, 2026-10-06 Windows에서 6개 통과. 설치본 이벤트와 POSIX 실행은 미확인 |
