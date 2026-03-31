---
description: "Codex 하이브리드 팀 — Codex 유무에 따라 자동 감지, DA 강화"
allowedTools: Bash, Read, Write, Glob, Grep, Skill, AskUserQuestion, Task, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, TaskList, SendMessage
---

# /tofu-at-codex — Codex Hybrid Team v2

> 기존 `/tofu-at` 워크플로우를 그대로 사용하되,
> **Codex CLI가 있으면 DA(Devil's Advocate)를 자동 강화**하는 하이브리드 모드입니다.
>
> Codex가 없어도 Standard 모드로 동일한 팀 워크플로우를 사용할 수 있습니다.

$ARGUMENTS

---

## 모드 개요

| 모드 | Workers | DA | 필요 조건 |
|------|---------|-----|----------|
| **Standard** | Anthropic Direct | Anthropic 팀원 | Claude Code + tmux |
| **Codex DA** (추천) | Anthropic Direct | `codex exec` adversarial | + Codex CLI 설치 |

Codex CLI 설치 여부를 자동 감지하여 사용 가능한 모드만 표시합니다.

---

## Quick Start

### 의존성

**필수:**

| # | 의존성 | 용도 | 설치 |
|---|--------|------|------|
| 1 | **tmux** | Agent Teams Split Pane | `sudo apt install tmux` / `brew install tmux` |
| 2 | **Claude Code** | Agent Teams 기반 | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |

**선택 (Codex DA 모드 활성화):**

| # | 의존성 | 용도 | 설치 |
|---|--------|------|------|
| 3 | **Codex CLI** | DA adversarial review | `npm install -g @openai/codex && codex login` |

> Codex CLI는 ChatGPT Plus/Pro 구독 또는 OpenAI API key가 필요합니다.
> 없어도 Standard 모드로 동일한 팀 워크플로우를 사용할 수 있습니다.

### 실행

```bash
tmux new -s claude   # tmux 세션 시작
claude               # Claude Code 실행
/tofu-at-codex       # 자동 모드 감지 + 실행
```

---

<mindset priority="HIGHEST">
이 명령어는 **환경 감지 → 모드 선택 → 팀 구성**을 수행하고,
팀 실행은 `/tofu-at`에 위임합니다.

**v2 설계 근거 (autoresearch 실험 결과):**

| Strategy | Score | Duration |
|----------|-------|----------|
| Baseline (기존) | 6.5 | 63분 |
| **Workers=Anthropic + DA=Codex adversarial** | **11.0** | **4.3분** |

Workers를 Anthropic Direct로 실행하고 Codex를 DA(adversarial review)에만 사용하는 것이
품질, 속도, 안정성 모든 면에서 최적.

<tofu-at-overrides priority="HIGH">
**tofu-at 위임 시 오버라이드 — 감지된 모드별 분기**

### Standard 모드 (Codex 없음)
- tofu-at STEP 2-B DA 선택: 기존 tofu-at 그대로 (OFF / Opus / Sonnet)
- Workers: Anthropic Direct (변경 없음)
- DA: tofu-at 기본 DA 팀원 방식 (변경 없음)

### Codex DA 모드 (추천)
- tofu-at STEP 2-B DA 선택지를 다음으로 대체:
  - "OFF" — DA 없이 진행
  - "ON (Codex Adversarial) (Recommended)" — `codex exec`로 DA
  - "ON (Opus)" — Anthropic Opus로 DA (기존 팀원 방식)
- Workers: Anthropic Direct
- DA: **Lead가 `codex exec`를 직접 호출** (팀원 스폰 아님)

**Codex DA 동작 방식:**

Codex DA는 팀원이 아닙니다. Lead가 Bash로 `codex exec`를 직접 호출합니다:

```
일반 tofu-at:
  Lead ←→ Worker-1, Worker-2, DA(팀원)  ← DA가 idle 대기

Codex DA:
  Lead ←→ Worker-1, Worker-2
        ─→ codex exec (Bash 호출)        ← 필요할 때만, 즉시 실행
```

1. Worker가 결과를 보고하면 Lead가 수신
2. Lead가 Worker 결과를 `codex exec` prompt에 포함하여 adversarial review 요청
3. `codex exec`가 ~97초 내에 리뷰 완료 → Lead가 결과 판단
4. 모든 Worker 완료 후 종합 adversarial review 1회 추가 실행

장점:
- DA를 팀원으로 스폰하지 않아 idle 문제 없음
- Lead가 직접 호출하므로 타이밍 제어 완벽
- adversarial 관점이 일반 리뷰보다 50% 더 깊은 분석 유도

**DA 개별 리뷰 템플릿 (STEP 7-6 대체):**

Worker 결과를 받으면 Lead가 직접 실행:

```bash
codex exec --full-auto "Review the following work as a Devil's Advocate. Challenge design decisions, question assumptions, find hidden risks, race conditions, failure modes. For each concern: severity, location, the issue, and what would be safer.

=== TASK DESCRIPTION ===
{원래 태스크 설명}

=== WORKER OUTPUT ===
{Worker 결과물}

Top 5-10 findings only. Be specific with file paths and line numbers."
```

**DA 종합 리뷰 템플릿 (STEP 7-6.5 대체):**

모든 Worker 완료 후:

```bash
codex exec --full-auto "Cross-validate multiple workers' outputs. Find inconsistencies, missed requirements, and integration issues.

=== ORIGINAL PLAN ===
{팀 플랜}

=== WORKER RESULTS ===
{모든 Worker 결과 종합}

Provide: (1) cross-validation findings, (2) integration concerns, (3) quality assessment, (4) residual risks."
```

**DA OFF인 경우:** STEP 7-6, 7-6.5를 건너뜁니다.
**DA ON (Opus)인 경우:** 기존 tofu-at 방식 그대로 — Opus 팀원으로 DA 스폰.
</tofu-at-overrides>

절대 금지:
- 기존 tofu-at.md 수정 X
- tofu-at 스킬 파일 수정 X
</mindset>

---

## PHASE 0: 환경 감지 + 모드 선택

### 0-1. 자동 감지

```bash
# tmux 확인
TMUX_SESSION=$(tmux display-message -p '#S' 2>/dev/null) || TMUX_SESSION=""

# Codex CLI 확인
CODEX_VERSION=$(codex --version 2>/dev/null) || CODEX_VERSION=""
CODEX_AUTH=$(codex whoami 2>/dev/null) || CODEX_AUTH=""
```

### 0-2. 감지 결과 표시 + 모드 선택

```
감지 결과:
| 항목 | 상태 |
|------|------|
| tmux | {TMUX_SESSION 또는 "미실행"} |
| Codex CLI | {CODEX_VERSION 또는 "미설치"} |
| Codex 로그인 | {CODEX_AUTH 또는 "미인증"} |
```

tmux 미실행 시 **중단**: "tmux 세션 내에서 실행해야 합니다."

**감지 기반 선택지 생성:**

```
options = []

# 항상 사용 가능
options.push("Standard — Workers=Anthropic, DA=Anthropic 팀원")

# Codex CLI 설치 + 로그인 완료 시
IF CODEX_VERSION AND CODEX_AUTH:
  options.push("Codex DA (Recommended) — Workers=Anthropic, DA=codex exec adversarial")

AskUserQuestion({
  "questions": [{
    "question": "실행 모드를 선택하세요.",
    "header": "Mode",
    "options": options (감지된 것만 표시)
  }]
})
```

**Codex CLI가 없는 사용자**에게는 Standard만 표시됩니다.

---

## PHASE 1: 모드별 환경 설정

### Standard 모드

추가 설정 없음. 바로 PHASE 2로 진행.

### Codex DA 모드

```bash
# Codex CLI 실행 테스트
RESPONSE=$(codex exec --full-auto "Reply with exactly: CODEX_OK" 2>&1)
```

- `CODEX_OK` 포함 → Codex DA 준비 완료
- 실패 → `codex login` 재실행 안내, Standard로 폴백

> **Codex DA 모드 활성화**
>
> | 역할 | 모델 | 실행 방식 |
> |------|------|----------|
> | Leader | Opus | Anthropic Direct |
> | Workers | Sonnet/Opus | Anthropic Direct |
> | DA | GPT-5.4 | `codex exec` (Lead 직접 호출) |

---

## PHASE 2: Agent Office 대시보드 실행 (선택)

### 2-1. agent-office 경로 감지

```
1. Bash("echo $AGENT_OFFICE_PATH 2>/dev/null") → 환경변수
2. 현재 작업 디렉토리에서 상위로 walk-up하며 `agent-office/server.js` 탐색
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
```

---

## PHASE 3: tofu-at 워크플로우 위임

```
Skill("tofu-at", args: "$ARGUMENTS")
```

표준 tofu-at STEP 0~9 전체 실행.

### 모드별 tofu-at 오버라이드

#### Standard 모드
- 변경 없음. tofu-at 기본 동작 그대로.

#### Codex DA 모드

| tofu-at STEP | v2 변경사항 |
|-------------|------------|
| STEP 2-B | DA 선택지: OFF / Codex Adversarial(추천) / Opus |
| STEP 7-4-1 | **동시 스폰 OK** (DA를 팀원으로 스폰하지 않음) |
| STEP 7-6 | Lead가 `codex exec` 직접 호출 (DA 팀원 아님) |
| STEP 7-6.5 | Lead가 `codex exec` 종합 리뷰 |
| STEP 7-7 | DA 셧다운 불필요 (프로세스 아님) |
| 나머지 | 변경 없음 |

---

## PHASE 4: 정리

```bash
# Agent Office stale 데이터 정리
curl -s -X POST http://localhost:3747/api/session/clear --connect-timeout 2 || true
```

---

## 트러블슈팅

### Codex exec가 실패하는 경우
1. `codex whoami` — 로그인 확인
2. `codex login` — 재인증
3. Standard 모드로 폴백 가능

### DA 리뷰 품질이 낮은 경우
adversarial prompt 조정. 핵심 키워드:
- "Devil's Advocate" — 반론 유도
- "Challenge design decisions" — 설계 비판
- "hidden risks, race conditions, failure modes" — 깊은 분석

### Agent Office 미실행
```bash
cd {project_root} && AGENT_OFFICE_ROOT=$(pwd) node agent-office/server.js &
```

---

## 제한사항

| 항목 | Standard | Codex DA |
|------|----------|----------|
| 추가 의존성 | 없음 | Codex CLI (ChatGPT Plus/Pro 또는 API key) |
| DA 품질 | 일반 | 높음 (adversarial, +50% 깊은 분석) |
| DA 속도 | Worker 속도와 동일 | ~97초 (Lead 직접 호출) |
| DA idle 문제 | 있을 수 있음 | 없음 (CLI 호출) |
| Workers 속도 | 빠름 (Anthropic Direct) | 빠름 (동일) |
| 비용 | Anthropic만 | Anthropic + Codex 사용량 |
| extended thinking | 지원 | 지원 (Workers) |
