import * as vscode from 'vscode';
import { DmsService } from '../services/DmsService';

export class SpeechPanel {
    public static currentPanel: SpeechPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, dmsService: DmsService) {
        const column = vscode.ViewColumn.Beside;

        if (SpeechPanel.currentPanel) {
            SpeechPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dmsSpeech',
            'DMS Spracheingabe',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SpeechPanel.currentPanel = new SpeechPanel(panel, extensionUri, dmsService);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly dmsService: DmsService
    ) {
        this._panel = panel;
        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'insertText':
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            editor.edit(editBuilder => {
                                editBuilder.insert(editor.selection.active, message.text);
                            });
                        } else {
                            // Open new document with text
                            const doc = await vscode.workspace.openTextDocument({
                                content: message.text,
                                language: 'plaintext'
                            });
                            await vscode.window.showTextDocument(doc);
                        }
                        vscode.window.showInformationMessage('Text eingefügt!');
                        break;
                        
                    case 'copyText':
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Text in Zwischenablage kopiert!');
                        break;
                        
                    case 'speakText':
                        try {
                            await this.dmsService.textToSpeech(message.text);
                        } catch (error) {
                            this._panel.webview.postMessage({ 
                                command: 'ttsError', 
                                error: String(error) 
                            });
                        }
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
    <title>Spracheingabe & Sprachausgabe</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-widget-border);
            --card-bg: var(--vscode-editorWidget-background);
            --accent: var(--vscode-button-background);
            --error: #f44336;
            --success: #4CAF50;
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
            margin-bottom: 20px;
        }
        .container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            height: calc(100vh - 120px);
        }
        .panel {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
            display: flex;
            flex-direction: column;
        }
        .panel h2 {
            margin: 0 0 16px 0;
            font-size: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .mic-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 20px;
        }
        .mic-button {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: var(--accent);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
            transition: all 0.3s;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .mic-button:hover {
            transform: scale(1.05);
        }
        .mic-button.recording {
            background: var(--error);
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.5); }
            50% { box-shadow: 0 0 0 20px rgba(244, 67, 54, 0); }
        }
        .status {
            font-size: 14px;
            text-align: center;
        }
        .status.error {
            color: var(--error);
        }
        .status.success {
            color: var(--success);
        }
        .visualizer {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            height: 40px;
        }
        .visualizer-bar {
            width: 4px;
            background: var(--accent);
            border-radius: 2px;
            transition: height 0.1s;
        }
        .text-output {
            flex: 1;
            background: var(--vscode-input-background);
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 12px;
            font-family: inherit;
            font-size: 14px;
            resize: none;
            color: var(--fg);
            line-height: 1.6;
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
            display: flex;
            align-items: center;
            gap: 6px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .language-select {
            background: var(--vscode-input-background);
            border: 1px solid var(--border);
            color: var(--fg);
            padding: 8px;
            border-radius: 4px;
            font-size: 13px;
        }
        .settings {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
            align-items: center;
        }
        .interim-text {
            font-style: italic;
            opacity: 0.6;
        }
        .not-supported {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
        }
        .not-supported a {
            color: var(--accent);
        }
    </style>
</head>
<body>
    <h1>🎤 Spracheingabe & Sprachausgabe</h1>
    
    <div class="container">
        <div class="panel">
            <h2>🎙️ Speech-to-Text (STT)</h2>
            
            <div id="sttContent">
                <div class="settings">
                    <label>Sprache:</label>
                    <select class="language-select" id="language" onchange="updateLanguage()">
                        <option value="de-DE">🇩🇪 Deutsch</option>
                        <option value="en-US">🇺🇸 English (US)</option>
                        <option value="en-GB">🇬🇧 English (UK)</option>
                        <option value="fr-FR">🇫🇷 Français</option>
                        <option value="es-ES">🇪🇸 Español</option>
                        <option value="it-IT">🇮🇹 Italiano</option>
                    </select>
                </div>
                
                <div class="mic-container">
                    <button class="mic-button" id="micButton" onclick="toggleRecording()">
                        🎤
                    </button>
                    <div class="visualizer" id="visualizer">
                        ${Array(10).fill(0).map(() => '<div class="visualizer-bar" style="height: 5px;"></div>').join('')}
                    </div>
                    <div class="status" id="status">Klicken zum Starten</div>
                </div>
            </div>
            
            <div id="notSupported" class="not-supported" style="display: none;">
                <p>⚠️ Die Web Speech API wird in diesem Kontext nicht unterstützt.</p>
                <p>Bitte nutzen Sie einen Browser mit Speech Recognition Unterstützung.</p>
                <p><a href="https://caniuse.com/speech-recognition" target="_blank">Mehr Infos</a></p>
            </div>
        </div>
        
        <div class="panel">
            <h2>📝 Erkannter Text</h2>
            <textarea class="text-output" id="textOutput" placeholder="Erkannter Text erscheint hier..."></textarea>
            <div class="actions">
                <button onclick="insertText()" id="insertBtn" disabled>
                    📥 In Editor einfügen
                </button>
                <button onclick="copyText()" id="copyBtn" disabled>
                    📋 Kopieren
                </button>
                <button onclick="speakText()" id="speakBtn" disabled>
                    🔊 Vorlesen (TTS)
                </button>
                <button onclick="clearText()">
                    🗑️ Löschen
                </button>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let recognition = null;
        let isRecording = false;
        let finalTranscript = '';
        
        // Check for Speech Recognition support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            document.getElementById('sttContent').style.display = 'none';
            document.getElementById('notSupported').style.display = 'block';
        } else {
            initSpeechRecognition();
        }
        
        function initSpeechRecognition() {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'de-DE';
            
            recognition.onstart = () => {
                isRecording = true;
                document.getElementById('micButton').classList.add('recording');
                document.getElementById('status').textContent = 'Aufnahme läuft...';
                document.getElementById('status').className = 'status';
                animateVisualizer();
            };
            
            recognition.onend = () => {
                isRecording = false;
                document.getElementById('micButton').classList.remove('recording');
                document.getElementById('status').textContent = 'Aufnahme beendet';
                stopVisualizer();
            };
            
            recognition.onresult = (event) => {
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                const output = document.getElementById('textOutput');
                output.value = finalTranscript + (interimTranscript ? '\\n[' + interimTranscript + ']' : '');
                
                updateButtons();
            };
            
            recognition.onerror = (event) => {
                const status = document.getElementById('status');
                status.className = 'status error';
                
                switch (event.error) {
                    case 'not-allowed':
                        status.textContent = 'Mikrofon-Zugriff verweigert';
                        break;
                    case 'no-speech':
                        status.textContent = 'Keine Sprache erkannt';
                        break;
                    case 'network':
                        status.textContent = 'Netzwerkfehler';
                        break;
                    default:
                        status.textContent = 'Fehler: ' + event.error;
                }
                
                isRecording = false;
                document.getElementById('micButton').classList.remove('recording');
                stopVisualizer();
            };
        }
        
        function toggleRecording() {
            if (!recognition) return;
            
            if (isRecording) {
                recognition.stop();
            } else {
                finalTranscript = document.getElementById('textOutput').value;
                if (finalTranscript && !finalTranscript.endsWith(' ')) {
                    finalTranscript += ' ';
                }
                recognition.start();
            }
        }
        
        function updateLanguage() {
            if (recognition) {
                recognition.lang = document.getElementById('language').value;
            }
        }
        
        let visualizerInterval;
        function animateVisualizer() {
            const bars = document.querySelectorAll('.visualizer-bar');
            visualizerInterval = setInterval(() => {
                bars.forEach(bar => {
                    const height = Math.random() * 35 + 5;
                    bar.style.height = height + 'px';
                });
            }, 100);
        }
        
        function stopVisualizer() {
            clearInterval(visualizerInterval);
            document.querySelectorAll('.visualizer-bar').forEach(bar => {
                bar.style.height = '5px';
            });
        }
        
        function updateButtons() {
            const hasText = document.getElementById('textOutput').value.trim().length > 0;
            document.getElementById('insertBtn').disabled = !hasText;
            document.getElementById('copyBtn').disabled = !hasText;
            document.getElementById('speakBtn').disabled = !hasText;
        }
        
        function insertText() {
            const text = document.getElementById('textOutput').value.trim()
                .replace(/\\n\\[.*\\]$/, ''); // Remove interim text
            if (text) {
                vscode.postMessage({ command: 'insertText', text });
            }
        }
        
        function copyText() {
            const text = document.getElementById('textOutput').value.trim()
                .replace(/\\n\\[.*\\]$/, '');
            if (text) {
                vscode.postMessage({ command: 'copyText', text });
            }
        }
        
        function speakText() {
            const text = document.getElementById('textOutput').value.trim()
                .replace(/\\n\\[.*\\]$/, '');
            if (text) {
                vscode.postMessage({ command: 'speakText', text });
            }
        }
        
        function clearText() {
            document.getElementById('textOutput').value = '';
            finalTranscript = '';
            updateButtons();
        }
        
        // Handle textarea changes
        document.getElementById('textOutput').addEventListener('input', updateButtons);
        
        // Handle TTS errors from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'ttsError') {
                const status = document.getElementById('status');
                status.className = 'status error';
                status.textContent = 'TTS Fehler: ' + message.error;
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        SpeechPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
