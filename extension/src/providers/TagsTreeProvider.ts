import * as vscode from 'vscode';
import { DmsService } from '../services/DmsService';

export class TagsTreeProvider implements vscode.TreeDataProvider<TagTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TagTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<TagTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TagTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(private dmsService: DmsService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TagTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TagTreeItem): Promise<TagTreeItem[]> {
        if (element) {
            return [];
        }

        const tags = await this.dmsService.getTags();
        
        if (tags.length === 0) {
            return [new TagTreeItem('Keine Tags vorhanden', '', true)];
        }
        
        return tags.map(tag => new TagTreeItem(tag, tag));
    }
}

export class TagTreeItem extends vscode.TreeItem {
    constructor(
        label: string, 
        public readonly tag: string,
        private isEmpty: boolean = false
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        
        if (isEmpty) {
            this.iconPath = new vscode.ThemeIcon('info');
            this.description = '';
        } else {
            this.iconPath = new vscode.ThemeIcon('tag');
            this.tooltip = `Tag: ${tag}`;
            this.command = {
                command: 'dms.semanticSearch',
                title: 'Nach Tag suchen',
                arguments: [`tag:${tag}`]
            };
            this.contextValue = 'dms-tag';
        }
    }
}
