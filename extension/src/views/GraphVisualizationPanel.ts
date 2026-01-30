import * as vscode from "vscode";
import { DmsService } from "../services/DmsService";

export class GraphVisualizationPanel {
  public static currentPanel: GraphVisualizationPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    dmsService: DmsService,
    docId?: string,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (GraphVisualizationPanel.currentPanel) {
      GraphVisualizationPanel.currentPanel._panel.reveal(column);
      if (docId) {
        GraphVisualizationPanel.currentPanel.loadGraph(docId);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "dmsGraphVisualization",
      "Knowledge Graph",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "resources"),
        ],
      },
    );

    GraphVisualizationPanel.currentPanel = new GraphVisualizationPanel(
      panel,
      extensionUri,
      dmsService,
    );

    if (docId) {
      GraphVisualizationPanel.currentPanel.loadGraph(docId);
    }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private dmsService: DmsService,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "loadGraph":
            await this.loadGraph(message.docId);
            break;
          case "queryGraph":
            await this.queryGraph(message.query);
            break;
          case "getEntityTypes":
            await this.getEntityTypes();
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  private async loadGraph(docId: string) {
    try {
      const graphData = await this.dmsService.getDocumentGraph(docId);
      this._panel.webview.postMessage({
        command: "displayGraph",
        data: graphData,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Graph laden fehlgeschlagen: ${error}`);
    }
  }

  private async queryGraph(query: string) {
    try {
      const result = await this.dmsService.queryKnowledgeGraph(query);
      this._panel.webview.postMessage({
        command: "displayQueryResult",
        data: result,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Graph-Query fehlgeschlagen: ${error}`);
    }
  }

  private async getEntityTypes() {
    const types = [
      "person",
      "organization",
      "date",
      "amount",
      "product",
      "location",
    ];
    this._panel.webview.postMessage({
      command: "entityTypes",
      data: types,
    });
  }

  public dispose() {
    GraphVisualizationPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Graph</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .controls {
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }
        
        .controls input, .controls select, .controls button {
            padding: 8px 12px;
            margin-right: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        
        .controls button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
        }
        
        .controls button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        #graph-container {
            width: 100%;
            height: 600px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background-color: var(--vscode-editor-background);
            position: relative;
        }
        
        .node {
            stroke: var(--vscode-editor-foreground);
            stroke-width: 2px;
            cursor: pointer;
        }
        
        .node.person { fill: #4A90E2; }
        .node.organization { fill: #50E3C2; }
        .node.date { fill: #F5A623; }
        .node.amount { fill: #BD10E0; }
        .node.product { fill: #7ED321; }
        .node.location { fill: #D0021B; }
        .node.document { fill: #9B9B9B; }
        
        .link {
            stroke: var(--vscode-editor-foreground);
            stroke-opacity: 0.3;
            stroke-width: 2px;
        }
        
        .node-label {
            font-size: 12px;
            fill: var(--vscode-editor-foreground);
            pointer-events: none;
            text-anchor: middle;
        }
        
        .legend {
            position: absolute;
            top: 10px;
            right: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
        }
        
        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .info-panel {
            margin-top: 20px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .info-panel h3 {
            margin-top: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Knowledge Graph Visualisierung</h1>
        
        <div class="controls">
            <input type="text" id="docIdInput" placeholder="Dokument-ID eingeben" />
            <button onclick="loadGraph()">Graph laden</button>
            
            <select id="entityTypeFilter">
                <option value="">Alle Entitäten</option>
                <option value="person">Personen</option>
                <option value="organization">Organisationen</option>
                <option value="date">Daten</option>
                <option value="amount">Beträge</option>
                <option value="product">Produkte</option>
                <option value="location">Orte</option>
            </select>
            
            <button onclick="resetZoom()">Zoom zurücksetzen</button>
        </div>
        
        <div id="graph-container">
            <svg id="graph-svg"></svg>
            <div class="legend">
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #4A90E2;"></div>
                    <span>Person</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #50E3C2;"></div>
                    <span>Organisation</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #F5A623;"></div>
                    <span>Datum</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #BD10E0;"></div>
                    <span>Betrag</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #7ED321;"></div>
                    <span>Produkt</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #D0021B;"></div>
                    <span>Ort</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #9B9B9B;"></div>
                    <span>Dokument</span>
                </div>
            </div>
        </div>
        
        <div class="info-panel" id="info-panel">
            <h3>Informationen</h3>
            <p>Wählen Sie ein Dokument, um den Knowledge Graph anzuzeigen.</p>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let currentData = null;
        let simulation = null;
        
        function loadGraph() {
            const docId = document.getElementById('docIdInput').value;
            if (docId) {
                vscode.postMessage({ command: 'loadGraph', docId: docId });
            }
        }
        
        function resetZoom() {
            if (simulation) {
                simulation.alpha(1).restart();
            }
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'displayGraph':
                    displayGraph(message.data);
                    break;
                case 'displayQueryResult':
                    displayQueryResult(message.data);
                    break;
            }
        });
        
        function displayGraph(data) {
            currentData = data;
            const container = document.getElementById('graph-container');
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            // Clear existing SVG
            d3.select('#graph-svg').selectAll('*').remove();
            
            const svg = d3.select('#graph-svg')
                .attr('width', width)
                .attr('height', height);
            
            const g = svg.append('g');
            
            // Build nodes and links
            const nodes = [];
            const links = [];
            
            // Add document node
            nodes.push({
                id: data.document.doc_id,
                label: data.document.filename,
                type: 'document',
                data: data.document
            });
            
            // Add entity nodes
            if (data.entities && data.entities[0] && data.entities[0].entities) {
                data.entities[0].entities.forEach(entity => {
                    nodes.push({
                        id: entity.value,
                        label: entity.value,
                        type: entity.type,
                        data: entity
                    });
                    
                    // Link document to entity
                    links.push({
                        source: data.document.doc_id,
                        target: entity.value,
                        type: 'mentions'
                    });
                });
            }
            
            // Add relationship links
            if (data.relationships && data.relationships[0] && data.relationships[0].result) {
                data.relationships[0].result.forEach(rel => {
                    links.push({
                        source: rel.in,
                        target: rel.out,
                        type: rel.type
                    });
                });
            }
            
            // Create force simulation
            simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(links).id(d => d.id).distance(100))
                .force('charge', d3.forceManyBody().strength(-300))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide().radius(50));
            
            // Add zoom behavior
            const zoom = d3.zoom()
                .scaleExtent([0.1, 4])
                .on('zoom', (event) => {
                    g.attr('transform', event.transform);
                });
            
            svg.call(zoom);
            
            // Draw links
            const link = g.append('g')
                .selectAll('line')
                .data(links)
                .enter().append('line')
                .attr('class', 'link');
            
            // Draw nodes
            const node = g.append('g')
                .selectAll('circle')
                .data(nodes)
                .enter().append('circle')
                .attr('class', d => \`node \${d.type}\`)
                .attr('r', d => d.type === 'document' ? 20 : 15)
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended))
                .on('click', (event, d) => {
                    showNodeInfo(d);
                });
            
            // Add labels
            const label = g.append('g')
                .selectAll('text')
                .data(nodes)
                .enter().append('text')
                .attr('class', 'node-label')
                .attr('dy', -20)
                .text(d => d.label.length > 20 ? d.label.substring(0, 17) + '...' : d.label);
            
            // Update positions on tick
            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
                
                node
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);
                
                label
                    .attr('x', d => d.x)
                    .attr('y', d => d.y);
            });
            
            // Update info panel
            document.getElementById('info-panel').innerHTML = \`
                <h3>Graph geladen</h3>
                <p><strong>Dokument:</strong> \${data.document.filename}</p>
                <p><strong>Entitäten:</strong> \${nodes.length - 1}</p>
                <p><strong>Beziehungen:</strong> \${links.length}</p>
            \`;
        }
        
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        
        function showNodeInfo(node) {
            let infoHtml = \`<h3>\${node.label}</h3>\`;
            infoHtml += \`<p><strong>Typ:</strong> \${node.type}</p>\`;
            
            if (node.data.confidence) {
                infoHtml += \`<p><strong>Confidence:</strong> \${(node.data.confidence * 100).toFixed(1)}%</p>\`;
            }
            
            if (node.data.metadata) {
                infoHtml += \`<p><strong>Metadata:</strong></p><pre>\${JSON.stringify(node.data.metadata, null, 2)}</pre>\`;
            }
            
            if (node.data.tags) {
                infoHtml += \`<p><strong>Tags:</strong> \${node.data.tags.join(', ')}</p>\`;
            }
            
            document.getElementById('info-panel').innerHTML = infoHtml;
        }
        
        function displayQueryResult(result) {
            document.getElementById('info-panel').innerHTML = \`
                <h3>Query-Ergebnis</h3>
                <pre>\${JSON.stringify(result, null, 2)}</pre>
            \`;
        }
    </script>
</body>
</html>`;
  }
}
