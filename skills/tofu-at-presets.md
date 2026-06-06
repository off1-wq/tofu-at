---
name: tofu-at-presets
description: Use when /tofu-at "빠른 시작"(quick-start) 모드 — 키워드 자동 매칭으로 프리셋을 골라 AskUserQuestion을 6개→2개로 줄여 즉시 팀을 구성. 프리셋 정의 + 키워드 매칭 + defaults 적용 규칙.
---

# Tofu-AT Presets (Quick-Start)

> `/tofu-at` "빠른 시작" 모드의 프리셋 엔진.
> $ARGUMENTS 키워드 → 프리셋 자동 감지 → STEP 2-A/2-B(6개 질문)를 건너뛰고 프리셋 기본값으로 즉시 팀 구성.
>
> **설계 출처**: oh-my-claude(omc)의 zero-config 프리셋 + 모델 라우팅 tier 개념을 tofu-at의 STEP 2-A/2-B 선택지에 매핑하여 이식. omc의 premium/balanced/budget tier ↔ tofu-at의 품질최적/비용최적/초저비용.

---

## §1. 프리셋 정의 (4종)

각 프리셋의 기본값은 STEP 2-A/2-B의 실제 선택지와 1:1 정합한다(규모/모델/게이트/Ralph/DA).

| 프리셋 | 규모 | 모델 믹스 | 게이트 | Ralph | DA | PRD 인터뷰 |
|--------|------|----------|--------|-------|-----|-----------|
| **research** (리서치) | 표준 (리드+워커 3-5) | 비용최적 (balanced) | 표준 | OFF | OFF | 스킵 |
| **dev** (개발) | 표준 (리드+워커 3-5) | 품질최적 (premium) | 엄격 | ON (5회) | OFF | 실행 (조건부)¹ |
| **analysis** (분석) | 표준 (리드+워커 3-5) | 비용최적 (balanced) | 표준 | OFF | ON (Haiku) | 스킵 |
| **content** (콘텐츠) | 최소 (리드+워커 1-2) | 비용최적 (balanced) | 느슨 | OFF | OFF | 스킵 |

**선택 근거:**
- **research**: 커버리지 우선 → 워커 다수(Explore 비중↑), Ralph는 수렴보다 폭이 중요해 OFF. 비용최적.
- **dev**: 구현 품질이 핵심 → 품질최적 모델 + 엄격 게이트 + Ralph 5회(SHIP/REVISE). 새 프로젝트면 PRD 인터뷰로 요구사항 고정.
- **analysis**: 데이터/평가 → 비용최적 + DA(Haiku)로 저비용 반론을 더해 결론 편향 점검.
- **content**: 글쓰기/가벼운 산출 → 최소 규모 + 느슨 게이트로 빠르게.

> ¹ **PRD 인터뷰는 fail-safe다.** dev 프리셋은 새 프로젝트면 STEP 2.5 PRD 인터뷰로 라우팅하지만, 이는 `prd-interview.md`(+`prd-documents.md`) 스킬이 설치돼 있을 때만 실행한다. **해당 스킬이 없으면 조용히 스킵하고 STEP 3으로 직행한다** — 프리셋이 누락 스킬에 hard-depend하지 않는다. (2026-06-06 기준 두 스킬은 레포에 미포함 → 현재는 항상 스킵 경로.)

> 사용자는 STEP 3(팀 구성안 확인)에서 어떤 기본값이든 세부 조정할 수 있다. 프리셋은 출발점일 뿐 잠금이 아니다.

---

## §2. 키워드 자동 매칭 (프리셋 감지)

```
FUNCTION detect_preset(arguments):
  kw = arguments.toLowerCase()
  FOR each preset in §2-table:
      score[preset] = COUNT(kw에 포함된 preset 키워드 수)
  best = argmax(score)
  IF score[best] == 0:
      RETURN null        # 감지 실패 → §3 Q1에서 4개 모두 제시(Recommended 없음)
  RETURN best            # 동점 시 우선순위: dev > analysis > research > content
```

| 프리셋 | 라우팅 키워드 |
|--------|-------------|
| **research** | research, 리서치, 조사, survey, 논문, paper, literature, 시장조사, 경쟁, 경쟁사, investigate, explore, 탐색, 동향, trend, 사례, benchmark, 벤치마크 |
| **dev** | build, 개발, 구현, code, coding, implement, feature, 기능, app, 앱, API, 서비스, server, 서버, refactor, 리팩터, fix, 버그, bug, 시스템, 배포, deploy |
| **analysis** | analyze, 분석, data, 데이터, report, 보고서, 평가, evaluate, metric, 지표, 통계, statistics, 인사이트, insight, 비교, compare, audit, 감사, 진단 |
| **content** | write, 글, content, 콘텐츠, blog, 블로그, thread, 스레드, copy, 카피, article, 기사, 문서, draft, 초안, 마케팅, SNS, post, 게시글, 뉴스레터 |

> 동점 처리에서 dev를 최우선으로 두는 이유: 개발 요청은 PRD 인터뷰/엄격 게이트가 필요해 오탐 비용이 가장 크므로, 애매하면 가장 보수적인(검증 강한) 쪽으로 라우팅한다.

