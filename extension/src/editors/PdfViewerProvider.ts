import * as vscode from "vscode";

export class PdfViewerProvider implements vscode.CustomReadonlyEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new PdfViewerProvider(context);
    return vscode.window.registerCustomEditorProvider(
      "dms.pdfViewer",
      provider,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document.uri
    );

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "runOcr":
          vscode.commands.executeCommand("dms.runOcr", document.uri);
          break;
        case "copy":
          vscode.env.clipboard.writeText(message.text);
          vscode.window.showInformationMessage("Text kopiert!");
          break;
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, uri: vscode.Uri): string {
    // Create a webview URI for the PDF file
    const pdfUri = webview.asWebviewUri(uri);

    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Viewer</title>
    <!-- Fallback to local pdf.js if available, otherwise CDN -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>
        // Configure worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    </script>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-widget-border);
            --accent: var(--vscode-button-background);
        }
        body {
            margin: 0;
            padding: 0;
            background: var(--bg);
            color: var(--fg);
            font-family: var(--vscode-font-family);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--border);
        }
        .toolbar button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--fg);
            border: 1px solid var(--border);
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .toolbar button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .toolbar .page-info {
            margin: 0 12px;
            font-size: 12px;
        }
        .toolbar .spacer {
            flex: 1;
        }
        .viewer-container {
            flex: 1;
            overflow: auto;
            display: flex;
            justify-content: center;
            padding: 20px;
            background: #404040;
        }
        #pdf-canvas {
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .zoom-controls {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .zoom-controls input {
            width: 50px;
            text-align: center;
            background: var(--vscode-input-background);
            border: 1px solid var(--border);
            color: var(--fg);
            padding: 2px 4px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button onclick="prevPage()">◀ Zurück</button>
        <span class="page-info">
            Seite <span id="pageNum">1</span> von <span id="pageCount">-</span>
        </span>
        <button onclick="nextPage()">Weiter ▶</button>
        
        <div class="spacer"></div>
        
        <div class="zoom-controls">
            <button onclick="zoomOut()">−</button>
            <input type="text" id="zoomLevel" value="100%" readonly>
            <button onclick="zoomIn()">+</button>
        </div>
        
        <button onclick="fitWidth()">Breite anpassen</button>
        <button onclick="runOcr()">🔍 OCR</button>
    </div>
    
    <div class="viewer-container">
        <canvas id="pdf-canvas"></canvas>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        pdfjsLib.GlobalWorkerOptions.workerSrc = 
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        let pdfDoc = null;
        let pageNum = 1;
        let scale = 1.0;
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');
        
        // Load PDF
        const url = '${pdfUri}';
        
        pdfjsLib.getDocument(url).promise.then(pdf => {
            pdfDoc = pdf;
            document.getElementById('pageCount').textContent = pdf.numPages;
            renderPage(pageNum);
        }).catch(err => {
            console.error('PDF load error:', err);
            document.querySelector('.viewer-container').innerHTML = 
                '<div style="color:var(--fg);text-align:center;padding:40px;">' +
                '<p>PDF konnte nicht geladen werden</p>' +
                '<p style="font-size:12px;opacity:0.7;">' + err.message + '</p></div>';
        });
        
        function renderPage(num) {
            pdfDoc.getPage(num).then(page => {
                const viewport = page.getViewport({ scale });
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                page.render({
                    canvasContext: ctx,
                    viewport: viewport
                });
                
                document.getElementById('pageNum').textContent = num;
                document.getElementById('zoomLevel').value = Math.round(scale * 100) + '%';
            });
        }
        
        function prevPage() {
            if (pageNum > 1) {
                pageNum--;
                renderPage(pageNum);
            }
        }
        
        function nextPage() {
            if (pageNum < pdfDoc.numPages) {
                pageNum++;
                renderPage(pageNum);
            }
        }
        
        function zoomIn() {
            scale += 0.25;
            renderPage(pageNum);
        }
        
        function zoomOut() {
            if (scale > 0.25) {
                scale -= 0.25;
                renderPage(pageNum);
            }
        }
        
        function fitWidth() {
            const container = document.querySelector('.viewer-container');
            pdfDoc.getPage(pageNum).then(page => {
                const viewport = page.getViewport({ scale: 1 });
                scale = (container.clientWidth - 40) / viewport.width;
                renderPage(pageNum);
            });
        }
        
        function runOcr() {
            vscode.postMessage({ command: 'runOcr' });
        }
        
        // Keyboard navigation
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') prevPage();
            if (e.key === 'ArrowRight') nextPage();
            if (e.key === '+') zoomIn();
            if (e.key === '-') zoomOut();
        });
    </script>
</body>
</html>`;
  }
}
