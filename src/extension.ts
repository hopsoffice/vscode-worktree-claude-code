import * as vscode from 'vscode';
import { WorktreeProvider } from './worktreeProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Git Worktree Manager 활성화됨');

    const worktreeProvider = new WorktreeProvider(context);

    // createTreeView를 사용하여 더블클릭 이벤트 처리
    const treeView = vscode.window.createTreeView('worktreeExplorer', {
        treeDataProvider: worktreeProvider
    });

    // FileDecorationProvider 등록 (배경색/배지 표시용)
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(worktreeProvider.decorationProvider)
    );

    context.subscriptions.push(treeView);

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree.refresh', () => {
            worktreeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree.add', async () => {
            await worktreeProvider.addWorktree();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree.remove', async (item) => {
            await worktreeProvider.removeWorktree(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree.openInNewWindow', async (item) => {
            await worktreeProvider.openInNewWindow(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree.openInCurrentWindow', async (item) => {
            await worktreeProvider.openInCurrentWindow(item);
        })
    );
}

export function deactivate() {}
