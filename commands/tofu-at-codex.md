---
description: "Codex 하이브리드 팀 (Leader=Opus, Workers=Anthropic Direct, DA=Codex adversarial)"
allowedTools: Bash, Read, Write, Glob, Grep, Skill, AskUserQuestion, Task, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, TaskList, SendMessage
---

# /tofu-at-codex — Codex Hybrid Team v2

> **Leader = Opus (Anthropic Direct)**
> **Workers = Sonnet/Opus (Anthropic Direct)**
> **DA = Codex adversarial review (`codex exec`)**
> **PR Review = `codex review --base` (선택)**
>
> 기존 `/tofu-at` 워크플로우를 그대로 사용하되,
> DA 역할을 Codex adversarial review로 실행하는 하이브리드 모드입니다.
>
> **v2 변경사항 (2026-03-31 autoresearch 실험 기반):**
> - CLIProxyAPI 제거 — Workers는 Anthropic Direct로 실행
> - DA를 `codex exec` adversarial review로 교체 (97초, score 11.0)
> - `codex review --base`를 PR/diff 리뷰 옵션으로 추가
> - 의존성 3개 → 2개로 축소 (CLIProxyAPI, OAuth 불필요)

$ARGUMENTS

---

## Quick Start (설치 가이드)

### 원클릭 환경 체크

```bash
bash .claude/scripts/setup-tofu-at-codex.sh
```

### 의존성 목록

| # | 의존성 | 용도 | 설치 명령어 |
|---|--------|------|------------|
| 1 | **tmux** | Agent Teams Split Pane | `sudo apt install tmux` (Linux) / `brew install tmux` (macOS) |
| 2 | **Codex CLI** | DA adversarial review + PR review | `npm install -g @openai/codex && codex login` |
| 3 | **Claude Code** | Agent Teams 기반 | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |

> **v2에서 제거된 의존성:** CLIProxyAPI, OAuth 토큰 (더 이상 불필요)

### Codex Plugin (선택)

`codex review` 기능을 Claude Code 내에서 slash command로 사용하려면:

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
```

### 실행 방법

```bash
# 1. tmux 세션 시작 (이미 tmux 안이면 스킵)
tmux new -s claude

# 2. Claude Code 실행
claude

# 3. /tofu-at-codex 실행
/tofu-at-codex
```

---

<mindset priority="HIGHEST">
이 명령어는 **환경 설정 + 작업 유형별 Codex 라우팅**을 수행하고,
팀 구성은 `/tofu-at`에 위임합니다.

**v3.0 핵심 아키텍처 (autoresearch 17라운드 기반, R0-R17):**

| 역할 | 모델 | 실행 방식 |
|------|------|----------|
| Leader | Opus 4.6 [1M] | Anthropic Direct |
| Workers (비코딩) | Sonnet 4.6 | Anthropic Direct (팀원 스폰) |
| Workers (코딩) | GPT-5.4 | `codex exec --full-auto` (Lead 직접 호출) |
| DA | GPT-5.4 | `adversarial-review --scope working-tree` (Lead 직접 호출) |
| PR Review | GPT-5.4 | `codex review --base` (선택) |

**작업 유형별 Codex 라우팅 (CRITICAL):**

| 작업 유형 | 최적 전략 | Score | 근거 |
|----------|----------|-------|------|
| **코딩** (버그 수정, 구현, 리팩토링) | `codex exec` 직접 | 11.0 | R4: 67초, 팀 대비 4.7x 빠름, 품질 동일 |
| **비코딩** (리서치, 분석, 문서화) | Anthropic Workers 스폰 | 10.0 | R6: 품질 8/10, codex보다 상세 |
| **DA** (리뷰, 반론 검증) | `adversarial-review --scope wt` | 11.0 | R14: R2 동점, prompt_effort 3→0 |

**라우팅 판단 기준:**
- 태스크에 "파일 생성/수정/구현/수정/fix/refactor" 키워드 → **코딩** → codex exec
- 태스크에 "조사/분석/리서치/정리/문서/보고서" 키워드 → **비코딩** → Anthropic Worker
- 태스크에 "리뷰/검토/검증" 키워드 → **DA** → adversarial-review --scope working-tree
- 복합 태스크 → 비코딩 부분은 Worker, 코딩 부분은 codex exec로 분리

**v3 주의사항 (autoresearch R11-R17 기반):**

| 금지 | 이유 | 대안 |
|------|------|------|
| `/codex:rescue`로 코딩 태스크 | 오버헤드 +100s, speed_bonus 손실 (R11) | `codex exec --full-auto` 직접 |
| `adversarial-review --base HEAD~N` | diff만 분석, 대상 코드 무시 (R13: vc=0/5) | `--scope working-tree` 필수 |
| `--effort low/xhigh` 파라미터 | 단순 태스크에 효과 없음, 역설적으로 느림 (R12) | default 유지 |
| 동일 파일 병렬 codex exec | 파일 쓰기 충돌, 수정 미적용 (R17: score 6.0) | 순차 실행 또는 다른 파일만 병렬 |

**codex exec 코딩 태스크 실행 방식:**

코딩 역할이 tofu-at STEP 7에서 할당되면, Lead가 팀원 스폰 대신 직접 실행:

```bash
RESULT=$(codex exec --full-auto "{태스크 프롬프트}" 2>&1)
```

- 팀원 스폰 오버헤드 없음 (67초 vs 291초)
- 결과를 즉시 사용 가능 (동기 실행)
- 여러 코딩 태스크: **다른 파일이면** 병렬 가능, **동일 파일이면** 순차 필수 (R17)

**복합 프로젝트 예시:**

```
태스크: "API 설계 리서치 + 엔드포인트 3개 구현 + 코드 리뷰"

