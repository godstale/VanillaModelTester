# 아키텍처 설계서 (템플릿)

> 이 문서는 이 템플릿으로 시작하는 모든 프로젝트가 공통으로 참조하는
> **단일 진실 공급원(Source of Truth)**입니다. 특정 프로젝트의 도메인 요구사항이
> 이 문서와 충돌하면, 프로젝트의 설계 문서를 새로 작성하고 이 파일은 템플릿
> 원본으로 유지하십시오.

## 0. 한눈에 보는 요약

- **형태**: Tauri 2 기반 데스크탑 앱 (Windows 우선)
- **프런트엔드**: React 19 + TypeScript(strict) + Vite 7
- **UI 시스템**: shadcn/ui("new-york") + Radix UI + Tailwind CSS 3 + lucide-react
- **레이아웃**: 좌측 아이콘 사이드바 + 좌측 리사이저블 패널 + 우측 탭 콘텐츠
  (+ 탭 드래그 재정렬·화면 분할) + 파일 뷰어
- **상태관리**: React Context per concern (Redux/Zustand 등 금지)
- **저장소**: SQLite (`tauri-plugin-sql`) — 전역 DB + 프로젝트별 DB 분리
- **다국어**: ko/en 기본 내장 (`src/lib/i18n`)
- **패키지 매니저**: pnpm
- **라우팅**: react-router-dom v7, **`HashRouter`** 필수
  (Tauri 번들 자산 프로토콜에 SPA fallback이 없으므로 `BrowserRouter` 금지)

---

## 1. 레이아웃

### 1.1 좌측 아이콘 사이드바 (`ActivityBar.tsx`)

데이터 기반 배열, 순수 컨트롤드 컴포넌트, 활성 아이콘에 `bg-primary/10 text-primary` 타일.

```ts
type SidePanelView = 'explorer' | null;
```

- 아이콘 클릭 시 패널이 없으면 펼치고 해당 뷰로 전환, 이미 활성인 아이콘을 다시 클릭하면 패널이 접힘 (`Workspace.tsx`의 `handleActivityBarSelect`).
- Settings는 `<Link to="/settings">`로 이동 (사이드패널이 아닌 전체 화면 전환).
- 폴더가 열려 있지 않으면 `explorer` 외의 패널은 비활성화.

### 1.2 좌측 패널 (`WorkspaceLayout.tsx` + `SidePanel.tsx`)

- `react-resizable-panels`의 `PanelGroup`(`direction="horizontal"`, `autoSaveId="apptemplate-layout-v1"`).
- 사이드패널: `defaultSize={20} minSize={16} collapsible collapsedSize={0}`, `ImperativePanelHandle` ref로 ActivityBar와 연동.
- 센터: `minSize={40}`.
- `SidePanel.tsx`는 `activeView`에 따라 컴포넌트를 렌더링하는 얇은 라우터.
  새 패널을 추가하는 방법은 `Docs/Extension-Guide.md` 참고.

### 1.3 우측 탭 콘텐츠 (`CenterWorkspace.tsx`)

```ts
type WorkspaceTabType = 'editor' | 'image-viewer' | 'welcome';

interface WorkspaceTab {
  id: string; // 예: "editor:${filePath}", "collection:${itemId}"
  type: WorkspaceTabType;
  title: string;
  meta?: Record<string, unknown>;
  pane?: 'primary' | 'secondary';
}
```

- **멱등 openTab**: 같은 `id`로 열면 기존 탭으로 포커스만 이동. 파일은 `editor:${path}`,
  엔티티는 `<type>:<id>` 규칙으로 id를 만들 것.
- **탭 드래그**: HTML5 draggable. 같은 페인에서는 순서 변경, 다른 페인 탭 위에서는
  해당 위치에 삽입, 탭 스트립 빈 공간에 놓으면 맨 뒤로 이동.
- **화면 분할**: 콘텐츠 영역의 좌/우/상/하 가장자리(35% 기준)에 드롭하면
  `splitTab()`으로 `primary`/`secondary` 2분할. 분할 상태에서는 반대편으로 이동만 가능.
- 우클릭 메뉴: 닫기/왼쪽 닫기/오른쪽 닫기/다른 탭 닫기/모두 닫기 + 분할/이동.
- 탭 콘텐츠는 **모두 마운트 유지 + `hidden` 전환** (비활성 탭 상태 보존).
- 탭 목록/활성 탭은 SQLite `app_settings`에 디바운스(500ms) 저장 후 재시작 시 복원.
- 새 탭 종류를 추가하는 방법은 `Docs/Extension-Guide.md` 참고.

### 1.4 파일 뷰어

- `EditorTab.tsx`: CodeMirror 6 기반 편집기. 텍스트·코드·마크다운(편집/미리보기/분할 3모드) 지원, 500ms 자동 저장.
- `ImageViewerTab.tsx`: `convertFileSrc` + 25~400% 줌.
- `CodeViewer.tsx`: 읽기 전용 코드 블록(구문 강조 내장).

---

## 2. 폴더(프로젝트) 기반 동작

