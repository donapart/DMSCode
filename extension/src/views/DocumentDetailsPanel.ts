import * as vscode from "vscode";
import { DmsDocument, DmsService } from "../services/DmsService";

export class DocumentDetailsPanel {
  public static currentPanel: DocumentDetailsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _document: DmsDocument;

  public static createOrShow(
    extensionUri: vscode.Uri,
    dmsService: DmsService,
    document: DmsDocument
  ) {
    const column = vscode.ViewColumn.Two;

    if (DocumentDetailsPanel.currentPanel) {
      DocumentDetailsPanel.currentPanel._document = document;
      DocumentDetailsPanel.currentPanel._update();
      DocumentDetailsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "dmsDocumentDetails",
      `Details: ${document.name}`,
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );

    DocumentDetailsPanel.currentPanel = new DocumentDetailsPanel(
      panel,
      extensionUri,
      dmsService,
      document
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly dmsService: DmsService,
    document: DmsDocument
  ) {
    this._panel = panel;
    this._document = document;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    DocumentDetailsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    this._panel.title = `Details: ${this._document.name}`;
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview() {
    const doc = this._document;
    const created = new Date(doc.createdAt).toLocaleString();
    const modified = new Date(doc.modifiedAt).toLocaleString();
    const tagsHtml = doc.tags
      .map((t) => `<span class="tag">${t}</span>`)
      .join("");
    const metadataHtml = doc.metadata
      ? Object.entries(doc.metadata)
          .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
          .join("")
      : "";

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document Details</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
                h1 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
                .section { margin-bottom: 20px; }
                .label { font-weight: bold; width: 120px; display: inline-block; }
                .tag { background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 3px; margin-right: 5px; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 5px; border-bottom: 1px solid var(--vscode-panel-border); }
                pre { background-color: var(--vscode-textBlockQuote-background); padding: 10px; overflow: auto; max-height: 300px; }
            </style>
        </head>
        <body>
            <h1>${doc.name}</h1>
            
            <div class="section">
                <div><span class="label">Pfad:</span> ${doc.path}</div>
                <div><span class="label">Typ:</span> ${doc.type}</div>
                <div><span class="label">Erstellt:</span> ${created}</div>
                <div><span class="label">Geändert:</span> ${modified}</div>
                <div><span class="label">ID:</span> ${doc.id}</div>
            </div>

            <div class="section">
                <h3>Tags</h3>
                <div>${tagsHtml || "Keine Tags"}</div>
            </div>

            ${
              metadataHtml
                ? `
            <div class="section">
                <h3>Metadaten</h3>
                <table>${metadataHtml}</table>
            </div>`
                : ""
            }

            <div class="section">
                <h3>OCR Text (Vorschau)</h3>
                <pre>${
                  doc.ocrText
                    ? doc.ocrText.substring(0, 1000) +
                      (doc.ocrText.length > 1000 ? "..." : "")
                    : "Kein OCR Text vorhanden"
                }</pre>
            </div>
        </body>
        </html>`;
  }
}
