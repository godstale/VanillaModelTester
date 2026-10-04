# 게임 시뮬레이터 구현 계획서 (테트리스 × Laya)

> 목표: 테트리스 게임을 직접 구현하고, Laya 판정 모델로 자동 플레이를
> 시뮬레이션하면서 플레이 로그 → 평가 → 개선으로 이어지는 고리를 만든다.
> 기준 커밋: 최소 셸 정리(`chore/minimal-shell-for-laya`) 이후.
> 관련 문서: `Docs/Architecture.md`, `Docs/Extension-Guide.md`.

## 0. 전제 (계획 전체에 적용)

1. **Laya는 판정 함수이지 게임 에이전트가 아니다.** 입력(보드 상태 서술)과
   질문(둘 중 어느 수가 나은가)을 받아 선택지+확률만 돌려준다. 키 입력·게임
   진행·보상 계산은 전부 우리 코드가 맡는다.
2. **"자동 학습"의 정의**: Laya 체크포인트는 앱 안에서 온라인으로 가중치가
   바뀌지 않는다. 여기서 학습이란 (a) 로그 수집 → (b) 자동 라벨링 →
   (c) 확률 캘리브레이션 보정 → (d) Python 측 오프라인 파인튜닝(RLCD) →
   (e) 재배포의 플라이휠을 말한다.
3. **정직한 베이스라인**:記号 보드(ASCII/JSON)에 대한 Laya 제로샷 성능은
   검증된 바가 없다. 고전 휴리스틱 AI를 베이스라인으로 두고, Laya가 휴리스틱을
   이기는지부터 측정한다. 지면 스키마·인코딩을 의심하고, 모델 탓을 나중에 한다.
4. **새 의존성 금지**(AGENTS.md): 차트·상태 라이브러리를 추가하지 않는다.
   그래프는 SVG/Canvas 직접 렌더링, 상태는 Context per concern.

## 1. 아키텍처 개요

```
┌─────────────┐   actions    ┌──────────────┐   state     ┌───────────────┐
│  TetrisTab  │ ───────────▶ │  Simulator   │ ──────────▶ │ DecisionAgent │
│ (Canvas+HUD)│ ◀─────────── │ (tick/episode│ ◀────────── │  (인터페이스) │
└─────────────┘    snapshot  └──────────────┘  decision   └───────┬───────┘
        │                              │                         │
        │                              ▼                         ▼
        │                     ┌──────────────┐           ┌─────────────────┐
        └────────────────────▶│ simRepo      │           │ Mock/Heuristic/ │
           (통계 조회)        │ (SQLite 로그) │           │ LayaHttp/LayaOnnx│
                              └──────────────┘           └─────────────────┘
```

- `src/lib/tetris/`: 순수 게임 엔진. React·Tauri·Laya를 모른다.
- `src/lib/sim/`: 시뮬레이터 루프(틱, 에피소드, 속도 제어, 헤드리스 배치).
- `src/lib/ai/`: 에이전트 인터페이스 + 구현체 + 상태 인코더 + 질문 스키마.
- `src/components/game/`: 탭 UI(Canvas 렌더러, 컨트롤 바, 통계 HUD).
- 영속화: 에피소드/스텝 로그는 SQLite(`sim_episodes`, `sim_steps`).

## 2. 게임 엔진 (`src/lib/tetris/`)

표준 10×20 보드, 7종 테트로미노, 중력·잠금·줄 제거·레벨 점수.

| 파일 | 내용 |
|---|---|
| `types.ts` | `Cell`, `Board(10×20)`, `PieceKind`, `ActivePiece {kind, rot, x, y}`, `GameEvent`, `EngineState` |
| `constants.ts` | 보드 크기, 7종 스폰 모양, 점수표(싱글~테트리스, 콤보), 중력표(레벨→틱 간격) |
| `rng.ts` | 시드 RNG(mulberry32) + 7-bag 셔플. 결정성 리플레이의 핵심 |
| `engine.ts` | 순수 함수: `createGame(seed)`, `tryMove`, `tryRotate`(벽킥: 좌/우 1칸, 회전 제한판), `tick`(중력 1틱), `hardDrop`, `lockPiece`, `clearLines`. 부수효과 없음 |
| `engine.test.ts` | 회전·충돌·벽킥·줄 제거·점수·7-bag 분포·동일 시드 동일 전개 |

결정 사항:

- 회전 시스템은 SRS 전체가 아닌 **단순 벽킥**(좌/우 1칸 시도)으로 시작한다.
  SRS 풀 구현은 M3 이후로 미룬다.
- `tick`은 시간 개념을 갖지 않는다. 시간은 `sim/`이 관리하고, 엔진은
  "1틱 진행"만 수행한다. 이렇게 해야 헤드리스 고속 시뮬레이션이 가능하다.

