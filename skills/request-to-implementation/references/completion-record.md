# 실행 가능한 완료 기록

현재 `UserPromptSubmit` 또는 `SubagentStart`가 제공한 컨텍스트 경로와 명령을 사용한다. 경로를 추측하거나 이전 요청·세션·다른 담당자의 기록을 재사용하지 않는다. 컨텍스트는 세션·턴·담당자에 연결되며 기록은 컨텍스트 토큰과 기준 원문의 digest에 연결된다.

## 명령과 순서

CLI는 플러그인의 `hooks/completion.cjs`다. 훅이 제공한 실제 경로로 다음 명령을 실행한다. JSON 입력 파일은 UTF-8로 저장한다.

```text
node <completion.cjs> init <context.json> <baseline.json>
node <completion.cjs> finding <context.json> <finding.json>
node <completion.cjs> result <context.json> <result.json>
node <completion.cjs> check <context.json>
```

1. 요청 검증 후 구현 전에 `init`으로 기준을 고정한다. 분석만 하는 요청은 `mode: "analysis"`로 산출물의 기준을 적으며 코드 구현을 요구하지 않는다. 구현은 `mode: "implementation"`을 쓴다.
2. 새 문제를 발견하면 `finding`으로 즉시 추가한다. 보완 요청이나 일부 수정으로 원래 범위를 줄이지 않는다.
3. 현재 산출물과 호출부·실행 결과를 확인한 뒤 `result`를 기록한다. 메인은 자신의 재확인을 `main`, 구현 담당자는 자체 확인을 `self`로 구분한다. 담당자 기록이 메인의 재확인을 대신하지 않는다.
4. 종료 전에 `check`를 실행한다. 완전한 `complete` 기록 또는 남은 항목을 밝힌 `incomplete` 기록으로 종료한다. 검사를 통과했다는 사실을 코드 정확성의 보장으로 보고하지 않는다.

## 입력 계약

`init`은 다음 기준과 이미 발견한 문제를 고정한다. `findings`는 없으면 생략할 수 있다.

```json
{
  "mode": "implementation",
  "criteria": [
    {"id": "C1", "kind": "design", "condition": "책임·상태 갱신이 정한 담당에 모임", "method": "현재 코드와 호출부 대조"},
    {"id": "C2", "kind": "behavior", "condition": "사용자 흐름의 구체적인 기대 결과", "method": "실제 실행 값과 대조"}
  ],
  "findings": [{"id": "F1", "criterionIds": ["C1"], "scope": "원래 문제의 전체 범위", "closureCondition": "해소 조건"}]
}
```

각 기준의 `kind`는 `behavior`·`design`·`analysis` 중 하나다. `implementation`에는 최소 한 개의 `design` 기준이 필요하고, 분석 요청은 `analysis` 종류의 기준으로 산출물을 확인한다. 문서·지침 구현의 `design` 조건은 책임 배치와 참조 일관성 등 해당 산출물에 맞춘다. 실행 동작을 바꾸지 않았다면 동작 기준을 억지로 만들지 않는다.

`finding`은 `id`, `criterionIds`, `scope`, `closureCondition`을 가진 문제 하나를 추가한다. 고정한 기준과 문제는 삭제하거나 내용을 바꿔 통과시키지 않는다. 사용자 승인으로 범위가 바뀌면 원래 ID와 승인 근거·변경 이유를 보존하고, 새 기준 기록이 필요한 다음 작업으로 분리한다. CLI의 기존 기준을 덮어쓰지 않는다.

`result`는 모든 기준과 추적 중인 모든 문제를 포함한다.

```json
{
  "outcome": "complete",
  "criteria": [{
    "id": "C1", "status": "satisfied",
    "evidence": ["현재 산출물의 파일 위치 또는 명령·관찰 결과"],
    "review": {"by": "main", "evidence": ["메인이 직접 다시 확인한 위치와 판단"]}
  }, {
    "id": "C2", "status": "satisfied",
    "evidence": ["실제 사용자 흐름의 기대값·관찰값"],
    "review": {"by": "main", "evidence": ["메인이 실제 결과를 다시 대조한 근거"]}
  }],
  "findings": [{
    "id": "F1", "status": "resolved",
    "evidence": ["원래 범위 전체의 해소 근거"],
    "review": {"by": "main", "evidence": ["현재 산출물 전체 범위의 재확인 근거"]}
  }],
  "remaining": []
}
```

기준 상태는 `satisfied`·`failed`·`unverified`, 문제 상태는 `resolved`·`unresolved`다. 문제가 없으면 `findings: []`로 명시한다. `complete`에는 고정한 기준 ID 전부의 `satisfied`, 비어 있지 않은 근거와 재확인, 모든 문제의 해소 근거와 재확인, 빈 `remaining`이 필요하다. 일부만 분리한 상태나 유효성을 잃은 검증은 충족·해결로 유지하지 않는다.

미완료 보고에서도 `satisfied` 또는 `resolved`로 표시하는 항목은 실제 근거와 해당 역할의 재확인 근거가 있어야 한다. 확인하지 못한 항목은 `unverified` 또는 `unresolved`로 유지한다.

진행할 수 없으면 `outcome: "incomplete"`로 기록하고 `remaining`에 구체적인 미완료·미검증 작업과 이유를 남긴다. 종료를 통과시키려고 근거를 만들거나 미확인을 충족으로 바꾸지 않는다. 최종 답변도 이 결과와 일치해야 한다.

## 훅과 사람의 판단

`Stop`은 메인의 기록, `SubagentStop`은 해당 담당자의 기록을 검사한다. 반복 방지 플래그만으로 유효하지 않은 완료 기록을 통과시키지 않는다. 자동 검사는 기록의 구조·ID·상태·필수 근거를 확인한다. 근거가 실제인지, 원래 문제 전체가 해소됐는지, 책임 배치가 적절한지는 모델이 현재 산출물로 판단한다. 답변 문장에서 완료 주장을 자동 추출하지 않으므로 기록과 최종 보고를 일치시키는 책임도 남는다.

설치본 파일 변경만으로 현재 채팅에서 새 훅이 활성화된 것은 아니다. 사용자가 `/hooks`에서 현재 정의를 검토·신뢰한 뒤 실제 이벤트 실행을 확인해야 한다. 자동으로 보안·신뢰 설정을 바꾸지 않는다. 업데이트 전 시작된 작업에 새 컨텍스트가 없으면 기준별 근거와 미해결 항목을 수동으로 확인하고 자동 검사 미적용을 명시한다.
