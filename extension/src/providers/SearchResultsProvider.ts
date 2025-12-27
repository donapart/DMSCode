import * as vscode from 'vscode';
import { DmsService, SearchResult } from '../services/DmsService';

export class SearchResultsProvider implements vscode.TreeDataProvider<SearchResultItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SearchResultItem | undefined | null | void> = 
        new vscode.EventEmitter<SearchResultItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SearchResultItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private results: SearchResult[] = [];

    constructor(private dmsService: DmsService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setResults(results: SearchResult[]): void {
        this.results = results;
        this.refresh();
    }

    getTreeItem(element: SearchResultItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SearchResultItem): Promise<SearchResultItem[]> {
        if (element) {
            return [];
        }

        if (this.results.length === 0) {
            return [new SearchResultItem(null, 'Keine Suchergebnisse')];
        }
        
        return this.results.map(result => new SearchResultItem(result));
    }
}

export class SearchResultItem extends vscode.TreeItem {
    constructor(
        public readonly result: SearchResult | null,
        emptyMessage?: string
    ) {
        super(
            result?.document.name || emptyMessage || '',
            vscode.TreeItemCollapsibleState.None
        );
        
        if (result) {
            this.tooltip = `${result.document.name}\nRelevanz: ${(result.score * 100).toFixed(1)}%\n${result.snippet}`;
            this.description = `${(result.score * 100).toFixed(0)}%`;
            this.iconPath = new vscode.ThemeIcon('search');
            
            this.command = {
                command: 'vscode.open',
                title: 'Dokument öffnen',
                arguments: [vscode.Uri.file(result.document.path)]
            };
            this.contextValue = 'dms-search-result';
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}