→ Worker-1 (Anthropic): API 설계 리서치 + 문서화               [비코딩]
→ codex exec ×3: 엔드포인트 구현                                [코딩]
→ adversarial-review --scope working-tree: 변경분 회귀 검증      [DA]
```

**설계 근거 (autoresearch 17라운드 실험, v2+v3):**

| 작업 | 전략 | Score | Duration | 실험 |
|------|------|-------|----------|------|
| DA/리뷰 | rescue → adv-review --scope wt | **11.0** | 222s | R14 (v3) |
| DA/리뷰 | Workers(Anthropic) + 수동 Codex DA | **11.0** | 259s | R2 (v2) |
| 코딩 | codex exec 단독 | **11.0** | 67s | R4 (v2) |
| 코딩 | /codex:rescue default | 10.5 | 169s | R11 (v3) |
| 비코딩 | Team Workers (Anthropic) | 10.0 | 291s | R6 (v2) |
| 종합 | Team + plugin integrated | 10.0 | 334s | R16 (v3) |
| 검증 | rescue + Gate + adv-review | 10.0 | 382s | R15 (v3) |
| 코딩 | /codex:rescue effort=low | 10.0 | 224s | R12 (v3) |
| 병렬 | 3x parallel rescue | **6.0** | 174s | R17 (v3) |

핵심:
- 코딩은 raw codex exec가 압도적 (rescue 래핑은 오버헤드만 추가)
- DA는 adversarial-review --scope wt가 수동 prompt와 동점이면서 자동화
- 비코딩은 Anthropic Workers가 약간 우세
- 병렬 codex exec는 동일 파일에서 실패
- proxy mode는 모든 작업에서 최하위 (v2에서 확인)

<tofu-at-overrides priority="HIGH">
**tofu-at 위임 시 오버라이드 사항**

tofu-at의 STEP 2-B (DA 모델 선택)에서 선택지를 다음으로 대체:
- "OFF" — DA 없이 진행
- "ON (Codex adversarial-review) (Recommended)" — `adversarial-review --scope working-tree` (v3, 자동화)
- "ON (Codex exec manual)" — `codex exec` + 수동 adversarial prompt (v2 방식)
- "ON (Opus)" — Anthropic Opus로 DA (Leader와 동일)

**v3 Codex Adversarial DA 동작 방식 (RECOMMENDED):**

v3의 DA는 **adversarial-review 플러그인**을 사용. 수동 프롬프트 작성 불필요 (prompt_effort=0).

1. Worker가 코드를 수정하면 working-tree에 변경사항이 생김
2. Lead가 `adversarial-review --scope working-tree`를 호출
3. 플러그인이 자동으로 adversarial 프롬프트를 구성하고 JSON 결과 반환
4. Lead가 결과(verdict, findings, confidence)를 판단

**v2 대비 v3 DA 개선:**

| 속성 | v2 (codex exec manual) | v3 (adversarial-review) |
|------|----------------------|----------------------|
| Score | 11.0 (R2) | 11.0 (R14) |
| Duration | 97초 | ~100초 |
| prompt_effort | 3 (매번 수작업) | **0** (자동) |
| 출력 | 자유형 텍스트 | **JSON** (verdict, severity, confidence) |
| 회귀 탐지 | 가능 (수동 지시) | **자동** (working-tree diff 분석) |

**DA 호출 방법 (STEP 7-6 대체):**

Worker 결과가 working-tree에 반영된 후 Lead가 실행:

```bash
# v3 방식 (recommended): 플러그인 자동 프롬프트
node "{companion_path}" adversarial-review --scope working-tree --json

# 결과: JSON {verdict, summary, findings[{severity, title, body, file, line_start, confidence, recommendation}], next_steps}
```

**DA 종합 리뷰 (STEP 7-6.5 대체):**

모든 Worker 완료 후, 전체 변경분에 대해 1회 실행:

```bash
node "{companion_path}" adversarial-review --scope working-tree --json
```

> ⚠️ `--base HEAD~N`을 사용하지 말 것. git 히스토리 diff만 분석하여 현재 작업과 무관한 이슈를 반환함 (R13: vc=0/5).

**DA OFF인 경우:**
STEP 7-6, 7-6.5를 건너뜁니다.

**DA ON (Codex exec manual)인 경우:**
v2 방식 — Lead가 수동으로 adversarial prompt를 작성하여 `codex exec`로 실행.
프롬프트 작성 시간이 추가되지만, 특정 관점을 지시할 수 있음.

**DA ON (Opus)인 경우:**
기존 tofu-at 방식 그대로 — Opus 팀원으로 DA 스폰.
</tofu-at-overrides>

프리셋 빠른 시작 (tofu-at-presets.md 참조):
- /tofu-at 위임 시 "빠른 시작" 옵션이 자동 적용됨
- 프리셋 선택(리서치/개발/분석/콘텐츠) → AskUserQuestion 2개만으로 팀 구성
- Workers는 Anthropic Direct로 실행 (v2: 프록시 라우팅 없음)

코딩 태스크 Self-Check (pumasi discipline):
- dev 프리셋 선택 시, Leader는 코드 본문 작성 금지
- 워커에게 시그니처 + NL 요구사항만 전달
- Dynamic Gate(bash 검증)가 Ralph 전에 자동 실행
- 참조: tofu-at-workflow.md §8 (Dynamic Gate), §9 (Self-Check List)

절대 금지:
- 기존 tofu-at.md 수정 X
- tofu-at 스킬 파일 수정 X
</mindset>

---

## PHASE 0: 사전 요구사항 확인 (자동화)

### 0-SKIP: 검증 캐시 확인 (최초 1회 이후 스킵)

```
Glob(".team-os/.env-verified") 존재 확인:

