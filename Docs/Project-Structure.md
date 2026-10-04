# 코드 구조 (Project Structure)

> 새 에이전트·개발자가 이 템플릿을 5분 안에 파악하기 위한 디렉터리 가이드입니다.
> 전체 설계 원칙은 `Docs/Architecture.md`, 확장 절차는 `Docs/Extension-Guide.md`를 참고하세요.

```
.
├── AGENTS.md                  # AI 코딩 에이전트 작업 지침 (이 리포지토리용)
├── BRANDING.md                # 로고·앱 이름 교체 체크리스트
├── DESIGN.md                  # 디자인 시스템(색·타이포·패턴)
├── package.json               # pnpm 스크립트·의존성
├── index.html                 # <html class="light"> 시작(FOUC 방지), <title>
├── tailwind.config.ts         # design/tailwind.preset.ts 사용
├── components.json            # shadcn/ui 설정
├── design/
│   ├── tokens.json            # 색·폰트 단일 진실 공급원 (수정 후 build-theme 실행)
│   ├── build-theme.mjs        # theme.css 생성 + 대비율 검증
│   ├── theme.css              # 생성물(HSL 변수)
│   ├── tailwind.preset.ts     # Tailwind v3 프리셋(토큰 매핑)
│   └── brand/                 # Vanilla 아이콘·마크·배너·패턴 SVG (교체 대상)
├── public/favicon.png         # 파비콘 (교체 대상)
├── src/
│   ├── main.tsx               # 진입점 (StrictMode + ErrorBoundary + App)
│   ├── App.tsx                # HashRouter + Provider 조합 + 첫 실행 언어 팝업
│   ├── index.css              # 테마 변수 + 폰트 + base 스타일
│   ├── lib/brand.ts           # APP_NAME/APP_VERSION (교체 대상)
│   ├── components/
│   │   ├── brand/AppMark.tsx          # 로고 컴포넌트 (교체 대상)
│   │   ├── layout/                    # ActivityBar, TopMenuBar, WorkspaceLayout
│   │   ├── sidepanel/SidePanel.tsx    # activeView → 패널 라우터
│   │   ├── explorer/FileTree.tsx      # 파일 트리 (Tauri fs_commands 사용)
│   │   ├── workspace/
│   │   │   ├── CenterWorkspace.tsx    # 탭 바 + 드래그 + 분할 + 콘텐츠 라우팅
│   │   │   ├── EditorTab.tsx          # CodeMirror 편집기 (자동 저장)
│   │   │   ├── ImageViewerTab.tsx     # 이미지 뷰어 (줌)
│   │   │   ├── WelcomeGuide.tsx       # 폴더 없음/시작 가이드 (+ 테트리스 열기)
│   │   │   ├── TabPlaceholder.tsx     # 미등록 탭 타입 폴백
│   │   │   └── TrustWorkspaceDialog.tsx # 폴더 신뢰 확인
│   │   ├── game/
│   │   │   ├── TetrisTab.tsx          # 수동 플레이 탭 (tab.meta.sessionId 시드)
│   │   │   └── BoardCanvas.tsx        # Canvas 보드 렌더러 (고스트 피스 포함)
│   │   ├── language/LanguageSelectDialog.tsx # 첫 실행 언어 선택
│   │   ├── ui/                        # shadcn/ui 프리미티브 + Vanilla 컴포넌트(Badge·Card·Switch·Progress·Tabs·Table·Textarea)
│   │   └── ErrorBoundary.tsx
│   ├── pages/
│   │   ├── Workspace.tsx              # Provider 조립 + ActivityBar 동작 + 시작 탭
│   │   └── Settings/                  # 전체 화면 설정 라우트
│   │       ├── SettingsLayout.tsx     # 좌측 네비 + Outlet (항목 추가 지점)
│   │       └── SettingsGeneral.tsx    # 테마·언어
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts    # 전역 단축키
│   └── lib/
│       ├── utils.ts / fileIcons.ts
│       ├── tetris/                      # 순수 게임 엔진 (types, constants, engine)
│       ├── sim/                         # 시뮬레이터 루프 (types, simulator, headless)
│       ├── ai/                          # 에이전트 인터페이스 + candidates/mock/heuristic
│       ├── types/                     # workspaceTab(탭 타입에 'game' 포함), settings, fileTree
│       ├── context/                   # concern별 Context (전역 스토어 금지)
│       │   ├── WorkspaceContext.tsx   # workspaceRoot + 신뢰 + 최근 폴더
│       │   ├── WorkspaceTabsContext.tsx # 탭 상태 + 드래그/분할 + 영속화
│       │   ├── SidePanelContext.tsx   # activeView
│       │   ├── SettingsContext.tsx    # AppSettings
│       │   └── ThemeContext.tsx       # light/dark/system
│       ├── i18n/                      # Locale, 사전(ko/en), LanguageContext
│       ├── db/
│       │   ├── client.ts              # 전역/프로젝트 DB + MemorySqlFallback
│       │   ├── migrations/0001_init.sql # 스키마 원본 (client.ts와 동기화 유지)
│       │   └── repositories/          # settingsRepo + simRepo(시뮬레이터 로그)
└── src-tauri/
    ├── tauri.conf.json        # productName/identifier/창/CSP (교체 대상)
    ├── Cargo.toml
    ├── capabilities/default.json # Tauri 권한 (필요 최소한만)
    └── src/
        ├── main.rs / lib.rs   # 플러그인 + invoke_handler 등록 지점
        └── commands/          # fs/search/shell 명령 (신규 명령 추가 지점)
```

## 어디를 먼저 읽을까

| 목적             | 파일                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| 화면 구조 파악   | `src/pages/Workspace.tsx`, `src/components/layout/*`                                       |
| 탭 동작 파악     | `src/components/workspace/CenterWorkspace.tsx`, `src/lib/context/WorkspaceTabsContext.tsx` |
| 데이터 흐름 파악 | `src/lib/db/client.ts`, `src/lib/db/repositories/settingsRepo.ts`                          |
| 문구 추가        | `src/lib/i18n/dictionaries/ko.ts` + `en.ts`                                                |
| 새 기능 추가     | `Docs/Extension-Guide.md`                                                                  |

## 소유 규칙

- 새 도메인 엔티티는 `src/lib/<도메인>/` + `src/components/<도메인>/` +
  `src/lib/types/<도메인>.ts` 세트를 새로 만듭니다.
  탭·패널 등록 절차는 `Docs/Extension-Guide.md`를 따르세요.
- `src/components/ui/`는 shadcn CLI로만 추가하고 직접 수정하지 않습니다.
- 파일/폴더명은 이 트리의 위치를 그대로 따릅니다. 구조 변경이 필요하면
  이 문서와 코드를 함께 갱신합니다.
