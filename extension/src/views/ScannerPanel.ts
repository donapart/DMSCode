import * as vscode from 'vscode';
import { DmsService } from '../services/DmsService';

export class ScannerPanel {
    public static currentPanel: ScannerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, dmsService: DmsService) {
        const column = vscode.ViewColumn.Beside;

        if (ScannerPanel.currentPanel) {
            ScannerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dmsScanner',
            'DMS Scanner & OCR',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ScannerPanel.currentPanel = new ScannerPanel(panel, extensionUri, dmsService);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private extensionUri: vscode.Uri,
        private dmsService: DmsService
    ) {
        this._panel = panel;
        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'selectFile':
                        const files = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            filters: {
                                'Bilder & PDFs': ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp']
                            }
                        });
                        if (files && files.length > 0) {
                            this._panel.webview.postMessage({ 
                                command: 'fileSelected', 
                                path: files[0].fsPath 
                            });
                        }
                        break;
                        
                    case 'runOcr':
                        try {
                            const text = await this.dmsService.runOcr(vscode.Uri.file(message.path));
                            this._panel.webview.postMessage({ 
                                command: 'ocrResult', 
                                text 
                            });
                        } catch (error) {
                            this._panel.webview.postMessage({ 
                                command: 'ocrError', 
                                error: String(error) 
                            });
                        }
                        break;
                        
                    case 'saveText':
                        const doc = await vscode.workspace.openTextDocument({
                            content: message.text,
                            language: 'plaintext'
                        });
                        await vscode.window.showTextDocument(doc);
                        break;
                }
            },
            null,
            this._disposables
        );
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
    <title>DMS Scanner & OCR</title>
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
        }
        .scanner-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            height: calc(100vh - 120px);
        }
        .panel {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            display: flex;
            flex-direction: column;
        }
        .panel h2 {
            margin: 0 0 16px 0;
            font-size: 14px;
        }
        .drop-zone {
            flex: 1;
            border: 2px dashed var(--border);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .drop-zone:hover, .drop-zone.dragover {
            border-color: var(--accent);
            background: rgba(0, 120, 212, 0.1);
        }
        .drop-zone .icon {
            font-size: 48px;
            opacity: 0.5;
        }
        .preview {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .preview img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        .ocr-output {
            flex: 1;
            background: var(--vscode-input-background);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 12px;
            font-family: monospace;
            font-size: 13px;
            overflow: auto;
            white-space: pre-wrap;
        }
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 12px;
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
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .status {
            font-size: 12px;
            opacity: 0.7;
            margin-top: 8px;
        }
        .progress {
            width: 100%;
            height: 4px;
            background: var(--border);
            border-radius: 2px;
            margin-top: 12px;
            overflow: hidden;
            display: none;
        }
        .progress.active {
            display: block;
        }
        .progress-bar {
            height: 100%;
            background: var(--accent);
            animation: progress 2s ease-in-out infinite;
        }
        @keyframes progress {
            0% { width: 0%; }
            50% { width: 100%; }
            100% { width: 0%; }
        }
    </style>
</head>
<body>
    <h1>📷 Scanner & OCR</h1>
    
    <div class="scanner-container">
        <div class="panel">
            <h2>📄 Dokument</h2>
            <div class="drop-zone" id="dropZone" onclick="selectFile()">
                <div class="icon">📁</div>
                <div>Klicken oder Datei hierher ziehen</div>
                <div style="font-size:12px;opacity:0.5">PDF, PNG, JPG, TIFF</div>
            </div>
            <div class="preview" id="preview" style="display:none"></div>
            <div class="status" id="fileStatus"></div>
            <div class="actions">
                <button onclick="selectFile()">📁 Datei wählen</button>
                <button id="ocrBtn" onclick="runOcr()" disabled>🔍 OCR starten</button>
            </div>
            <div class="progress" id="progress">
                <div class="progress-bar"></div>
            </div>
        </div>
        
        <div class="panel">
            <h2>📝 Erkannter Text</h2>
            <div class="ocr-output" id="ocrOutput">
                Wählen Sie ein Dokument und starten Sie die OCR-Erkennung...
            </div>
            <div class="actions">
                <button id="copyBtn" onclick="copyText()" disabled>📋 Kopieren</button>
                <button id="saveBtn" onclick="saveText()" disabled>💾 Als Datei speichern</button>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let currentFile = null;
        let ocrText = '';
        
        function selectFile() {
            vscode.postMessage({ command: 'selectFile' });
        }
        
        function runOcr() {
            if (!currentFile) return;
            
            document.getElementById('progress').classList.add('active');
            document.getElementById('ocrBtn').disabled = true;
            document.getElementById('ocrOutput').textContent = 'OCR wird ausgeführt...';
            
            vscode.postMessage({ command: 'runOcr', path: currentFile });
        }
        
        function copyText() {
            navigator.clipboard.writeText(ocrText);
        }
        
        function saveText() {
            vscode.postMessage({ command: 'saveText', text: ocrText });
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'fileSelected':
                    currentFile = message.path;
                    document.getElementById('dropZone').style.display = 'none';
                    document.getElementById('preview').style.display = 'flex';
                    document.getElementById('preview').innerHTML = 
                        '<div style="text-align:center"><div style="font-size:64px">📄</div><div>' + 
                        message.path.split('\\\\').pop() + '</div></div>';
                    document.getElementById('fileStatus').textContent = 'Datei geladen: ' + message.path;
                    document.getElementById('ocrBtn').disabled = false;
                    break;
                    
                case 'ocrResult':
                    ocrText = message.text;
                    document.getElementById('ocrOutput').textContent = message.text || 'Kein Text erkannt';
                    document.getElementById('progress').classList.remove('active');
                    document.getElementById('ocrBtn').disabled = false;
                    document.getElementById('copyBtn').disabled = false;
                    document.getElementById('saveBtn').disabled = false;
                    break;
                    
                case 'ocrError':
                    document.getElementById('ocrOutput').textContent = 'Fehler: ' + message.error;
                    document.getElementById('progress').classList.remove('active');
                    document.getElementById('ocrBtn').disabled = false;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        ScannerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