- `TopMenuBar`/`WelcomeGuide`에서 `pick_project_folder`로 폴더를 선택하면
  `WorkspaceContext`가 `workspaceRoot`를 세팅하고 `set_active_workspace`를 호출해
  Rust 측 스코프를 고정합니다.
- 폴더가 없으면 사이드패널은 `explorer`로 강제되고 센터에는 `WelcomeGuide`가 표시됩니다.
- 폴더를 열면 `{workspaceRoot}/.app-data/`가 자동 생성되고 프로젝트 DB가 열립니다.
- **워크스페이스 스코프**: 모든 파일 명령은 `workspace_root` 밖 경로 접근을 거부합니다
  (심링크는 canonicalize 후 재검사). 신뢰하지 않은 폴더에서는 셸 실행을 하지 마십시오.
- **신뢰 확인**: 처음 여는 폴더는 `TrustWorkspaceDialog`로 신뢰 여부를 묻고,
  신뢰한 폴더 목록은 `trusted_workspaces`에 저장됩니다.

---

## 3. 데이터 모델

### 3.1 AppSettings — `src/lib/types/settings.ts`

```ts
export interface AppSettings {
  id: string; // 'singleton'
  openTabs: WorkspaceTab[]; // 프로젝트 DB에만 저장
  activeTabId: string | null; // 프로젝트 DB에만 저장
  theme: ThemeMode;
  language: Locale;
  enabledExtensions: string[];
  trustedWorkspaces: string[];
  lastWorkspaceRoot: string | null;
}
```

### 3.2 저장소 분리: 전역 데이터 vs 프로젝트 데이터

1. **프로젝트 데이터 (`{workspaceRoot}/.app-data/`)**:
   - `app.db`: 해당 폴더의 `items` 예제 테이블 + 탭 상태(`open_tabs`, `active_tab_id`)
   - `logs/`: 런타임 로그, `.gitignore` 자동 생성
2. **전역 데이터** (OS 표준 AppData 디렉터리, `app.db`):
   - 테마·언어·신뢰 폴더·최근 폴더·`last_workspace_root`
3. **동작**: 폴더가 열려 있으면 탭 상태는 프로젝트 DB에만 저장/복원, 나머지는 전역 DB.
   폴더가 없으면 전역 DB가 fallback.

### 3.3 도메인 자리 (테트리스·Laya용으로 비워 둠)

- 템플릿의 예제 도메인(`collections`/`items` 테이블, `extensions` 스캔)은
  제거되었습니다. 새 엔티티는 `src/lib/<도메인>/` +
  `src/components/<도메인>/` + `src/lib/types/<도메인>.ts` 세트로 만들고
  `Docs/Extension-Guide.md` 절차로 탭·패널에 등록하십시오.
- `app_settings.enabled_extensions` 컬럼은 설정 스키마에 남아 있습니다.

---

## 4. Tauri 명령 (Rust)

`src-tauri/src/commands/`:

| 모듈              | 명령                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs_commands`     | `pick_project_folder`, `set_active_workspace`, `ensure_app_dir`, `get_app_paths`, `read_project_folder_tree`, `read_text_file`, `write_text_file`, `create_file`, `create_folder`, `rename_path`, `delete_path`, `list_dir`, `copy_path`, `reveal_in_explorer` |
| `search_commands` | `grep_files`, `find_files`                                                                                                                                                                                                                                     |
| `shell_commands`  | `run_shell`                                                                                                                                                                                                                                                    |

보안 규칙:

- 파일 명령은 항상 워크스페이스 스코프 안에서만 동작합니다.
- **`run_shell`은 항상 실행 전에 사용자에게 명시적 확인을 받습니다.**
  승인 없는 자동 셸 실행 코드를 작성하지 마십시오.

---

## 5. 다국어 (i18n)

- `src/lib/i18n/dictionaries/ko.ts`·`en.ts`에 평탄한 `키: 문구` 사전, ko 폴백.
- `useLanguage()`의 `t('네임스페이스.키', {param})`으로 표시. `<html lang>` 자동 반영.
- 첫 실행 시 `LanguageSelectDialog`가 언어를 묻고, 설정은 DB(`language`)와
  localStorage에 함께 저장됩니다.
- **새 화면/문구를 추가하면 양쪽 사전에 같은 키를 반드시 추가합니다.**
  LLM 프롬프트 본문·DB 스키마 필드명은 번역 대상이 아닙니다.

## 6. 테마

- `design/tokens.json`이 단일 진실 공급원. 자세한 규칙은 `DESIGN.md`.
- `ThemeContext`가 `light | dark | system`을 저장하고 `<html>` 클래스를 토글.
- 컴포넌트는 `dark:` 변형 없이 **시맨틱 토큰만으로** 양쪽 테마를 처리합니다.

## 7. 단축키

`src/hooks/useKeyboardShortcuts.ts`: `Ctrl+N` 새 탭, `Ctrl+W` 탭 닫기,
`Ctrl+B` 사이드바 토글, `Ctrl+Shift+E` 탐색기, `Ctrl+,` 설정.

## 8. 확장점

새 패널·탭·뷰어·설정 페이지·명령을 추가하는 절차는
`Docs/Extension-Guide.md`를 따릅니다.