IF 존재:
  Read(".team-os/.env-verified") → JSON 파싱
  IF verified.session == current_tmux_session AND verified.agent_teams == true:
    → "환경 검증 캐시 유효. PHASE 0 스킵합니다."
    → PHASE 1로 직접 진행
  ELSE:
    → 캐시 무효 (세션 불일치). 전체 검증 진행.

ELSE:
  → 캐시 없음. 전체 검증 진행.
```

### 0-0. Setup 스크립트로 일괄 확인 (권장)

```bash
bash .claude/scripts/setup-tofu-at-codex.sh
```

- exit code 0 → 모든 의존성 OK, PHASE 1로 진행
- exit code > 0 → 누락 항목 안내됨

### 0-1. Codex CLI 확인

```bash
codex --version && codex whoami
```

- 성공 → 버전 + 로그인 상태 표시 후 계속
- 실패 → 설치/로그인 안내:
  ```bash
  npm install -g @openai/codex
  codex login
  ```

### 0-2. tmux 확인

```bash
tmux display-message -p '#S'
```

tmux 미실행 시 **중단**:
> tmux 세션 내에서 실행해야 합니다.

---

## PHASE 0.5: Swarm Mode 감지 (v4.0 신규)

> **v4.0에서 추가**: 대규모 병렬 작업(비코딩 워커 5명 이상) 감지 시 Swarm Mode 자동 활성화. CLIProxyAPI 경유 split pane teammate + DA Codex teammate 경로 복구. 소규모 작업엔 영향 없음(기존 v3 Standard mode 유지).

### 0.5-1. 잠정 PLAN 작성 + task_type 분류

Lead가 사용자 요청을 분석해 잠정 PLAN을 만들고, 각 역할에 `task_type`을 부여합니다.

```
분류 규칙:
- "구현 / 수정 / fix / refactor / 파일 생성 / 코드 작성 / edit"      → coding
- "조사 / 분석 / 리서치 / 정리 / 문서화 / 요약 / 보고서 / research"  → noncoding
- "리뷰 / 검토 / 검증 / 반론 / review / adversarial"                 → DA
```

복합 태스크는 주 동사 우선으로 분할:
- "API 설계 리서치 + 엔드포인트 3개 구현" → 리서치 1(noncoding) + 구현 3(coding) 분리
- "lesson-a 대규모 리서치 + 문서화 6부서" → noncoding 6

### 0.5-2. noncoding_count 계산 + Swarm 활성화 판정

```
noncoding_count := len([r for r in PLAN.roles if r.task_type == "noncoding"])

IF noncoding_count >= 5:
    swarm_activate = true
    사용자 배너:
    > 🔔 Swarm Mode 감지: 비코딩 워커 {N}명
    > → PHASE 1.6에서 CLIProxyAPI 자동 기동 + split pane teammate 스폰
    > → 코딩 태스크는 codex exec 직접 호출 경로 유지 (v3)
    > → DA는 SendMessage 장기 대화 가능한 Codex teammate로 활성화
    > → 예상 이득: 토큰 -40% ~ -60%, wall time 동등 이상, 관찰성 향상
ELSE:
    swarm_activate = false
    → Standard mode. PHASE 1.6 전체 스킵. v3 경로 그대로 진행.
