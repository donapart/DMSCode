import * as vscode from 'vscode';
import { DmsService, SearchResult } from '../services/DmsService';

export class SemanticSearchPanel {
    public static currentPanel: SemanticSearchPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, dmsService: DmsService, initialQuery?: string) {
        const column = vscode.ViewColumn.Beside;

        if (SemanticSearchPanel.currentPanel) {
            SemanticSearchPanel.currentPanel._panel.reveal(column);
            if (initialQuery) {
                SemanticSearchPanel.currentPanel.search(initialQuery);
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dmsSearch',
            'DMS Semantische Suche',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SemanticSearchPanel.currentPanel = new SemanticSearchPanel(panel, extensionUri, dmsService, initialQuery);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private extensionUri: vscode.Uri,
        private dmsService: DmsService,
        initialQuery?: string
    ) {
        this._panel = panel;
        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'search':
                        await this.search(message.query);
                        break;
                    case 'openDocument':
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path));
                        break;
                }
            },
            null,
            this._disposables
        );

        if (initialQuery) {
            this.search(initialQuery);
        }
    }

    private async search(query: string) {
        this._panel.webview.postMessage({ command: 'searching' });
        
        try {
            const results = await this.dmsService.semanticSearch(query);
            this._panel.webview.postMessage({ 
                command: 'results', 
                results,
                query 
            });
        } catch (error) {
            this._panel.webview.postMessage({ 
                command: 'error', 
                error: String(error) 
            });
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Semantische Suche</title>
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
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .search-box {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .search-box input {
            flex: 1;
            background: var(--vscode-input-background);
            border: 1px solid var(--border);
            color: var(--fg);
            padding: 10px 14px;
            border-radius: 6px;
            font-size: 14px;
        }
        .search-box input:focus {
            outline: none;
            border-color: var(--accent);
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .results-info {
            font-size: 13px;
            opacity: 0.7;
            margin-bottom: 16px;
        }
        .result-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .result-card:hover {
            border-color: var(--accent);
            transform: translateY(-2px);
        }
        .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .result-title {
            font-weight: 600;
            font-size: 14px;
        }
        .result-score {
            background: var(--accent);
            color: var(--vscode-button-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
        }
        .result-snippet {
            font-size: 13px;
            opacity: 0.8;
            line-height: 1.5;
        }
        .result-meta {
            display: flex;
            gap: 16px;
            margin-top: 8px;
            font-size: 11px;
            opacity: 0.6;
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
        }
        .loading::after {
            content: '';
            width: 24px;
            height: 24px;
            border: 2px solid var(--border);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .no-results {
            text-align: center;
            padding: 40px;
            opacity: 0.5;
        }
        .highlight {
            background: rgba(255, 200, 0, 0.3);
            padding: 1px 2px;
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <h1>🔍 Semantische Suche</h1>
    
    <div class="search-box">
        <input type="text" id="searchInput" placeholder="Suchbegriff eingeben... (z.B. 'Rechnungen von 2024')" 
               onkeypress="if(event.key==='Enter')search()">
        <button onclick="search()">Suchen</button>
    </div>
    
    <div id="resultsInfo" class="results-info"></div>
    <div id="results"></div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function search() {
            const query = document.getElementById('searchInput').value;
            if (query.trim()) {
                vscode.postMessage({ command: 'search', query });
            }
        }
        
        function openDoc(path) {
            vscode.postMessage({ command: 'openDocument', path });
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            const resultsDiv = document.getElementById('results');
            const infoDiv = document.getElementById('resultsInfo');
            
            switch (message.command) {
                case 'searching':
                    resultsDiv.innerHTML = '<div class="loading"></div>';
                    infoDiv.textContent = 'Suche läuft...';
                    break;
                    
                case 'results':
                    const results = message.results;
                    infoDiv.textContent = results.length + ' Ergebnis(se) für "' + message.query + '"';
                    
                    if (results.length === 0) {
                        resultsDiv.innerHTML = '<div class="no-results">Keine Ergebnisse gefunden</div>';
                    } else {
                        resultsDiv.innerHTML = results.map(r => \`
                            <div class="result-card" onclick="openDoc('\${r.document.path.replace(/\\\\/g, '\\\\\\\\')}')">
                                <div class="result-header">
                                    <span class="result-title">📄 \${r.document.name}</span>
                                    <span class="result-score">\${(r.score * 100).toFixed(0)}% Relevanz</span>
                                </div>
                                <div class="result-snippet">\${r.snippet}</div>
                                <div class="result-meta">
                                    <span>📁 \${r.document.type.toUpperCase()}</span>
                                    <span>🏷️ \${r.document.tags.join(', ') || 'Keine Tags'}</span>
                                </div>
                            </div>
                        \`).join('');
                    }
                    break;
                    
                case 'error':
                    resultsDiv.innerHTML = '<div class="no-results">Fehler: ' + message.error + '</div>';
                    infoDiv.textContent = '';
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        SemanticSearchPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