## 3. 시뮬레이터 루프 (`src/lib/sim/`)

| 파일 | 내용 |
|---|---|
| `types.ts` | `SimConfig {gravityTickMs, decisionEveryNTicks, maxSteps, seed}`, `EpisodeStats {steps, lines, score, pieces, durationMs, decisions, avgConfidence, lowConfFallsBack}` |
| `simulator.ts` | `Simulator` 클래스: `start/pause/resume/stepOnce/reset`, 에피소드 종료 판정(게임오버·maxSteps), 통계 집계. 렌더와 분리 — `onSnapshot(state)` 콜백으로만 UI에 전달 |
| `headless.ts` | 렌더 없이 N 에피소드 연속 실행(벤치마크·데이터 수집용). `pnpm dev` 웹에서도 동작해야 하므로 Node API·Tauri API를 직접 쓰지 않는다 |

타이밍 모델:

- 중력 틱과 판정 틱을 분리한다. `decisionEveryNTicks=1`이면 매 낙하 스텝마다
  판정, `=5`이면 5틱마다 1회 판정(그 사이에는 이전 결정 유지).
- Laya 호출은 비동기이므로, 판정 대기 중에도 중력이 멈추는 **동기 모드**(기본,
  재현 가능)와 판정 없이 중력만 가는 **실시간 모드**를 둔다. 자동 플레이
  기록의 재현성은 동기 모드가 보장한다.
- 속도 제어: `1x / 10x / max(헤드리스)` 3단.

## 4. AI 어댑터 (`src/lib/ai/`)

```ts
// ai/types.ts
export interface BoardSnapshot { board: Board; active: ActivePiece; next: PieceKind[]; score: number; lines: number; level: number; stepIndex: number; }
export interface CandidateMove { id: string; actions: EngineAction[]; landing: LandingFeatures; }
export interface MoveDecision { moveId: string; confidence: number; abstained: boolean; latencyMs: number; raw?: unknown; }
export interface DecisionAgent { readonly name: string; decide(snap: BoardSnapshot, cands: CandidateMove[]): Promise<MoveDecision>; }
```

| 파일 | 내용 |
|---|---|
| `types.ts` | 위 인터페이스 + `EngineAction`(left/right/rotate/drop/wait) |
| `candidates.ts` | 현재 조각의 **합법 착지 후보 전부 열거**(회전×x위치 시뮬레이션, 최대 34개). 후보마다 Dellacherie 특성(착지 높이·구멍·울퉁불퉁도·제거줄) 계산 |
| `stateEncoder.ts` | 후보 N개를 Laya 질문 1개로 묶을 수 있게 인코딩. §5 참조 |
| `mockAgent.ts` | 랜덤 + 고정 시드. 파이프라인 스모크용 |
| `heuristicAgent.ts` | 베이스라인. 가중합 평가함수(가중치는 상수로 시작, M4에서 로그 기반 조정) |
| `layaHttpAgent.ts` | M3. `laya-serve`의 `POST /v1/systemone` 호출(fetch). 타임아웃·폴백 내장 |
| `layaOnnxAgent.ts` | M5. 벤더링한 `laya-ts` 사용. §8 참조 |

공통 규칙:

- 모든 에이전트는 **타임아웃**(기본 2s)을 가지며, 초과·에러·`abstained` 시
  `heuristicAgent`로 폴백하고 `lowConfFallsBack` 카운터를 올린다.
- `confidence` 게이팅 기준은 `answer_confidence`(Laya 문서가 게이팅 기준으로
  지정한 필드)이며, 엔트로피 기반 `confidence`가 아니다.

## 5. 상태 인코딩과 질문 스키마 (핵심 설계)

제약: 영어 체크포인트 컨텍스트 512토큰, 옵션 헤드 예산 `head_max_len=192`.
옵션이 많아지면 옵션당 토큰이 잘려 구분이 흐려진다(Banking77 0.425의 원인).

**권장안: "전체 보드 + 후보 열거 + choice 1문항" (v2)**

- state: 10×20 전체 격자(`.`=빈칸, `#`=점유, row0=top) + 상태행으로 준다.
  상태행 = `holes/maxH/활성조각(kind rot x y)/next/점수·라인·레벨·스텝/후보수/컷수`.
  후보가 8개를 넘으면 내부 스코어 상위 8개로 컷하고 `dropped=N`으로 컷 사실을
  프롬프트에 명시한다(컷 기준·개수는 로그에도 기록).
- questions: `place` 1문항, `type: choice`, criteria = 후보 id → 전체 착지 특성
  1줄 설명(rot/x/착지y/제거줄/구멍/maxH/aggH/bump).