```

### 0.5-3. 컨텍스트 전달 준비

PHASE 3에서 /tofu-at 스킬에 위임할 때 아래 컨텍스트를 함께 전달:

```json
{
  "swarm_activate": true,
  "noncoding_count": 7,
  "coding_count": 2,
  "da_count": 1,
  "plan_role_map": [
    {"name": "researcher-1", "task_type": "noncoding"},
    {"name": "researcher-2", "task_type": "noncoding"},
    {"name": "coder-1", "task_type": "coding"},
    {"name": "devils-advocate", "task_type": "DA"}
  ]
}
```

이 컨텍스트는 STEP 7-4-1 Override에서 역할별 스폰 경로 결정에 사용됩니다.

### 0.5-4. Swarm 비활성화 안전 장치

다음 중 하나라도 해당하면 `swarm_activate = false`로 강제:

- `noncoding_count < 5` (임계치 미달)
- 이전 세션에서 CLIProxyAPI 5회 연속 기동 실패 캐시 (`.team-os/.env-verified`의 swarm 필드 참조)
- 현재 세션이 tmux 밖에서 실행 중 (Desktop App, VSCode extension 등 split pane 불가 환경)
- `--no-swarm` 플래그 (사용자가 명시적으로 Standard 강제)

활성화 실패 시 경고 배너 + Standard mode로 투명 폴백.

---

## PHASE 1: Codex CLI 검증

### 1-1. Codex 실행 테스트

```bash
RESPONSE=$(codex exec --full-auto "Reply with exactly: CODEX_OK" 2>&1)
echo "$RESPONSE"
```

- `CODEX_OK` 포함 → Codex CLI 정상
- 실패 → `codex login` 재실행 안내

### 1-2. 사용자 안내

> **Codex Hybrid Team v2.1 환경 확인 완료**
>
> | 역할 | 모델 | 실행 방식 | 대상 작업 |
> |------|------|----------|----------|
> | Leader | Opus 4.6 [1M] | Anthropic Direct | 오케스트레이션 |
> | Workers (비코딩) | Sonnet 4.6 | Anthropic Direct (팀원 pane) | 리서치, 분석, 문서화 |
> | Workers (코딩) | GPT-5.4 | `codex exec` (Lead 직접) | 구현, 수정, 리팩토링 |
> | DA | GPT-5.4 | `codex exec` adversarial | 리뷰, 반론 검증 |
>
> **라우팅**: 코딩 태스크는 `codex exec`로 직접, 비코딩은 팀원 스폰.
>
> `/tofu-at` 워크플로우를 시작합니다...

---

## PHASE 1.5: PR/Diff 리뷰 (선택)

**작업 시작 전 최근 변경사항을 빠르게 리뷰하려면:**

```
AskUserQuestion({
  "questions": [{
    "question": "작업 전 codex review로 최근 변경사항을 리뷰할까요? (57초 소요)",
    "header": "PR Review",
    "options": [
      {"label": "스킵 (Recommended)", "description": "바로 팀 작업 시작"},
      {"label": "최근 5커밋 리뷰", "description": "codex review --base HEAD~5"},
      {"label": "특정 브랜치 대비", "description": "base 브랜치를 직접 지정"}
    ],
    "multiSelect": false
  }]
})
```

리뷰 선택 시:
```bash
codex review --base {BASE_REF}
```

> [!WARNING]
> adversarial-review는 diff 기반 도구입니다. `--base HEAD~N`은 git diff만 분석합니다. 대상 코드를 직접 리뷰하려면 먼저 코드를 수정(codex exec/rescue)한 후 `--scope working-tree`로 변경분을 리뷰하세요.

결과를 팀 컨텍스트에 포함하여 tofu-at에 전달합니다.

---

## PHASE 1.6: CLIProxyAPI 라이프사이클 (v4.0 신규, Swarm 전용)

> **Swarm Mode 활성화 시에만 실행**. `swarm_activate == false`면 이 PHASE 전체 스킵.
>
> 역할: 비코딩 워커가 CLIProxyAPI 경유로 GPT-5.4에 라우팅되도록 프록시 기동 + tmux 세션 env 세팅. Lead process env는 **절대 건드리지 않음** (Opus가 GPT-5.4로 잘못 라우팅되는 대형 사고 방지).

### 1.6-0. 선행 조건 체크

```
IF swarm_activate == false:
    → PHASE 1.6 전체 스킵 → PHASE 2로 진행
    (Standard mode 경로, v3 그대로)

IF env_tmux == false:
    → Swarm 불가 (tmux 없으면 split pane 못 만듦)
    → swarm_activate = false 강제 + Standard mode 폴백
    → "tmux 세션 필요" 안내 배너
```

### 1.6-1. 바이너리 확인

```bash
Bash("test -x ~/CLIProxyAPI/cli-proxy-api && echo ok || echo missing")
```

- `ok` → 다음 단계
- `missing` → Standard mode 폴백 + 설치 안내:
  > ⚠️ CLIProxyAPI 바이너리 미설치 — Swarm Mode 사용 불가, Standard mode로 진행합니다.
  > 설치: `ENABLE_SWARM=1 bash .claude/scripts/setup-tofu-at-codex.sh`

### 1.6-2. config.yaml 필드 검증

```bash
Bash("grep -cE 'port: 8317|alias: \"claude-sonnet-4-6\"' ~/CLIProxyAPI/config.yaml")
```

- `2` 이상 → 다음 단계
- `2` 미만 → 표준 템플릿 복사 제안:
  > ⚠️ config.yaml 필드 누락 — 표준 템플릿 복사 안내:
  > `cp .claude/scripts/templates/cliproxy-config.yaml ~/CLIProxyAPI/config.yaml`
  > 현재 세션은 Standard mode로 진행.

### 1.6-3. OAuth 토큰 존재 확인

```bash
Bash("ls ~/.cli-proxy-api/ 2>/dev/null | wc -l")
```

- `1` 이상 → 다음 단계
- `0` → TUI 인증 안내 + Standard 폴백:
  > ⚠️ OAuth 토큰 없음 — 최초 인증 필요.
  > 별도 터미널에서 1회 실행: `cd ~/CLIProxyAPI && ./cli-proxy-api` (TUI에서 인증)
  > 이후 자동화 가능. 현재 세션은 Standard mode로 진행.

### 1.6-4. Health check (이미 실행 중인지)

```bash
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' \
  http://localhost:8317/v1/messages \
  -X POST \
  -H "Authorization: Bearer codex-hybrid-team" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"ok"}]}' \
  --connect-timeout 2 || echo fail)

