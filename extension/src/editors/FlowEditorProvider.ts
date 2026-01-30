import * as vscode from "vscode";
import { AutomationService } from "../services/AutomationService";

/**
 * Provider for the visual workflow editor for .dmsflow files.
 */
export class FlowEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "dms.flowEditor";
  private automationService: AutomationService;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.automationService = new AutomationService();
  }

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new FlowEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      FlowEditorProvider.viewType,
      provider,
    );
    return providerRegistration;
  }

  /**
   * Called when the custom editor is opened.
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    function updateWebview() {
      webviewPanel.webview.postMessage({
        type: "update",
        text: document.getText(),
      });
    }

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to update the webview whenever it changes.
    //
    // Waits for the webview to be properly initialized.
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      },
    );

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    // Receive message from the webview.
    webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case "update":
          this.updateTextDocument(document, e.content);
          return;
      }
    });

    // Send initial content
    updateWebview();
  }

  /**
   * Write out the json to a text document.
   */
  private updateTextDocument(document: vscode.TextDocument, json: any) {
    const edit = new vscode.WorkspaceEdit();

    // Just replace the entire document every time for this example.
    // TODO: Compute minimal edits for better performance and to preserve cursor position in text view components.
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      JSON.stringify(json, null, 2),
    );

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Get the static html used for the editor webviews.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DMS Flow Editor</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          #toolbar {
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 10px;
            align-items: center;
          }
          #canvas {
            flex-grow: 1;
            position: relative;
            background-image: radial-gradient(var(--vscode-panel-border) 1px, transparent 1px);
            background-size: 20px 20px;
            overflow: auto;
          }
          .node {
            position: absolute;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            padding: 0;
            border-radius: 4px;
            width: 180px;
            cursor: move;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10;
          }
          .node-header {
            background-color: var(--vscode-activityBar-background);
            color: var(--vscode-activityBar-foreground);
            padding: 5px 10px;
            font-weight: bold;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
            display: flex;
            justify-content: space-between;
          }
          .node-content {
            padding: 10px;
          }
          .node-content input, .node-content select {
            width: 100%;
            box-sizing: border-box;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            margin-bottom: 5px;
          }
          .delete-btn {
            background: none;
            border: none;
            color: var(--vscode-activityBar-foreground);
            cursor: pointer;
            font-size: 16px;
          }
          svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
          }
          path {
            fill: none;
            stroke: var(--vscode-textLink-foreground);
            stroke-width: 2px;
          }
        </style>
      </head>
      <body>
        <div id="toolbar">
            <span id="flow-name-display" style="font-weight:bold;">New Flow</span>
            <button onclick="addNode('trigger')">Add Trigger</button>
            <button onclick="addNode('action')">Add Action</button>
            <button onclick="addNode('condition')">Add Condition</button>
            <span style="flex-grow:1"></span>
            <button onclick="deploy()" style="background-color: #007acc; color: white;">Deploy Flow</button>
        </div>
        <div id="canvas">
             <svg id="edges-layer"></svg>
            <div id="nodes-layer"></div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          let state = {
            id: "flow_" + Date.now(),
            name: "New Flow",
            nodes: [],
            edges: []
          };
          let dragNodeId = null;
          let dragOffsetX = 0;
          let dragOffsetY = 0;

          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
              case 'update':
                const text = message.text;
                if (text.trim()) {
                    try {
                        const newState = JSON.parse(text);
                        // Merge default integrity
                        if (!newState.nodes) newState.nodes = [];
                        if (!newState.edges) newState.edges = [];
                        state = newState;
                        document.getElementById('flow-name-display').innerText = state.name;
                        render();
                    } catch (e) { console.error(e); }
                }
                break;
            }
          });

          function render() {
            const nodesLayer = document.getElementById('nodes-layer');
            nodesLayer.innerHTML = '';
            
            // Render Nodes
            state.nodes.forEach((node, index) => {
                const el = document.createElement('div');
                el.className = 'node';
                el.id = node.id;
                el.style.left = node.position.x + 'px';
                el.style.top = node.position.y + 'px';
                
                // Color coding based on type
                let color = 'var(--vscode-activityBar-background)';
                if (node.type === 'trigger') color = '#2E7D32'; 
                if (node.type === 'condition') color = '#F57F17'; 
                
                el.innerHTML = \`
                    <div class="node-header" style="background-color: \${color}" onmousedown="startDrag(event, '\${node.id}')">
                        \${node.type.toUpperCase()}
                        <button class="delete-btn" onclick="deleteNode('\${node.id}')">×</button>
                    </div>
                    <div class="node-content">
                        <input type="text" value="\${node.data.label || ''}" onchange="updateNodeLabel('\${node.id}', this.value)" placeholder="Label">
                        \${node.type === 'condition' ? \`<input type="text" placeholder="Value > 500" onchange="updateNodeData('\${node.id}', 'value', this.value)">\` : ''}
                    </div>
                \`;
                nodesLayer.appendChild(el);
            });

            // Render Edges
            const svg = document.getElementById('edges-layer');
            svg.innerHTML = '';
            state.edges.forEach(edge => {
                const source = state.nodes.find(n => n.id === edge.source);
                const target = state.nodes.find(n => n.id === edge.target);
                if (source && target) {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    // Simple center-to-center line for MVP
                    const sx = source.position.x + 90; // width/2
                    const sy = source.position.y + 40; // approx center height
                    const tx = target.position.x + 90;
                    const ty = target.position.y + 40;
                    
                    // Bezier curve
                    const d = \`M \${sx} \${sy} C \${sx} \${sy+50}, \${tx} \${ty-50}, \${tx} \${ty}\`;
                    path.setAttribute('d', d);
                    svg.appendChild(path);
                }
            });
          }

          function addNode(type) {
            const id = 'node_' + Date.now();
            state.nodes.push({
                id: id,
                type: type,
                data: { label: 'New ' + type },
                position: { x: 100, y: 100 + (state.nodes.length * 50) }
            });
            // Auto connect to previous node if exists for simple linear flow
            if (state.nodes.length > 1) {
                const prev = state.nodes[state.nodes.length - 2];
                state.edges.push({
                    id: 'edge_' + Date.now(),
                    source: prev.id,
                    target: id
                });
            }
            updateHost();
            render();
          }

          function deleteNode(id) {
            state.nodes = state.nodes.filter(n => n.id !== id);
            state.edges = state.edges.filter(e => e.source !== id && e.target !== id);
            updateHost();
            render();
          }

          function updateNodeLabel(id, label) {
            const node = state.nodes.find(n => n.id === id);
            if (node) {
                node.data.label = label;
                updateHost();
            }
          }

          function updateNodeData(id, key, value) {
            const node = state.nodes.find(n => n.id === id);
            if (node) {
                if (!node.data) node.data = {};
                node.data[key] = value;
                updateHost();
            }
          }

          function startDrag(event, nodeId) {
             dragNodeId = nodeId;
             const node = state.nodes.find(n => n.id === nodeId);
             dragOffsetX = event.clientX - node.position.x;
             dragOffsetY = event.clientY - node.position.y;
             document.addEventListener('mousemove', onDrag);
             document.addEventListener('mouseup', endDrag);
          }

          function onDrag(event) {
             if (dragNodeId) {
                const node = state.nodes.find(n => n.id === dragNodeId);
                node.position.x = event.clientX - dragOffsetX;
                node.position.y = event.clientY - dragOffsetY;
                render(); // Re-render to move node and update edges
             }
          }

          function endDrag() {
             dragNodeId = null;
             document.removeEventListener('mousemove', onDrag);
             document.removeEventListener('mouseup', endDrag);
             updateHost();
          }

          function updateHost() {
            vscode.postMessage({
              type: 'update',
              content: state
            });
          }

          function deploy() {
             vscode.postMessage({
              type: 'deploy'
             });
          }

          // Initialize
          render();
        </script>
      </body>
      </html>
    `;
  }
}
