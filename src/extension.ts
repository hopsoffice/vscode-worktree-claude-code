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

    // 더블클릭 감지를 위한 타이머
    let lastClickTime = 0;
    let lastClickedItem: any = null;
    const DOUBLE_CLICK_THRESHOLD = 300; // 300ms

    treeView.onDidChangeSelection(e => {
        if (e.selection.length === 0) {
            return;
        }

        const currentTime = Date.now();
        const item = e.selection[0];

        if (lastClickedItem === item && currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
            // 더블클릭 감지
            worktreeProvider.openInNewWindow(item);
            lastClickTime = 0;
            lastClickedItem = null;
        } else {
            // 첫 번째 클릭
            lastClickTime = currentTime;
            lastClickedItem = item;
        }
    });

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