case "$HEALTH" in
  200|201|401) echo "already_running" ;;  # 401 = 잘못된 key지만 서버는 동작 중 (정상)
  *) echo "not_running" ;;
esac
```

- `already_running` → 1.6-6 스킵, 1.6-7로 바로
- `not_running` → 1.6-5 기동

### 1.6-5. 백그라운드 기동

```bash
Bash("cd ~/CLIProxyAPI && nohup ./cli-proxy-api > /tmp/cliproxy-$(date +%s).log 2>&1 & disown")
LOG_PATH=$(ls -t /tmp/cliproxy-*.log 2>/dev/null | head -1)
echo "CLIProxyAPI 기동 중... 로그: $LOG_PATH"
```

Lead는 `disown`으로 프록시 프로세스를 세션 종료에 묶지 않음 (다음 세션 재사용 위해).

### 1.6-6. Health check 재시도 루프 (최대 10초)

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8317/v1/messages \
    -X POST -H "Authorization: Bearer codex-hybrid-team" \
    -H "Content-Type: application/json" \
    -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"ok"}]}' \
    --connect-timeout 1 2>/dev/null)
  case "$CODE" in
    200|201|401) echo "ready"; break ;;
  esac
  sleep 1
done
```

- `ready` → 1.6-7 진행
- 10초 초과 → Standard mode 폴백 + 로그 경로 안내:
  > ⚠️ CLIProxyAPI 기동 실패 (10초 타임아웃). 로그: `{LOG_PATH}`
  > 일반적 원인: OAuth 토큰 만료 · config.yaml 오류 · 포트 충돌
  > 현재 세션은 Standard mode로 진행.

### 1.6-7. tmux 세션 env 설정 (CRITICAL — Lead env 격리)

```bash
SESSION=$(tmux display-message -p '#S')
tmux set-environment -t "$SESSION" ANTHROPIC_BASE_URL http://localhost:8317
tmux set-environment -t "$SESSION" ANTHROPIC_AUTH_TOKEN codex-hybrid-team
tmux set-environment -t "$SESSION" MAX_THINKING_TOKENS 16384
```

**⚠️ CRITICAL: Lead process env 오염 방지**
- 이 명령은 tmux **세션 env**만 설정합니다 (세션에 등록된 future pane이 상속).
- **Lead 자신의 process env는 건드리지 않습니다** — 이미 시작된 Lead 프로세스는 세션 env 변경과 무관.
- 만약 `export ANTHROPIC_BASE_URL=...`을 Lead shell에 직접 쓰면 Opus 응답이 GPT-5.4로 라우팅되는 대형 사고 발생. **절대 금지.**

### 1.6-8. 캐시 업데이트

```
.team-os/.env-verified JSON 파일에 swarm 블록 추가:
{
  "swarm": {
    "cliproxy_binary_ok": true,
    "cliproxy_config_ok": true,
    "oauth_ok": true,
    "last_health_check": "{ISO timestamp}",
    "session_env_set": true
  }
}
```

다음 세션에서 동일 tmux 세션이면 1.6-1~1.6-3 스킵 (1.6-4 health check만 실행).

### 1.6-9. 사용자 요약 배너

```
> ✅ CLIProxyAPI Swarm Mode 준비 완료
>
> | 항목 | 상태 |
> |---|---|
> | 바이너리 | ~/CLIProxyAPI/cli-proxy-api ✓ |
> | 포트 | localhost:8317 ✓ |
> | Alias 매핑 | claude-sonnet-4-6 → gpt-5.4 ✓ |
> | OAuth 토큰 | ~/.cli-proxy-api/ ✓ |
> | tmux 세션 env | ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, MAX_THINKING_TOKENS=16384 (high) |
>
> STEP 7-4-1에서 비코딩 워커 {N}명이 split pane으로 스폰되고 GPT-5.4로 라우팅됩니다.
```

---

## PHASE 2: Agent Office 대시보드 실행

### 2-1. agent-office 경로 감지

agent_office_path를 아래 순서로 탐색:

```
1. Bash("echo $AGENT_OFFICE_PATH 2>/dev/null") → 환경변수
2. 현재 작업 디렉토리에서 상위로 walk-up하며 `agent-office/server.js` 탐색
3. 처음 발견된 경로 사용
```

→ 모두 실패: "Agent Office 미설치. 대시보드 없이 진행."

### 2-2. 서버 시작

```
health = Bash("curl -s -o /dev/null -w '%{http_code}' http://localhost:3747/api/status --connect-timeout 2 || echo 'fail'")

IF health == "200":
  → "Agent Office 이미 실행 중."
ELSE:
  Bash("lsof -ti:3747 | xargs kill -9 2>/dev/null || true")
  Bash("AGENT_OFFICE_ROOT=$(pwd) node {agent_office_path}/server.js --open", run_in_background: true)
  # 헬스체크 루프 (최대 10초)
```

### 2-3. 브라우저 오픈 (WSL)

```bash
cmd.exe /c start http://localhost:3747 2>/dev/null || true
```

---

## PHASE 3: tofu-at 워크플로우 위임 (전체 클론)

```
Skill("tofu-at", args: "$ARGUMENTS")
```

표준 tofu-at STEP 0~9 전체 실행. 아래 항목이 반드시 포함되어야 합니다:

### 필수 포함 항목