- 추가로 `danger` 1문항(`type: noul`, "이 보드가 5수 안에 죽는가")을 같은
  forward pass에 묶는다. Laya는 한 호출의 전 문항을 1 pass로 처리하므로
  추가 비용이 거의 없다. Laya 실패(타임아웃·기권·에러) 시 구조하지 않고
  에피소드를 중단한다(`laya-error`).
- 토큰 예산(상태 컨텍스트 512): 격자 약 219자 + 상태행 약 120자 +
  후보 8개 × 약 90자 ≈ 1100자(약 275토큰). criteria 1개당 약 100자(약 25토큰)로
  `head_max_len=192` 안에 들어간다.

```
state = "board 10x20 (row0=top, .=empty #=filled):\n" +
        "..........\n... (20 rows) ...\n" +
        "holes=3 maxH=11 active=T rot=0 x=3 y=0 next=[S,Z] " +
        "score=120 lines=2 level=1 step=15 cands=8/12 dropped=4\n" +
        "r0x0: rot 0 x 0 y 18 lines 0 holes +1 maxH 12 aggH 30 bump 8 | ..."
questions = {
  "place":  { "type": "choice", "instructions": "Choose the landing that keeps the stack lowest and flattest.",
              "criteria": { "r0x0": "rot 0 x 0 y 18, clears 0, holes +1, maxH 12, aggH 30, bump 8",
                            "r2x4": "rot 2 x 4 y 18, clears 1, holes +0, maxH 9, aggH 22, bump 4" } },
  "danger": { "type": "noul", "instructions": "Will this stack top out within 5 pieces?" }
}
```

- 대안(폐기 아님, 실험용): 특성 텍스트 state + `score` 문항으로 후보 점수화.
  M4 실험에서 권장안과 비교한다.
- 한국어 이슈 없음: 상태는 전부 기호·영문 키이므로 라우터는 항상 영어
  체크포인트를 탄다. 다국어 체크포인트는 쓰지 않는다.

## 6. UI (`src/components/game/` + 등록 3점)

| 파일 | 내용 |
|---|---|
| `TetrisTab.tsx` | `tab.meta.sessionId`로 시뮬레이터 인스턴스 보유. Canvas 보드 + 다음 조각 + 점수/라인/레벨 HUD + 컨트롤 바(시작·일시정지·1스텝·속도·에이전트 선택·신뢰도 표시) |
| `BoardCanvas.tsx` | Canvas 렌더러. `requestAnimationFrame`가 아니라 스냅샷 콜백 때만 redraw |
| `SimPanel.tsx` | 사이드 패널(선택): 에피소드 목록·베스트 기록. 1단계에서는 탭 안에 두고, 필요해지면 `SidePanelView`에 `'sim'` 추가 |
| `GameControls.tsx` | 컨트롤 바 분리(키보드 조작과 공유) |

등록 절차(Extension-Guide §1 준수):

1. `workspaceTab.ts`에 `'game'` 추가(대시보드는 M4에서 `'sim-log'` 추가 검토).
2. `CenterWorkspace.tsx`의 `TAB_ICONS` + `renderTabContent`에 분기 추가.
3. 멱등 id: `openTab({ id: 'game:<sessionId>', type: 'game', title, meta: { sessionId } })`.
4. 수동 플레이: 게임 탭이 열려 있을 때만 방향키를 가로채는 로컬 키 핸들러
   (`useKeyboardShortcuts`의 전역 단축키와 충돌 금지 — 입력 포커스가 탭 안에
   있을 때만 동작).
5. 사전 키: `game.*` 네임스페이스(ko/en 동시).

## 7. 데이터·DB (Extension-Guide §6 절차)

마이그레이션 `0002_sim.sql` + `client.ts`의 `MIGRATION_STATEMENTS`에 동일문 추가:

```sql
CREATE TABLE IF NOT EXISTS sim_episodes (
  id TEXT PRIMARY KEY, agent TEXT NOT NULL, seed INTEGER NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0, lines INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0, pieces INTEGER NOT NULL DEFAULT 0,
  decisions INTEGER NOT NULL DEFAULT 0, fallbacks INTEGER NOT NULL DEFAULT 0,
  avg_confidence REAL, duration_ms INTEGER NOT NULL DEFAULT 0,
  ended_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sim_steps (
  episode_id TEXT NOT NULL, step_index INTEGER NOT NULL,
  state TEXT NOT NULL, candidates TEXT NOT NULL,
  chosen TEXT NOT NULL, confidence REAL NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (episode_id, step_index)
);
CREATE INDEX IF NOT EXISTS idx_sim_episodes_agent ON sim_episodes(agent);
```

- `src/lib/db/repositories/simRepo.ts`: 에피소드 시작/종료 기록, 스텝 배치
  기록(매 스텝 INSERT가 아니라 50스텝 버퍼 후 flush), 에이전트별 집계 조회.
