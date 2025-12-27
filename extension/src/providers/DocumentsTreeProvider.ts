import * as vscode from 'vscode';
import * as path from 'path';
import { DmsService, DmsDocument } from '../services/DmsService';

export class DocumentsTreeProvider implements vscode.TreeDataProvider<DocumentTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DocumentTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<DocumentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DocumentTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(private dmsService: DmsService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DocumentTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DocumentTreeItem): Promise<DocumentTreeItem[]> {
        if (element) {
            // Children of a folder
            return [];
        }

        // Root level - get all documents
        const documents = await this.dmsService.getDocuments();
        return documents.map(doc => new DocumentTreeItem(doc));
    }
}

export class DocumentTreeItem extends vscode.TreeItem {
    constructor(public readonly document: DmsDocument) {
        super(document.name, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = `${document.name}\nPfad: ${document.path}\nTyp: ${document.type}`;
        this.description = document.tags.join(', ') || document.type;
        
        // Icon based on file type
        this.iconPath = this.getIconForType(document.type);
        
        // Command to open the document
        this.command = {
            command: 'vscode.open',
            title: 'Dokument öffnen',
            arguments: [vscode.Uri.file(document.path)]
        };
        
        // Context value for context menu
        this.contextValue = `dms-document-${document.type}`;
    }

    private getIconForType(type: string): vscode.ThemeIcon {
        switch (type.toLowerCase()) {
            case 'pdf':
                return new vscode.ThemeIcon('file-pdf');
            case 'docx':
            case 'doc':
                return new vscode.ThemeIcon('file-text');
            case 'txt':
            case 'md':
                return new vscode.ThemeIcon('markdown');
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'tiff':
                return new vscode.ThemeIcon('file-media');
            case 'epub':
                return new vscode.ThemeIcon('book');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