| tofu-at STEP | 항목 | v2.1 변경사항 |
|-------------|------|------------|
| STEP 7-2.5 | 공유 메모리 초기화 | 변경 없음 |
| STEP 7-4-0.5 | progress_update_rule | 변경 없음 |
| STEP 7-4-1 | Worker 스폰 | **v2.1: 작업 유형별 분기** (아래 참조) |
| STEP 7-4-2 | 진행 상태 초기 업데이트 | 변경 없음 |
| STEP 7-5.5 | Health Check 루프 | 비코딩 Workers만 해당 |
| STEP 7-6 | 결과 수신 + DA 리뷰 | **Lead가 `codex exec` 직접 호출** |
| STEP 7-6.5 | DA 종합 리뷰 | **Lead가 `codex exec` 종합 리뷰** |
| STEP 7-7 | 셧다운 + Results 보고서 | DA 셧다운 불필요. 비코딩 Workers만 셧다운 |
| STEP 8 | 검증 + 보고 | 변경 없음 |
| STEP 9 | 재실행 커맨드 생성 | 변경 없음 |

### v2.1 핵심: 작업 유형별 Codex 라우팅 (STEP 7-4-1 오버라이드)

tofu-at STEP 7-4-1에서 각 역할을 스폰할 때, **작업 유형에 따라 실행 방식을 분기**:

```
FOR EACH role in PLAN:
  IF role.task_type == "코딩" (구현/수정/fix/refactor/버그수정):
    # codex exec 직접 실행 (팀원 스폰 안 함)
    # R4 결과: 67초, score 11.0
    RESULT = Bash("codex exec --full-auto '{role.prompt}'")
    → 결과를 TEAM_PROGRESS.md에 기록
    → Worker 스폰/셧다운 오버헤드 없음

  ELSE IF role.task_type == "비코딩" (리서치/분석/문서화/정리):
    # Anthropic Worker 팀원 스폰
    # R6 결과: 품질 8/10, 더 상세한 분석
    Agent(
      name: "{ROLE_NAME}",
      team_name: "{TEAM_NAME}",
      run_in_background: true,
      mode: "bypassPermissions",
      prompt: "{role.prompt}"
    )

  ELSE IF role.task_type == "DA":
    # DA는 스폰하지 않음 — STEP 7-6에서 Lead가 직접 호출
    → DA 역할 등록만 하고 스폰 건너뜀
```

**복합 프로젝트 실행 흐름 예시:**

```
태스크: "API 설계 리서치 + 엔드포인트 3개 구현 + 코드 리뷰"

STEP 7-4-1:
  Worker-1 (비코딩) → Agent 스폰 → API 설계 리서치 + 문서화
  Worker-2 (코딩)   → codex exec  → 엔드포인트 A 구현
  Worker-3 (코딩)   → codex exec  → 엔드포인트 B 구현
  Worker-4 (코딩)   → codex exec  → 엔드포인트 C 구현
  DA                → 등록만 (STEP 7-6에서 호출)

STEP 7-5~7-6:
  Worker-1 결과 수신 → DA codex exec adversarial 호출
  Worker-2~4 결과 수신 (codex exec 동기 완료) → DA 호출

STEP 7-6.5:
  codex exec 종합 리뷰 → Lead 최종 판단
```

**코딩 태스크 codex exec 실행:**

```bash
# 단일 코딩 태스크
RESULT=$(codex exec --full-auto "{태스크 프롬프트}" 2>&1)

# 여러 코딩 태스크 병렬 (백그라운드)
codex exec --full-auto "{태스크A}" > /tmp/codex-taskA.log 2>&1 &
codex exec --full-auto "{태스크B}" > /tmp/codex-taskB.log 2>&1 &
wait
```

⚠️ 동일 파일에 대한 병렬 codex exec는 쓰기 충돌로 실패합니다 (R17). 다른 파일 대상일 때만 병렬 실행하세요.

### DA 실행 (STEP 7-6 / 7-6.5)

```
# STEP 7-6: Worker 결과 수신 시
FOR EACH worker_result:
  codex_da_review = Bash("codex exec --full-auto '{DA 호출 템플릿}'")
  → Lead가 codex_da_review 결과를 판단

# STEP 7-6.5: 모든 Worker 완료 후
codex_final_review = Bash("codex exec --full-auto '{DA 종합 리뷰 템플릿}'")
→ Lead가 최종 판단
```

### tofu-at STEP 2-B DA 모델 선택 오버라이드

Codex Hybrid v2 모드에서는 DA 선택지를 다음으로 대체:
- "OFF" — DA 없이 진행
- "ON (Codex Adversarial) (Recommended)" — `codex exec`로 DA
- "ON (Opus)" — Anthropic Opus로 DA (기존 팀원 방식)

### v4.0 핵심: Swarm Mode Override (swarm_activate=true 전용)

> **PHASE 0.5에서 `swarm_activate = true`로 판정됐을 때만 실행.** Standard mode에서는 위 v2.1 라우팅을 그대로 사용합니다.

Swarm Mode가 활성화되면 tofu-at STEP 7-4-1의 스폰 로직을 다음 3-way 결정 트리로 **오버라이드**합니다. 비코딩 워커 경로가 Anthropic Direct → CLIProxyAPI split pane으로 전환되고, DA는 다시 진짜 teammate로 부활합니다.

