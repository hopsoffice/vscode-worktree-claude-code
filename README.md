# Git Worktree Manager with Claude Code

Git worktree를 VSCode 사이드바에서 쉽게 관리하고, Claude Code 작업 상태를 시각적으로 확인할 수 있는 VSCode 확장입니다.

## 기능

### Worktree 관리
- **Worktree 추가**: 원하는 브랜치에서 새로운 worktree 생성
- **Worktree 삭제**: 기존 worktree 제거 (수정된 파일이 있을 경우 강제 삭제 옵션 제공)
- **새 창에서 열기**: 선택한 worktree를 새로운 VSCode 창에서 열기
- **현재 창에서 열기**: 선택한 worktree를 현재 VSCode 창에서 열기

### Claude Code 작업 상태 표시
- `.claude/progress/` 디렉토리를 모니터링하여 해당 worktree에서 Claude Code가 작업 중인지 확인
- 작업 중인 worktree는 ⚡ 이모지와 함께 표시되며, 아이콘 색상이 녹색으로 변경됨
- 실시간으로 작업 상태 업데이트

## 설치 및 사용

### 사전 요구사항
- VSCode 1.85.0 이상
- Git이 설치되어 있어야 함
- Git 저장소에서 사용

### 설치
```bash
npm install
npm run compile
```

### 개발 모드 실행
1. VSCode에서 이 프로젝트 열기
2. F5를 눌러 확장 개발 호스트 실행
3. 새로 열린 VSCode 창에서 Git 저장소를 열면 사이드바에 Worktree 아이콘이 표시됨

### Claude Code Hook 설정
Claude Code가 작업 상태를 표시하려면 각 worktree의 `.claude/hooks.json` 파일을 복사해야 합니다:

```bash
cp .claude/hooks.json <worktree-path>/.claude/
```

또는 전역 Claude 설정에 hook을 추가할 수도 있습니다.

## 사용법

1. 사이드바에서 Git Worktree 아이콘 클릭
2. `+` 버튼으로 새 worktree 추가
   - 브랜치 선택
   - Worktree 디렉토리 이름 입력
3. Worktree 항목을 클릭하거나 우클릭하여 다양한 작업 수행
   - 새 창에서 열기
   - 현재 창에서 열기
   - 삭제

## 라이선스
MIT
