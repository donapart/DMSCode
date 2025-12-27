import * as vscode from 'vscode';
import { DmsService, DmsDocument } from '../services/DmsService';

interface DashboardData {
    totalDocs: number;
    recentDocs: DmsDocument[];
    tags: string[];
    typeStats: Record<string, number>;
}

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, dmsService: DmsService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dmsDashboard',
            'DMS Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, dmsService);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly dmsService: DmsService
    ) {
        this._panel = panel;
        void this._initialize();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openDocument':
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path));
                        break;
                    case 'search':
                        vscode.commands.executeCommand('dms.semanticSearch');
                        break;
                    case 'scan':
                        vscode.commands.executeCommand('dms.scanDocument');
                        break;
                    case 'refresh':
                        this._update();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _initialize(): Promise<void> {
        await this._update();
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.title = 'DMS Dashboard';
        
        const documents = await this.dmsService.getDocuments();
        const recentDocs = await this.dmsService.getRecentDocuments(5);
        const tags = await this.dmsService.getTags();
        
        this._panel.webview.html = this._getHtmlForWebview(webview, {
            totalDocs: documents.length,
            recentDocs,
            tags,
            typeStats: this._getTypeStats(documents)
        });
    }

    private _getTypeStats(documents: DmsDocument[]): Record<string, number> {
        const stats: Record<string, number> = {};
        for (const doc of documents) {
            stats[doc.type] = (stats[doc.type] || 0) + 1;
        }
        return stats;
    }

    private _getHtmlForWebview(webview: vscode.Webview, data: DashboardData): string {
        return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DMS Dashboard</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-widget-border);
            --card-bg: var(--vscode-editorWidget-background);
            --accent: var(--vscode-button-background);
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background: var(--bg);
            color: var(--fg);
        }
        h1 {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 24px;
        }
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
        }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }
        .card h2 {
            margin: 0 0 12px 0;
            font-size: 14px;
            text-transform: uppercase;
            opacity: 0.7;
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: var(--accent);
        }
        .stat-label {
            font-size: 12px;
            opacity: 0.7;
        }
        .recent-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .recent-list li {
            padding: 8px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .recent-list li:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .tag-cloud {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .tag {
            background: var(--accent);
            color: var(--vscode-button-foreground);
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
        }
        .type-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .type-bar .bar {
            flex: 1;
            height: 8px;
            background: var(--border);
            border-radius: 4px;
            overflow: hidden;
        }
        .type-bar .bar-fill {
            height: 100%;
            background: var(--accent);
        }
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <h1>📁 DMS Dashboard</h1>
    
    <div class="dashboard-grid">
        <div class="card">
            <h2>📊 Übersicht</h2>
            <div class="stat-value">${data.totalDocs}</div>
            <div class="stat-label">Dokumente gesamt</div>
            <div class="actions">
                <button onclick="scan()">📷 Scannen</button>
                <button onclick="search()">🔍 Suchen</button>
            </div>
        </div>
        
        <div class="card">
            <h2>🕐 Zuletzt verwendet</h2>
            <ul class="recent-list">
                ${data.recentDocs.map((doc: DmsDocument) => `
                    <li onclick="openDoc('${doc.path.replaceAll('\\', '\\\\')}')">
                        📄 ${doc.name}
                    </li>
                `).join('')}
            </ul>
        </div>
        
        <div class="card">
            <h2>🏷️ Tags</h2>
            <div class="tag-cloud">
                ${data.tags.length > 0 
                    ? data.tags.map((tag: string) => `<span class="tag">${tag}</span>`).join('')
                    : '<span style="opacity:0.5">Keine Tags vorhanden</span>'}
            </div>
        </div>
        
        <div class="card">
            <h2>📁 Dokumenttypen</h2>
            ${Object.entries(data.typeStats).map(([type, count]) => `
                <div class="type-bar">
                    <span style="width:50px">${type.toUpperCase()}</span>
                    <div class="bar">
                        <div class="bar-fill" style="width: ${(count / data.totalDocs * 100)}%"></div>
                    </div>
                    <span>${count}</span>
                </div>
            `).join('')}
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function openDoc(path) {
            vscode.postMessage({ command: 'openDocument', path });
        }
        
        function search() {
            vscode.postMessage({ command: 'search' });
        }
        
        function scan() {
            vscode.postMessage({ command: 'scan' });
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