```
FOR EACH role in PLAN.roles:

  IF role.task_type == "coding":
    # v3 경로 그대로 — codex exec 직접 (proxy 우회, 67초/워커)
    Bash("codex exec --full-auto '{role.prompt}' > /tmp/codex-{role.name}.log 2>&1 &")
    → Lead가 로그 파일 tail로 완료 감지 + TEAM_PROGRESS.md 업데이트
    → tmux pane 생성 안 함, TeamCreate teammate slot 사용 안 함

  ELIF role.task_type == "noncoding":
    # v1 경로 부활 — Agent 스폰 via tmux pane (CLIProxyAPI 라우팅)
    # PHASE 1.6에서 이미 tmux 세션 env가 설정됨:
    #   ANTHROPIC_BASE_URL=http://localhost:8317
    #   ANTHROPIC_AUTH_TOKEN=codex-hybrid-team
    #   MAX_THINKING_TOKENS=16384  (high effort)
    # 새 pane이 세션 env를 상속 → Claude Code가 proxy로 라우팅 → gpt-5.4로 alias

    Task(
      name: role.name,
      subagent_type: "general-purpose",
      model: "sonnet",  # CLIProxyAPI alias에 의해 gpt-5.4로 변환
      team_name: TEAM_NAME,
      run_in_background: true,
      mode: "bypassPermissions",
      prompt: <spawn_prompt_with_progress_rule>
    )
    Write(".team-os/spawn-prompts/{role.name}.md", spawn_prompt)

  ELIF role.task_type == "DA":
    # v1 경로 부활 — DA를 진짜 teammate로 스폰 (SendMessage 장기 대화 가능)
    # DA는 모든 비코딩 워커 스폰 완료 이후 맨 마지막에 스폰 (tmux env 순서 이슈)
    # xhigh effort로 reasoning 강화

    Bash("tmux set-environment -t $SESSION MAX_THINKING_TOKENS 31999")
    Task(
      name: "devils-advocate",
      subagent_type: "general-purpose",
      model: "sonnet",  # CLIProxyAPI → gpt-5.4 (xhigh reasoning)
      team_name: TEAM_NAME,
      run_in_background: true,
      mode: "bypassPermissions",
      prompt: <DA_adversarial_prompt_with_SendMessage_protocol>
    )
```

**스폰 순서 규칙 (CRITICAL)**

tmux 세션 env는 **새로 생성되는 pane만** 상속합니다. 따라서 순서가 중요합니다:

```
1. (PHASE 1.6에서 이미 완료) 세션 env 세팅: MAX_THINKING_TOKENS=16384 (high)
2. 모든 coding 태스크 → codex exec 백그라운드 (tmux pane 안 만들어서 env 무관)
3. 모든 noncoding 워커 → 한 번에 Task() 병렬 스폰 (전부 high effort 상속)
4. tmux set-environment 업데이트: MAX_THINKING_TOKENS=31999 (xhigh)
5. DA 워커 → Task() 스폰 (xhigh effort 상속)
6. 이후 STEP 7-5부터 결과 수집
```

**DA ↔ Lead SendMessage 프로토콜 (Swarm 모드 전용)**

Swarm 모드에서 DA는 `codex exec` 일회성 호출이 아니라 진짜 teammate입니다. Lead와 SendMessage로 장기 대화 가능:

```
STEP 7-6 per-worker review:
  FOR EACH worker_result received:
    SendMessage({
      type: "request",
      to: "devils-advocate",
      content: "다음 워커 결과 검토 + 반론 제시:\n\n
                워커: {worker_name}\n
                결과 요약: {summary}\n\n
                반드시 포함: 위험성 · 누락된 관점 · 검증 필요 가정",
      summary: "DA review request"
    })
    → DA teammate 응답 수신 → Lead 통합 → TEAM_FINDINGS.md 기록

STEP 7-6.5 comprehensive review:
  SendMessage(devils-advocate, "전체 결과 종합 검토 + 재작업 대상 식별")
  → DA 응답에 따라:
     · ACCEPTABLE → 전원 100% → PHASE 4
     · CONCERN → 재작업 대상에게 SendMessage 피드백 → 재실행
     · 2분 타임아웃 → v3 adversarial-review --scope working-tree 폴백 (안전장치)
```

**부분 폴백 (Partial Fallback) — worker 단위 격리**

Swarm 활성화 상태에서 일부 워커만 실패하는 경우, 전체 모드를 포기하지 않고 해당 워커만 Standard 경로로 재스폰:

```
IF 워커 A, B는 Swarm 경로로 정상 heartbeat 수신 + 워커 C만 env 상속 실패 (30초 내 첫 heartbeat 없음):
  → 워커 A, B는 Swarm 경로 유지
  → 워커 C만 tmux session env 무시하고 Anthropic Direct로 재스폰 (Agent(...) with stock prompt)
  → Lead가 혼합 상태를 TEAM_FINDINGS.md에 기록
```

이는 v1에서 불가능했던 세밀한 복구 메커니즘입니다. v4 전용 이점.

### 기존 에이전트 통합 (tofu-at Step 5-0에서 자동 처리)

tofu-at의 Step 5-0이 기존 에이전트를 감지하면:
- 원본 에이전트 콘텐츠를 보존한 채 최소 팀 통합 래퍼를 적용
- v2에서는 Workers가 Anthropic Direct이므로 프록시 관련 설정 불필요
- source_agent 필드가 registry.yaml에 설정된 역할은 Steps 5-1~5-6을 스킵