- `MemorySqlFallback`에 두 테이블 분기 추가(웹 프리뷰·테스트용).
- `state`·`candidates`는 §5 인코딩 문자열 그대로 저장 → 나중에 오프라인
  라벨링·캘리브레이션의 원천 데이터가 된다.

## 8. Laya 연동 (3안 비교와 순서)

| 안 | 방식 | 장점 | 단점 | 시기 |
|---|---|---|---|---|
| A | Python `laya-serve`를 localhost HTTP로 호출 | 공식 지원·캘리브레이션 전부 사용 가능. 구현 최소 | 사용자 PC에 Python+torch 필요. 앱 배포 시 번들 불가. Tauri sidecar는 바이너리만 되므로 Python 프로세스 관리는 별도 설계 필요 | M3 |
| B | `laya-ts` 소스 벤더링 + ONNX Runtime | Python 불필요(추론만). 앱 내장 가능 | **npm 미배포**(registry 404 확인)라 git 서브모듈/벤더링+직접 빌드 필요. ONNX 익스포트 1회는 Python+torch 필요. 모델 파일 ~1.3GB 첫 다운로드·캐시 설계 필요 | M5 |
| C | Python 오프라인 파인튜닝 | 테트리스 특화 정확도 상승의 유일한 경로 | 별도 Python 환경·GPU 권장. 노트북 기반 수동 단계 | M4 이후 |

순서: **A → C → B**. A로 고리를 먼저 증명하고, C로 성능을 올리고,
B는 배포 형태가 필요해질 때만 착수한다. M2까지는 Python 없이
mock/heuristic으로 전체 파이프라인을 완성한다.

`run_shell` 보안 규칙(AGENTS.md §6)상, 앱이 Python 프로세스를 자동 실행하는
설계는 사용자 확인 UX와 함께 별도 검토가 필요하다. M3에서는 "사용자가 직접
`laya-serve`를 띄우고 URL을 설정에 입력"하는 수동 연결로 시작한다.

## 9. 학습 플라이휠 (M4)

1. 수집: `sim_steps`에 (state, candidates, chosen, confidence) 자동 축적.
2. 자동 라벨링: 에피소드 결과를 스텝에 소급 — 예: 에피소드 상위 25% 진입
   스텝의 선택을 positive, 하위 25%를 negative로.
3. 캘리브레이션: 동일 조건 반복 호출로 `answer_confidence`와 실제 좋은 수
   비율을 비교, 게이팅 임계치 조정(앱 내 설정값으로 저장).
4. (Python, 수동) 라벨 데이터로 RLCD 파인튜닝 노트북 실행 → 체크포인트 교체.
5. 재측정: 동일 시드 세트에서 lines/에피소드 비교. 베이스라인 휴리스틱과
   함께 리포트로 남긴다.

## 10. 테스트 계획

- `engine.test.ts`: 회전·충돌·벽킥·줄 제거(싱글~테트리스)·점수·7-bag·동일
  시드 결정성. 게임 로직 변경 시 필수.
- `candidates.test.ts`: 후보 열거 완전성(합법 착지 누락 없음)·특성값 스냅샷.
- `stateEncoder.test.ts`: 토큰 예산(문자 수 상한) 초과 시 컷+경고, 컷 기준
  기록 여부.
- `simulator.test.ts`: 동기 모드 동일 시드 동일 결과, 폴백 카운터 동작.
- `simRepo.test.ts`: MemorySqlFallback 라운드트립.
- 헤드리스 스모크: mock 에이전트로 10 에피소드 완주(게임오버까지) — CI는
  아니고 수동/스크립트 실행.

## 11. 마일스톤

- **M1 엔진+수동 플레이**: `src/lib/tetris` + `TetrisTab` 수동 조작.
  DoD: 키보드로 1게임 완주 가능, `lint`·`typecheck`·`test` 통과.
- **M2 자동 시뮬레이션 골격**: `sim/` + mock/heuristic + 에피소드 통계.
  DoD: 헤드리스 100 에피소드 완주, 휴리스틱 평균 라인수 베이스라인 기록.
- **M3 Laya 연결**: `layaHttpAgent` + 인코딩 v1 + 폴백.
  DoD: `laya-serve` 연동 상태에서 10 에피소드 완주, 로그 적재 확인.
- **M4 측정·보정**: 베이스라인 비교 리포트 + 임계치 조정 + 스키마 실험 1회.
  DoD: 동일 시드 세트 비교표(에이전트×평균라인×폴백률) 문서화.
- **M5 내장화(선택)**: `laya-ts` 벤더링 또는 fine-tune 체크포인트 교체.
  DoD: M4 리포트에서 필요성이 입증된 경우에만 착수.

브랜치 운용: 마일스톤당 `feat/tetris-m1-engine` … 식으로 분리,
push는 매번 승인 후.
