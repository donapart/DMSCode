import * as path from "path";
import * as vscode from "vscode";
import { DmsService } from "../services/DmsService";

export class DmsAssistant {
  constructor(private dmsService: DmsService) {}

  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> {
    const command = request.command;
    const prompt = request.prompt;

    try {
      switch (command) {
        case "search":
          return await this.handleSearch(prompt, stream, token);

        case "summarize":
          return await this.handleSummarize(prompt, stream, token);

        case "extract":
          return await this.handleExtract(prompt, stream, token);

        case "compare":
          return await this.handleCompare(prompt, stream, token);

        default:
          return await this.handleGeneral(prompt, stream, token);
      }
    } catch (error) {
      stream.markdown(`❌ **Fehler:** ${error}`);
      return { metadata: { error: String(error) } };
    }
  }

  private async handleSearch(
    query: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> {
    stream.progress("Suche läuft...");

    const results = await this.dmsService.semanticSearch(query);

    if (results.length === 0) {
      stream.markdown("🔍 Keine Dokumente gefunden für: **" + query + "**");
    } else {
      stream.markdown(`🔍 **${results.length} Dokument(e) gefunden:**\n\n`);

      for (const result of results.slice(0, 5)) {
        stream.markdown(
          `- 📄 **${result.document.name}** (${Math.round(
            result.score * 100,
          )}% Relevanz)\n`,
        );
        stream.markdown(`  > ${result.snippet.substring(0, 150)}...\n\n`);

        // Add button to open document
        stream.button({
          command: "vscode.open",
          arguments: [vscode.Uri.file(result.document.path)],
          title: "Öffnen",
        });
      }
    }

    return { metadata: { resultsCount: results.length } };
  }

  private async handleSummarize(
    prompt: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> {
    stream.progress("Zusammenfassung wird erstellt...");

    // Get current document text
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      stream.markdown("❌ Bitte öffnen Sie zuerst ein Dokument.");
      return { metadata: { error: "No document open" } };
    }

    const text = editor.document.getText();
    const summary = await this.dmsService.summarize(text);

    stream.markdown("📝 **Zusammenfassung:**\n\n");
    stream.markdown(summary);

    return { metadata: { success: true } };
  }

  private async handleExtract(
    prompt: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> {
    stream.progress("Informationen werden extrahiert...");

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      stream.markdown("❌ Bitte öffnen Sie zuerst ein Dokument.");
      return { metadata: { error: "No document open" } };
    }

    const text = editor.document.getText();
    const infoType = prompt || "wichtige Informationen";
    const extracted = await this.dmsService.extractInfo(text, infoType);

    stream.markdown(`📋 **Extrahierte ${infoType}:**\n\n`);
    stream.markdown(extracted);

    return { metadata: { success: true } };
  }

  private async handleCompare(
    prompt: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> {
    stream.markdown("📊 **Dokumentenvergleich**\n\n");
    stream.markdown(
      "Diese Funktion wird noch implementiert. Bitte wählen Sie zwei Dokumente aus.\n",
    );

    stream.button({
      command: "dms.semanticSearch",
      title: "Dokumente suchen",
    });

    return { metadata: { notImplemented: true } };
  }

  private async handleGeneral(
    prompt: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> {
    stream.progress("Sammle Kontext...");

    // 1. Build context from current document
    let context = "";
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      const text = selection.isEmpty
        ? editor.document.getText().substring(0, 2000)
        : editor.document.getText(selection);
      context += `\nAktives Dokument (${path.basename(
        editor.document.fileName,
      )}):\n${text}\n`;
    }

    // 2. Hybrid Retrieval: Graph + Vector Search
    let useGraphRAG = false;

    // Detect if query benefits from structured knowledge (entities, relationships)
    const structuredKeywords = [
      "wer",
      "welche",
      "organisation",
      "person",
      "verbindung",
      "beziehung",
      "zusammenhang",
    ];
    useGraphRAG = structuredKeywords.some((kw) =>
      prompt.toLowerCase().includes(kw),
    );

    if (useGraphRAG) {
      try {
        stream.progress("Durchsuche Knowledge Graph...");

        // Try to find relevant entities first
        const graphResult = await this.queryGraphForContext(prompt);
        if (graphResult) {
          context += "\nKnowledge Graph Informationen:\n";
          context += graphResult;
          stream.markdown("🧠 *Verwendet Knowledge Graph*\n\n");
        }
      } catch (error) {
        console.warn(
          "Graph query failed, falling back to vector search:",
          error,
        );
        useGraphRAG = false;
      }
    }

    // 3. Always add vector search as fallback/supplement
    try {
      stream.progress("Suche relevante Dokumente...");
      const similarDocs = await this.dmsService.semanticSearch(prompt);

      if (similarDocs.length > 0) {
        context += "\nRelevante Dokumente aus dem DMS:\n";
        const topDocs = similarDocs.slice(0, 3); // Top 3 context docs

        for (const result of topDocs) {
          context += `\n--- Dokument: ${result.document.name} ---\n`;
          context += `${result.snippet}\n`;

          // Show used references in UI
          stream.reference(vscode.Uri.file(result.document.path));
        }
        context += "\n---\n";
      }
    } catch (error) {
      console.warn("RAG context retrieval failed:", error);
    }

    stream.progress("Generiere Antwort...");
    const response = await this.dmsService.chat(prompt, context);
    stream.markdown(response);

    // Suggest follow-up commands
    stream.markdown("\n\n---\n**Weitere Aktionen:**");
    stream.button({ command: "dms.semanticSearch", title: "🔍 Suchen" });
    stream.button({ command: "dms.openDashboard", title: "📊 Dashboard" });

    return { metadata: { success: true } };
  }

  private async queryGraphForContext(prompt: string): Promise<string | null> {
    // Simple pattern matching for entity types
    let entityQuery = "";

    if (
      prompt.toLowerCase().includes("organisation") ||
      prompt.toLowerCase().includes("firma")
    ) {
      entityQuery = "SELECT * FROM entity WHERE type = 'organization' LIMIT 10";
    } else if (
      prompt.toLowerCase().includes("person") ||
      prompt.toLowerCase().includes("wer")
    ) {
      entityQuery = "SELECT * FROM entity WHERE type = 'person' LIMIT 10";
    } else if (
      prompt.toLowerCase().includes("datum") ||
      prompt.toLowerCase().includes("wann")
    ) {
      entityQuery = "SELECT * FROM entity WHERE type = 'date' LIMIT 10";
    } else if (
      prompt.toLowerCase().includes("betrag") ||
      prompt.toLowerCase().includes("preis")
    ) {
      entityQuery = "SELECT * FROM entity WHERE type = 'amount' LIMIT 10";
    } else {
      // Generic query: get all recent entities
      entityQuery = "SELECT * FROM entity ORDER BY created_at DESC LIMIT 20";
    }

    try {
      const result = await this.dmsService.queryKnowledgeGraph(entityQuery);

      if (result && result.result && result.result.length > 0) {
        let contextText = "Gefundene Entitäten:\n";

        for (const entity of result.result[0]?.result || []) {
          contextText += `- ${entity.type}: ${entity.value} (Confidence: ${entity.confidence})\n`;
        }

        return contextText;
      }
    } catch (error) {
      console.error("Graph query failed:", error);
    }

    return null;
  }
}