---

## PHASE 4: 정리

tofu-at 완료 후 정리:

```bash
# 1. Agent Office stale 데이터 정리
curl -s -X POST http://localhost:3747/api/session/clear --connect-timeout 2 || true
```

### 4-S. Swarm 전용 cleanup (v4.0 신규, swarm_activate 시에만)

> **이 서브섹션은 `swarm_activate == true`였을 때만 실행.** Standard mode 세션에서는 스킵 (아래 v2 간소화 참고).

Swarm 모드 세션이 끝나면 다음 세 가지 정리를 수행합니다:

```bash
# 4-S.1 tmux 세션 env 언셋 (다음 작업 누수 방지 — CRITICAL)
SESSION=$(tmux display-message -p '#S')
tmux set-environment -t "$SESSION" -u ANTHROPIC_BASE_URL
tmux set-environment -t "$SESSION" -u ANTHROPIC_AUTH_TOKEN
tmux set-environment -t "$SESSION" -u MAX_THINKING_TOKENS

# 4-S.2 CLIProxyAPI 프로세스는 유지 (pkill 금지)
# → 다음 Swarm 호출 시 health check 통과하면 즉시 재사용 (1.6-4 already_running 경로)
# → 수동 종료가 필요하면 사용자가 직접: pkill -f cli-proxy-api

# 4-S.3 캐시 업데이트
# .team-os/.env-verified JSON의 swarm.last_health_check 필드를 현재 시각으로
# (다음 세션의 1.6-4 health check 짧은 회로)
```

**⚠️ 4-S.1은 필수**: tmux 세션 env가 남아 있으면 다음 작업(예: 일반 `claude` 호출)이 Swarm 경로로 잘못 라우팅되어 Opus가 GPT-5.4로 실행되는 사고 발생. 반드시 언셋.

**4-S.2는 의도적으로 프로세스 유지**: 다음 세션에서 health check 1회로 재사용되어 PHASE 1.6.5 (기동) 단계를 스킵할 수 있음. 기동에는 보통 2~5초 소요되므로 장기간 유휴 비용보다 재사용 이득이 큽니다.

### 4. Standard mode cleanup (기존 v2/v3 경로)

> **v2 간소화 (Standard mode 기준):** CLIProxyAPI 종료, tmux 환경변수 제거 불필요
> (Workers가 Anthropic Direct이므로 프록시 관련 정리 없음)

---

## 트러블슈팅

### Codex exec가 실패하는 경우

1. 로그인 확인: `codex whoami`
2. 재로그인: `codex login`
3. 네트워크 확인: `curl -s https://api.openai.com/v1/models | head -5`

### DA 리뷰 품질이 낮은 경우

adversarial prompt를 조정합니다. 핵심 키워드:
- "Devil's Advocate" — 반론 유도
- "Challenge design decisions" — 설계 비판
- "hidden risks, race conditions, failure modes" — 깊은 분석 유도

### Agent Office가 자동 실행되지 않는 경우

수동 실행:
```bash
cd {project_root} && AGENT_OFFICE_ROOT=$(pwd) node agent-office/server.js &
```
브라우저에서 http://localhost:3747 접속.

### v1에서 마이그레이션

v1(CLIProxyAPI 기반)에서 v2로 전환 시:
1. CLIProxyAPI 프로세스 종료: `pkill -f "cli-proxy-api" || true`
2. tmux 환경변수 제거:
   ```bash
   TMUX_SESSION=$(tmux display-message -p '#S')
   tmux set-environment -t "$TMUX_SESSION" -u ANTHROPIC_BASE_URL
   tmux set-environment -t "$TMUX_SESSION" -u ANTHROPIC_AUTH_TOKEN
   tmux set-environment -t "$TMUX_SESSION" -u MAX_THINKING_TOKENS
   ```
3. `/tofu-at-codex` 재실행 → v2 자동 적용

CLIProxyAPI는 더 이상 필요 없지만 삭제하지 않아도 됩니다.

---

## 제한사항

| 항목 | 설명 |
|------|------|
| DA 실행 방식 | Lead가 `codex exec` 동기 호출. Worker 결과 수신 때마다 ~97초 대기 |
| codex exec 인증 | ChatGPT Plus/Pro 로그인 필요 |
| Codex 모델 | `gpt-5.4` (기본), `gpt-5.4-mini` (경량), `spark` (Pro only, 초고속) |
| Workers | Anthropic Direct — extended thinking, prompt caching 정상 작동 |
| 비용 | Workers: Anthropic API 비용. DA: Codex 사용량 (ChatGPT 구독 내) |
| `codex review` | diff 기반만 지원. 전체 파일 리뷰는 `codex exec` 사용 |


## Auto-Learned Patterns

- [2026-04-03] tofu-at-codex v3.0 R11-R17 실험에서 DA 역할을 adversarial reviewer로 명확히 분리해야 품질 검증 루프가 작동한다 (source: 2026-04-03-1424.md)
- [2026-04-03] tofu-at-codex 커맨드는 세션 간에 codex exec 인증 상태를 별도로 관리해야 한다 — 재시작 시 v1→v2 마이그레이션 절차 필수 (source: 2026-04-03-1301.md)
