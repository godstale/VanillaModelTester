# 확장 가이드 (Extension Guide)

> 탭·패널·뷰어·설정·명령·문구를 추가하는 정석 절차입니다.

## 1. 새 탭 종류 추가하기

탭은 `id` 규칙 + 타입 등록 + 콘텐츠 분기, 세 군데를 함께 건드립니다.

1. `src/lib/types/workspaceTab.ts`의 `WorkspaceTabType`에 `'my-tab'` 추가.
2. `src/components/workspace/CenterWorkspace.tsx`:
   - `TAB_ICONS`에 아이콘 매핑 추가.
   - `renderTabContent`에 `case 'my-tab': return <MyTab tab={tab} />;` 추가.
3. 여는 쪽에서는 **멱등 id**를 씁니다: `openTab({ id: 'my-tab:<entityId>', type: 'my-tab', title, meta: { entityId } })`.
4. 탭 상태는 DB에 JSON으로 저장되므로, `meta`에는 **문자열·숫자 같은 직렬화 가능한 값만** 넣습니다.
5. 등록을 빠뜨리면 `TabPlaceholder`가 표시됩니다(안전 폴백).

## 2. 새 사이드 패널 추가하기

1. `SidePanelView`에 `'my-panel'` 추가 (`workspaceTab.ts`).
2. `ActivityBar.tsx`의 `ITEMS`에 `{ view: 'my-panel', icon, labelKey }` 추가.
3. `SidePanel.tsx`에 `case 'my-panel': return <MyPanel />;` 추가.
4. `ko.ts`·`en.ts`에 `activityBar.myPanel` 문구 추가.
5. 폴더가 필요 없는 패널이면 `ActivityBar`의 비활성화 조건을 확인하세요
   (기본: 폴더 없이 `explorer`만 활성).

## 3. 새 뷰어 추가하기 (파일 종류별)

1. `FileTree.tsx`의 `handleNodeClick` 분기(현재: 이미지→`image-viewer`, 그 외→`editor`)에 확장자 조건을 추가합니다.
2. `WorkspaceTabType` + `CenterWorkspace`에 타입·아이콘·분기 등록 (§1과 동일).
3. 읽기 전용이면 `CodeViewer`를 재사용하고, 편집이면 `EditorTab`의 자동 저장 패턴
   (`read_text_file` → 편집 → 500ms 디바운스 `write_text_file`)을 복사하세요.

## 4. 새 설정 페이지 추가하기

1. `src/pages/Settings/SettingsXxx.tsx` 작성 (문구는 `settingsXxx.*` 네임스페이스).
2. `SettingsLayout.tsx`의 `NAV_ITEMS`에 `{ path: '/settings/xxx', labelKey, icon }` 추가.
3. `App.tsx`의 `/settings` 자식 `<Route path="xxx" element={<SettingsXxx />} />` 추가.
4. 전역 설정값이면 `AppSettings` + `app_settings` 테이블 + `settingsRepo`에 필드를
   추가하고, `SettingsContext.updateSettings`로 저장합니다.

## 5. 새 Tauri 명령 추가하기

1. `src-tauri/src/commands/`에 모듈을 추가하거나 기존 모듈에 `#[tauri::command]` 함수를 추가합니다.
2. `lib.rs`의 `invoke_handler![...]` 목록에 등록합니다.
3. 필요한 권한만 `capabilities/default.json`에 추가합니다.
4. 프런트에서는 `invoke('<command>', { ... })`로 호출합니다.
5. 파일·셸 명령은 **워크스페이스 스코프 검증**(`resolve_and_verify_workspace_path` 패턴)을
   그대로 따르고, 셸 실행은 항상 사용자 확인을 먼저 받습니다.

## 6. DB 테이블 추가하기

1. `src/lib/db/migrations/0001_init.sql`에 `CREATE TABLE` 추가.
2. 같은 문장을 `src/lib/db/client.ts`의 `MIGRATION_STATEMENTS`에 추가.
3. `MemorySqlFallback`의 `execute`/`select`에 해당 테이블 분기를 추가
   (테스트·웹 프리뷰용. 패턴은 `items` 분기를 복사).
4. `src/lib/db/repositories/<도메인>Repo.ts`에 CRUD 작성.

## 7. 문구(i18n) 추가하기

1. `ko.ts`에 `'네임스페이스.키': '문구'` 추가.
2. `en.ts`에 같은 키 추가 (타입이 `Dict`를 강제하므로 빠뜨리면 컴파일 에러).
3. `t('네임스페이스.키')`로 사용. `{param}` 치환은 `t('키', { param })`.

## 8. 예제 도메인 제거 상태

`collections`·`extensions` 예제와 디자인 쇼케이스(`/design`)는 이미 제거되어
있습니다(최소 셸만 유지). 앞으로 새 도메인을 없앨 때는 §1·§2의 역순으로
(등록 해제 → 사전 키 제거 → 파일 삭제 → 관련 테이블 제거) 정리합니다.
