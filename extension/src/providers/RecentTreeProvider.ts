import * as vscode from 'vscode';
import { DmsService, DmsDocument } from '../services/DmsService';

export class RecentTreeProvider implements vscode.TreeDataProvider<RecentTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RecentTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<RecentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<RecentTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(private dmsService: DmsService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: RecentTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RecentTreeItem): Promise<RecentTreeItem[]> {
        if (element) {
            return [];
        }

        const recentDocs = await this.dmsService.getRecentDocuments(10);
        
        if (recentDocs.length === 0) {
            return [new RecentTreeItem(null, 'Keine Dokumente vorhanden')];
        }
        
        return recentDocs.map(doc => new RecentTreeItem(doc));
    }
}

export class RecentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly document: DmsDocument | null,
        emptyMessage?: string
    ) {
        super(
            document?.name || emptyMessage || '',
            vscode.TreeItemCollapsibleState.None
        );
        
        if (document) {
            this.tooltip = `${document.name}\nZuletzt geändert: ${document.modifiedAt.toLocaleString('de-DE')}`;
            this.description = this.getRelativeTime(document.modifiedAt);
            this.iconPath = new vscode.ThemeIcon('history');
            
            this.command = {
                command: 'vscode.open',
                title: 'Dokument öffnen',
                arguments: [vscode.Uri.file(document.path)]
            };
            this.contextValue = 'dms-recent';
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }

    private getRelativeTime(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (minutes < 1) return 'gerade eben';
        if (minutes < 60) return `vor ${minutes} Min.`;
        if (hours < 24) return `vor ${hours} Std.`;
        if (days < 7) return `vor ${days} Tagen`;
        return date.toLocaleDateString('de-DE');
    }
}
