import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class WorktreeDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

    private runningWorktrees = new Set<string>();

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (this.runningWorktrees.has(uri.fsPath)) {
            return {
                badge: '●',
                tooltip: 'Claude Code 프롬프트 실행 중',
                color: new vscode.ThemeColor('terminal.ansiGreen')
            };
        }
        return undefined;
    }

    setRunning(worktreePath: string, isRunning: boolean): void {
        if (isRunning) {
            this.runningWorktrees.add(worktreePath);
        } else {
            this.runningWorktrees.delete(worktreePath);
        }
        this._onDidChangeFileDecorations.fire(vscode.Uri.file(worktreePath));
    }

    refresh(): void {
        this._onDidChangeFileDecorations.fire(vscode.Uri.file(''));
    }
}

interface WorktreeInfo {
    path: string;
    branch: string;
    head: string;
    isBare: boolean;
}

export class WorktreeProvider implements vscode.TreeDataProvider<WorktreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WorktreeItem | undefined | null | void> = new vscode.EventEmitter<WorktreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<WorktreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private gitRoot: string | null = null;
    private watcher: vscode.FileSystemWatcher | null = null;
    public decorationProvider: WorktreeDecorationProvider;

    constructor(private context: vscode.ExtensionContext) {
        this.decorationProvider = new WorktreeDecorationProvider();
        this.findGitRoot();
        this.startWatchingClaudeProgress();
    }

    private async findGitRoot(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        try {
            const { stdout } = await execAsync('git rev-parse --show-toplevel', {
                cwd: workspaceFolders[0].uri.fsPath
            });
            this.gitRoot = stdout.trim();
        } catch (error) {
            console.error('Git root를 찾을 수 없습니다:', error);
        }
    }

    private startWatchingClaudeProgress(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // Claude Code 프롬프트 실행 상태 감지
        // .claude/progress 디렉토리에 파일이 생성되면 프롬프트 시작
        // 파일이 삭제되면 프롬프트 종료
        const progressPattern = new vscode.RelativePattern(
            workspaceFolders[0],
            '**/.claude/progress/**'
        );

        this.watcher = vscode.workspace.createFileSystemWatcher(progressPattern);

        this.watcher.onDidCreate(() => this.refresh());
        this.watcher.onDidChange(() => this.refresh());
        this.watcher.onDidDelete(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WorktreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorktreeItem): Promise<WorktreeItem[]> {
        if (!this.gitRoot) {
            await this.findGitRoot();
            if (!this.gitRoot) {
                return [];
            }
        }

        try {
            const worktrees = await this.getWorktrees();
            const currentPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            return worktrees.map(wt => {
                const isRunning = this.isPromptRunning(wt.path);

                // DecorationProvider 업데이트
                this.decorationProvider.setRunning(wt.path, isRunning);

                const dirName = path.basename(wt.path);
                const label = wt.branch || dirName;

                return new WorktreeItem(
                    label,
                    wt.path,
                    wt.branch,
                    dirName,
                    isRunning,
                    currentPath === wt.path
                );
            });
        } catch (error) {
            console.error('Worktree 목록을 가져올 수 없습니다:', error);
            return [];
        }
    }

    private async getWorktrees(): Promise<WorktreeInfo[]> {
        if (!this.gitRoot) {
            return [];
        }

        try {
            const { stdout } = await execAsync('git worktree list --porcelain', {
                cwd: this.gitRoot
            });

            const worktrees: WorktreeInfo[] = [];
            const lines = stdout.trim().split('\n');
            let currentWorktree: Partial<WorktreeInfo> = {};

            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    currentWorktree.path = line.substring(9);
                } else if (line.startsWith('branch ')) {
                    currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
                } else if (line.startsWith('HEAD ')) {
                    currentWorktree.head = line.substring(5);
                } else if (line.startsWith('bare')) {
                    currentWorktree.isBare = true;
                } else if (line === '') {
                    if (currentWorktree.path) {
                        worktrees.push({
                            path: currentWorktree.path,
                            branch: currentWorktree.branch || '',
                            head: currentWorktree.head || '',
                            isBare: currentWorktree.isBare || false
                        });
                    }
                    currentWorktree = {};
                }
            }

            // 마지막 워크트리 추가 (빈 줄로 끝나지 않은 경우)
            if (currentWorktree.path) {
                worktrees.push({
                    path: currentWorktree.path,
                    branch: currentWorktree.branch || '',
                    head: currentWorktree.head || '',
                    isBare: currentWorktree.isBare || false
                });
            }

            // 워크트리 목록이 비어있으면 루트 디렉토리 정보 추가
            if (worktrees.length === 0) {
                const rootBranch = await this.getCurrentBranch();
                worktrees.push({
                    path: this.gitRoot,
                    branch: rootBranch,
                    head: '',
                    isBare: false
                });
            }

            return worktrees;
        } catch (error) {
            console.error('Git worktree list 실행 실패:', error);
            // 에러가 발생해도 루트 디렉토리는 표시
            const rootBranch = await this.getCurrentBranch();
            return [{
                path: this.gitRoot,
                branch: rootBranch,
                head: '',
                isBare: false
            }];
        }
    }

    private async getCurrentBranch(): Promise<string> {
        if (!this.gitRoot) {
            return '';
        }

        try {
            const { stdout } = await execAsync('git branch --show-current', {
                cwd: this.gitRoot
            });
            return stdout.trim();
        } catch (error) {
            console.error('현재 브랜치를 가져올 수 없습니다:', error);
            return '';
        }
    }

    /**
     * 워크트리에서 Claude Code 프롬프트가 실행 중인지 확인
     * .claude/progress 디렉토리에 최근(5초 이내) 수정된 락 파일이 있으면 프롬프트 실행 중
     */
    private isPromptRunning(worktreePath: string): boolean {
        const progressDir = path.join(worktreePath, '.claude', 'progress');

        if (!fs.existsSync(progressDir)) {
            return false;
        }

        try {
            const files = fs.readdirSync(progressDir);
            const now = Date.now();
            const TIMEOUT_MS = 5 * 1000; // 5초

            // 락 파일 중 최근 5초 이내에 수정된 파일이 있는지 확인
            for (const file of files) {
                if (file.endsWith('.lock')) {
                    const filePath = path.join(progressDir, file);
                    const stats = fs.statSync(filePath);
                    const mtime = stats.mtimeMs;

                    // 파일이 5초 이내에 수정되었으면 프롬프트 실행 중
                    if (now - mtime < TIMEOUT_MS) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    async addWorktree(): Promise<void> {
        if (!this.gitRoot) {
            vscode.window.showErrorMessage('Git 저장소를 찾을 수 없습니다.');
            return;
        }

        // 1. 베이스 브랜치 선택
        const branches = await this.getBranches();
        const targetBranch = await vscode.window.showQuickPick(branches, {
            placeHolder: '시작할 브랜치를 선택하세요 (베이스 브랜치)'
        });

        if (!targetBranch) {
            return;
        }

        // 2. 새 브랜치 이름 입력
        const newBranchName = await vscode.window.showInputBox({
            prompt: '생성할 새 브랜치 이름을 입력하세요',
            placeHolder: 'feature/my-feature',
            validateInput: (value) => {
                if (!value) {
                    return '브랜치 이름을 입력해주세요';
                }
                if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
                    return '브랜치 이름은 영문, 숫자, /, _, - 만 사용 가능합니다';
                }
                return null;
            }
        });

        if (!newBranchName) {
            return;
        }

        // 3. .worktrees 디렉토리 경로 생성
        const rootDirName = path.basename(this.gitRoot);
        const worktreesDir = path.join(path.dirname(this.gitRoot), `${rootDirName}.worktrees`);
        const worktreePath = path.join(worktreesDir, newBranchName);

        try {
            // 4. .worktrees 디렉토리가 없으면 생성
            if (!fs.existsSync(worktreesDir)) {
                fs.mkdirSync(worktreesDir, { recursive: true });
            }

            // 5. git worktree add -b <new-branch> <path> <target-branch>
            await execAsync(`git worktree add -b "${newBranchName}" "${worktreePath}" "${targetBranch}"`, {
                cwd: this.gitRoot
            });

            vscode.window.showInformationMessage(`Worktree '${newBranchName}'이(가) 생성되었습니다.`);
            this.refresh();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Worktree 생성 실패: ${error.message}`);
        }
    }

    private async getBranches(): Promise<string[]> {
        if (!this.gitRoot) {
            return [];
        }

        try {
            const { stdout } = await execAsync('git branch -a --format="%(refname:short)"', {
                cwd: this.gitRoot
            });

            return stdout
                .trim()
                .split('\n')
                .map(b => b.trim())
                .filter(b => b && !b.includes('HEAD'));
        } catch (error) {
            console.error('브랜치 목록을 가져올 수 없습니다:', error);
            return [];
        }
    }

    async removeWorktree(item: WorktreeItem): Promise<void> {
        if (!this.gitRoot) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Worktree '${item.label}'을(를) 삭제하시겠습니까?`,
            { modal: true },
            '삭제'
        );

        if (confirm !== '삭제') {
            return;
        }

        try {
            await execAsync(`git worktree remove "${item.path}"`, {
                cwd: this.gitRoot
            });

            vscode.window.showInformationMessage(`Worktree '${item.label}'이(가) 삭제되었습니다.`);
            this.refresh();
        } catch (error: any) {
            if (error.message.includes('contains modified or untracked files')) {
                const forceConfirm = await vscode.window.showWarningMessage(
                    '수정된 파일이 있습니다. 강제로 삭제하시겠습니까?',
                    { modal: true },
                    '강제 삭제'
                );

                if (forceConfirm === '강제 삭제') {
                    try {
                        await execAsync(`git worktree remove --force "${item.path}"`, {
                            cwd: this.gitRoot
                        });
                        vscode.window.showInformationMessage(`Worktree '${item.label}'이(가) 강제 삭제되었습니다.`);
                        this.refresh();
                    } catch (forceError: any) {
                        vscode.window.showErrorMessage(`강제 삭제 실패: ${forceError.message}`);
                    }
                }
            } else {
                vscode.window.showErrorMessage(`Worktree 삭제 실패: ${error.message}`);
            }
        }
    }

    /**
     * 워크트리 경로에서 가장 최근 수정된 워크스페이스 파일을 찾음
     */
    private findWorkspaceFile(worktreePath: string): string | null {
        const vscodeDir = path.join(worktreePath, '.vscode');

        if (!fs.existsSync(vscodeDir)) {
            return null;
        }

        try {
            const files = fs.readdirSync(vscodeDir);
            const workspaceFiles = files.filter(f => f.endsWith('.code-workspace'));

            if (workspaceFiles.length === 0) {
                return null;
            }

            // 가장 최근 수정된 파일 찾기
            let latestFile: string | null = null;
            let latestMtime = 0;

            for (const file of workspaceFiles) {
                const filePath = path.join(vscodeDir, file);
                const stats = fs.statSync(filePath);
                if (stats.mtimeMs > latestMtime) {
                    latestMtime = stats.mtimeMs;
                    latestFile = filePath;
                }
            }

            return latestFile;
        } catch (error) {
            return null;
        }
    }

    async openInNewWindow(item: WorktreeItem): Promise<void> {
        const workspaceFile = this.findWorkspaceFile(item.path);
        const uri = workspaceFile
            ? vscode.Uri.file(workspaceFile)
            : vscode.Uri.file(item.path);
        await vscode.commands.executeCommand('vscode.openFolder', uri, true);
    }

    async openInCurrentWindow(item: WorktreeItem): Promise<void> {
        const workspaceFile = this.findWorkspaceFile(item.path);
        const uri = workspaceFile
            ? vscode.Uri.file(workspaceFile)
            : vscode.Uri.file(item.path);
        await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }

    dispose(): void {
        if (this.watcher) {
            this.watcher.dispose();
        }
    }
}

class WorktreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly path: string,
        public readonly branch: string,
        private readonly dirName: string,
        private readonly isWorking: boolean,
        private readonly isCurrent: boolean
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `${this.branch}\n${this.path}${this.isCurrent ? '\n(현재 워크트리)' : ''}`;
        this.description = this.dirName;
        this.contextValue = 'worktree';
        this.resourceUri = vscode.Uri.file(this.path);

        // 아이콘 우선순위: 프롬프트 실행 중 > 현재 워크트리 > 일반 폴더
        if (this.isWorking) {
            this.iconPath = new vscode.ThemeIcon(
                'loading~spin',
                new vscode.ThemeColor('charts.green')
            );
            this.tooltip += '\n🔄 Claude Code 프롬프트 실행 중';
        } else if (this.isCurrent) {
            this.iconPath = new vscode.ThemeIcon(
                'check',
                new vscode.ThemeColor('charts.blue')
            );
        } else {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}