---

## §3. quick-start AskUserQuestion (2개)

> ⛔ STEP 0에서 "빠른 시작" 선택 시 호출. STEP 2-A/2-B(6개 질문)를 대체한다.

**Q1 — 프리셋 선택** (header: "프리셋", multiSelect: false)
- **항상 4개 프리셋을 그대로 나열한다** (별도 "감지됨" 슬롯을 추가하지 않는다 — 옵션이 5개로 불어나거나 한 프리셋이 누락될 수 있음).
- `detect_preset()`이 반환한 프리셋의 label에만 `(Recommended)`를 덧붙인다. 감지 실패(null)면 아무 곳에도 붙이지 않는다.
- **"커스텀"은 옵션으로 넣지 않는다.** AskUserQuestion이 자동 제공하는 **Other**가 커스텀 경로다 → Other 선택 시 STEP 2-A/2-B 전체 실행으로 폴백. (`commands:151`의 "프리셋 4개 + 커스텀"은 이 Other-as-커스텀으로 충족된다.)

```
question: "어떤 프리셋으로 시작할까요? (Other = 커스텀: 6개 질문 전체)"
header:   "프리셋"
options:   # 4개 고정. detect_preset() 결과 항목에만 " (Recommended)" 접미
  - { label: "리서치",  description: "표준·비용최적·표준게이트·Ralph OFF·DA OFF — 조사/탐색" }
  - { label: "개발",    description: "표준·품질최적·엄격게이트·Ralph 5회 — 구현 (새 프로젝트 시 PRD 인터뷰)" }
  - { label: "분석",    description: "표준·비용최적·표준게이트·DA(Haiku) — 데이터/평가" }
  - { label: "콘텐츠",  description: "최소·비용최적·느슨게이트 — 글쓰기/콘텐츠" }
```

**Q2 — 주제 확인** (header: "주제", multiSelect: false)
- $ARGUMENTS에서 주제 문구를 뽑아 확인. 비어 있으면 이 질문에서 Other로 입력받는다.

```
question: "이 주제로 진행할까요? — \"<추출된 주제>\""
header:   "주제"
options:
  - { label: "이대로 진행 (Recommended)", description: "위 주제로 팀 구성" }
  - { label: "주제 수정",                 description: "Other에 새 주제를 입력" }
```

---

## §4. 프리셋 적용 → STEP 매핑

```
"빠른 시작" 선택
  → §2 detect_preset(ARGUMENTS)
  → §3 Q1/Q2 (2개 질문)        [Other → 커스텀: 기존 STEP 2-A/2-B 전체 실행으로 폴백]
  → 선택된 프리셋의 §1 defaults를 team_config에 주입
       team_config.scale   = 규모
       team_config.models  = 모델 믹스 (→ §5 tier)
       team_config.gate    = 게이트
       team_config.ralph_loop / devil_advocate = 표값
  → (조건) dev 프리셋 + 새 프로젝트 + prd-interview.md 설치됨 → STEP 2.5 PRD 인터뷰
           그 외(스킬 없음 / research / analysis / content)     → STEP 2.5 스킵 → STEP 3 직행
  → STEP 0.5 (환경) → STEP 1 (리소스) → STEP 3 (프리셋 defaults로 팀 구성안 자동 생성 → 확인 AskUserQuestion)
  → STEP 6 (실행 옵션) → STEP 7-8 (실행)
```

- 규모 ↔ `registry.yaml` complexity_mapping: 최소≈simple/standard, 표준≈standard, 최대≈complex.
- STEP 3 확인 단계에서 사용자가 모든 값을 덮어쓸 수 있음(프리셋=기본값, 잠금 아님).

---

## §5. 모델 라우팅 tier (omc 매핑)

STEP 2-A "모델 믹스" 선택지를 omc의 라우팅 tier 어휘로 정리. 프리셋은 아래 tier 중 하나를 기본값으로 가진다.

| tier (omc) | tofu-at 라벨 | 리드 | 카테고리 리드 | 워커 | 용도 |
|------------|------------|------|--------------|------|------|
| **premium** | 품질최적 | Opus(1M) | Opus(1M) | Sonnet 4.6(1M) | 구현·고난도 추론. 정확도 우선 |
| **balanced** | 비용최적 | Opus(1M) | Opus(1M) | Sonnet 4.6(1M) / Haiku | 기본값. 품질·비용 균형 |
| **budget** | 초저비용 | Opus(1M) | Sonnet 4.6(1M) | Haiku | 단순·대량 작업. 비용 최우선 |

> omc는 "Haiku=단순, Opus=복잡 추론" 원칙으로 라우팅한다. tofu-at은 같은 원칙을 **역할 계층(리드/카테고리리드/워커)** 에 적용해 tier로 고정한다 — 리드는 항상 Opus로 조율 판단을 보장하고, 비용 절감은 워커 계층(Sonnet↔Haiku)에서 발생한다. 구체 수치(예: "30–50% 절감")는 작업 구성에 따라 달라지므로 단정하지 않는다.
