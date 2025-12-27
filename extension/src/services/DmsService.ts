import axios, { AxiosError } from "axios";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// Custom Error Classes for better error handling
export class DmsError extends Error {
  constructor(
    message: string,
    public readonly code: DmsErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DmsError";
  }
}

export type DmsErrorCode =
  | "SERVICE_UNAVAILABLE"
  | "OCR_FAILED"
  | "SEARCH_FAILED"
  | "LLM_ERROR"
  | "TTS_ERROR"
  | "FILE_NOT_FOUND"
  | "INVALID_DOCUMENT"
  | "NETWORK_ERROR";

export interface DmsDocument {
  id: string;
  name: string;
  path: string;
  type: string;
  tags: string[];
  createdAt: Date;
  modifiedAt: Date;
  ocrText?: string;
  embedding?: number[];
  metadata?: Record<string, string>;
}

export interface SearchResult {
  document: DmsDocument;
  score: number;
  snippet: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
  language: string;
  processingTime: number;
}

export class DmsService {
  public readonly context: vscode.ExtensionContext;
  private documentsCache: Map<string, DmsDocument> = new Map();
  private readonly ocrFallbackEnabled: boolean = true;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadDocumentsCache();
  }

  // ===== Tag Management =====

  async addTagToDocument(documentId: string, tag: string): Promise<void> {
    const doc = this.documentsCache.get(this.getPathFromId(documentId));
    if (doc && !doc.tags.includes(tag)) {
      doc.tags.push(tag);
      await this.saveDocumentsCache();
    }
  }

  async removeTagFromDocument(documentId: string, tag: string): Promise<void> {
    const doc = this.documentsCache.get(this.getPathFromId(documentId));
    if (doc) {
      doc.tags = doc.tags.filter((t) => t !== tag);
      await this.saveDocumentsCache();
    }
  }

  async renameTag(oldTag: string, newTag: string): Promise<number> {
    let count = 0;
    for (const doc of this.documentsCache.values()) {
      const index = doc.tags.indexOf(oldTag);
      if (index !== -1) {
        doc.tags[index] = newTag;
        count++;
      }
    }
    if (count > 0) {
      await this.saveDocumentsCache();
    }
    return count;
  }

  async deleteTag(tag: string): Promise<number> {
    let count = 0;
    for (const doc of this.documentsCache.values()) {
      if (doc.tags.includes(tag)) {
        doc.tags = doc.tags.filter((t) => t !== tag);
        count++;
      }
    }
    if (count > 0) {
      await this.saveDocumentsCache();
    }
    return count;
  }

  async getDocumentsByTag(tag: string): Promise<DmsDocument[]> {
    const docs = await this.getDocuments();
    return docs.filter((d) => d.tags.includes(tag));
  }

  private getPathFromId(id: string): string {
    try {
      return Buffer.from(id, "base64").toString("utf-8");
    } catch {
      return "";
    }
  }

  // ===== Configuration =====

  private getConfig<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration("dms").get<T>(key);
  }

  get documentsPath(): string {
    return (
      this.getConfig<string>("documentsPath") ||
      path.join(this.context.globalStorageUri.fsPath, "documents")
    );
  }

  get llmEndpoint(): string {
    return this.getConfig<string>("llmEndpoint") || "http://localhost:11434";
  }

  get llmModel(): string {
    return this.getConfig<string>("llmModel") || "llama3.2";
  }

  get ttsEndpoint(): string {
    return this.getConfig<string>("ttsEndpoint") || "http://localhost:8505";
  }

  get ocrLanguage(): string {
    return this.getConfig<string>("ocrLanguage") || "deu+eng";
  }

  get ocrEndpoint(): string {
    return this.getConfig<string>("ocrEndpoint") || "http://localhost:8510";
  }

  get semanticSearchEndpoint(): string {
    return (
      this.getConfig<string>("semanticSearchEndpoint") ||
      "http://localhost:8520"
    );
  }

  get apiKey(): string | undefined {
    return this.getConfig<string>("apiKey");
  }

  private getHeaders(
    contentType: string = "application/json"
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": contentType,
    };
    if (this.apiKey) {
      headers["X-API-KEY"] = this.apiKey;
    }
    return headers;
  }

  // ===== Document Management =====

  private async loadDocumentsCache(): Promise<void> {
    const cacheData =
      this.context.globalState.get<Record<string, DmsDocument>>(
        "documentsCache"
      );
    if (cacheData) {
      this.documentsCache = new Map(Object.entries(cacheData));
    }
  }

  private async saveDocumentsCache(): Promise<void> {
    const cacheObject = Object.fromEntries(this.documentsCache);
    await this.context.globalState.update("documentsCache", cacheObject);
  }

  async getDocuments(): Promise<DmsDocument[]> {
    // Scan documents directory
    const docsPath = this.documentsPath;
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }

    const documents: DmsDocument[] = [];
    const files = this.scanDirectory(docsPath);

    for (const file of files) {
      const existing = this.documentsCache.get(file);
      if (existing) {
        documents.push(existing);
      } else {
        const doc = await this.createDocumentEntry(file);
        documents.push(doc);
        this.documentsCache.set(file, doc);
      }
    }

    await this.saveDocumentsCache();
    return documents;
  }

  private scanDirectory(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scanDirectory(fullPath, files);
      } else if (this.isSupportedFile(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private isSupportedFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return [
      ".pdf",
      ".docx",
      ".doc",
      ".txt",
      ".md",
      ".epub",
      ".png",
      ".jpg",
      ".jpeg",
      ".tiff",
    ].includes(ext);
  }

  private async createDocumentEntry(filePath: string): Promise<DmsDocument> {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    return {
      id: Buffer.from(filePath).toString("base64"),
      name: path.basename(filePath),
      path: filePath,
      type: ext.replace(".", ""),
      tags: [],
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  }

  async getDocumentCount(): Promise<number> {
    const docs = await this.getDocuments();
    return docs.length;
  }

  async getTags(): Promise<string[]> {
    const docs = await this.getDocuments();
    const tags = new Set<string>();
    for (const doc of docs) {
      doc.tags.forEach((tag) => tags.add(tag));
    }
    return Array.from(tags).sort();
  }

  async getRecentDocuments(limit: number = 10): Promise<DmsDocument[]> {
    const docs = await this.getDocuments();
    return docs
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
      .slice(0, limit);
  }

  // ===== Import/Export =====

  async importDocuments(uris: vscode.Uri[]): Promise<void> {
    const docsPath = this.documentsPath;
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }

    for (const uri of uris) {
      const stats = fs.statSync(uri.fsPath);
      if (stats.isDirectory()) {
        // Copy entire directory
        const dirName = path.basename(uri.fsPath);
        const targetDir = path.join(docsPath, dirName);
        this.copyDirectory(uri.fsPath, targetDir);
      } else {
        // Copy single file
        const fileName = path.basename(uri.fsPath);
        const targetPath = path.join(docsPath, fileName);
        fs.copyFileSync(uri.fsPath, targetPath);
      }
    }
  }

  private copyDirectory(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  async exportDocuments(targetUri: vscode.Uri): Promise<void> {
    const docs = await this.getDocuments();
    const targetPath = targetUri.fsPath;

    for (const doc of docs) {
      const relativePath = path.relative(this.documentsPath, doc.path);
      const targetFile = path.join(targetPath, relativePath);
      const targetDir = path.dirname(targetFile);

      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(doc.path, targetFile);
    }
  }

  // ===== OCR =====

  async runOcr(uri: vscode.Uri): Promise<string> {
    // Verify file exists
    if (!fs.existsSync(uri.fsPath)) {
      throw new DmsError(
        `Datei nicht gefunden: ${uri.fsPath}`,
        "FILE_NOT_FOUND",
        { path: uri.fsPath }
      );
    }

    // Try external OCR service first
    try {
      const formData = new FormData();
      const fileBuffer = fs.readFileSync(uri.fsPath);
      const blob = new Blob([fileBuffer]);
      formData.append("file", blob, path.basename(uri.fsPath));
      formData.append("language", this.ocrLanguage);

      const headers = this.getHeaders("multipart/form-data");
      const response = await axios.post(`${this.ocrEndpoint}/ocr`, formData, {
        timeout: 120000, // 2 Minuten für große PDFs
        headers: headers,
        maxContentLength: 50 * 1024 * 1024, // 50MB max
        maxBodyLength: 50 * 1024 * 1024,
      });

      const text = response.data.text || "";

      // Update document cache and index
      const doc = this.documentsCache.get(uri.fsPath);
      if (doc) {
        doc.ocrText = text;
        await this.saveDocumentsCache();
        await this.indexDocument(doc);
      }

      return text;
    } catch (error) {
      console.log("External OCR service not available, trying fallback...");

      // Fallback: Try local text extraction for PDFs
      if (this.ocrFallbackEnabled) {
        return this.runOcrFallback(uri);
      }

      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      let errorMsg = "OCR Service nicht erreichbar";
      let suggestion = `Prüfen Sie, ob der OCR-Service unter ${this.ocrEndpoint} erreichbar ist`;

      if (statusCode === 401 || statusCode === 403) {
        errorMsg = "OCR Service: Zugriff verweigert";
        suggestion = "Prüfen Sie die Firewall-Regeln oder Authentifizierung";
      } else if (statusCode === 413) {
        errorMsg = "Datei zu groß für OCR";
        suggestion = "Die Datei überschreitet das Größenlimit von 50MB";
      } else if (axiosError.code === "ECONNREFUSED") {
        suggestion = `OCR-Service nicht gestartet. Starten Sie: docker compose up -d ocr`;
      } else if (axiosError.code === "ETIMEDOUT") {
        errorMsg = "OCR Service: Zeitüberschreitung";
        suggestion =
          "Die Verarbeitung dauert zu lange. Versuchen Sie eine kleinere Datei.";
      }

      throw new DmsError(errorMsg, "SERVICE_UNAVAILABLE", {
        service: "ocr",
        endpoint: this.ocrEndpoint,
        statusCode,
        originalError: axiosError.message,
        suggestion,
      });
    }
  }

  private async runOcrFallback(uri: vscode.Uri): Promise<string> {
    const ext = path.extname(uri.fsPath).toLowerCase();

    // For text-based files, just read the content
    if ([".txt", ".md"].includes(ext)) {
      return fs.readFileSync(uri.fsPath, "utf-8");
    }

    // For PDFs, try to extract embedded text using pdf-lib
    if (ext === ".pdf") {
      try {
        const { PDFDocument } = await import("pdf-lib");
        const pdfBytes = fs.readFileSync(uri.fsPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        // pdf-lib doesn't extract text directly, but we can try
        // For now, return a message guiding the user
        return (
          `[PDF mit ${pages.length} Seite(n)]\n\n` +
          `⚠️ Lokale OCR-Verarbeitung ist begrenzt.\n` +
          `Für vollständige Texterkennung starten Sie bitte den OCR-Service:\n\n` +
          `docker-compose up -d ocr-service\n\n` +
          `Datei: ${path.basename(uri.fsPath)}`
        );
      } catch (pdfError) {
        console.error("PDF processing error:", pdfError);
      }
    }

    // For images, we need external OCR
    if ([".png", ".jpg", ".jpeg", ".tiff", ".bmp"].includes(ext)) {
      return (
        `[Bild: ${path.basename(uri.fsPath)}]\n\n` +
        `⚠️ Bilderkennung erfordert den OCR-Service.\n` +
        `Starten Sie den Service mit:\n\n` +
        `docker-compose up -d ocr-service`
      );
    }

    throw new DmsError(
      `Dateityp nicht unterstützt: ${ext}`,
      "INVALID_DOCUMENT",
      {
        extension: ext,
        supportedTypes: [
          ".pdf",
          ".txt",
          ".md",
          ".png",
          ".jpg",
          ".jpeg",
          ".tiff",
        ],
      }
    );
  }

  // ===== Semantic Search =====

  async indexDocument(doc: DmsDocument): Promise<void> {
    if (!doc.ocrText || doc.ocrText.trim().length === 0) {
      return;
    }

    try {
      await axios.post(
        `${this.semanticSearchEndpoint}/index`,
        {
          id: doc.id,
          text: doc.ocrText,
          metadata: {
            name: doc.name,
            type: doc.type,
            path: doc.path,
            created: doc.createdAt.toISOString(),
          },
        },
        {
          timeout: 30000,
          headers: this.getHeaders(),
        }
      );
    } catch (error) {
      console.warn("Failed to index document:", error);
      // Don't throw, just log
    }
  }

  async semanticSearch(query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    try {
      const response = await axios.post(
        `${this.semanticSearchEndpoint}/search`,
        {
          query: query.trim(),
          limit: 10,
        },
        {
          timeout: 30000,
          headers: this.getHeaders(),
        }
      );

      // Map backend response to SearchResult format
      const backendResults = response.data.results || [];
      const results: SearchResult[] = backendResults.map(
        (r: {
          id: string;
          text: string;
          metadata?: Record<string, string>;
          distance?: number;
        }) => ({
          document: {
            id: r.id,
            name: r.metadata?.title || r.id,
            path: r.metadata?.path || "",
            type: r.metadata?.type || "unknown",
            tags: [],
            createdAt: new Date(),
            modifiedAt: new Date(),
            ocrText: r.text,
          },
          score: r.distance ? 1 / (1 + r.distance) : 0.5, // Convert distance to similarity score
          snippet: r.text?.substring(0, 200) || "",
        })
      );
      return results;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ECONNREFUSED") {
        console.warn(
          `Semantic search error (${
            axiosError.response?.status || axiosError.code
          }): ${axiosError.message}`
        );
      }
      // Fallback: Enhanced text search
      return this.enhancedSearch(query);
    }
  }

  private async enhancedSearch(query: string): Promise<SearchResult[]> {
    const docs = await this.getDocuments();
    const results: SearchResult[] = [];
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);

    for (const doc of docs) {
      let score = 0;
      const nameLower = doc.name.toLowerCase();
      const tagsLower = doc.tags.map((t) => t.toLowerCase());

      // Score based on matches
      for (const term of queryTerms) {
        // Exact name match = high score
        if (nameLower === term) {
          score += 1.0;
        }
        // Name contains term
        else if (nameLower.includes(term)) {
          score += 0.6;
        }
        // Tag exact match
        if (tagsLower.includes(term)) {
          score += 0.8;
        }
        // Tag contains term
        else if (tagsLower.some((t) => t.includes(term))) {
          score += 0.4;
        }
        // OCR text contains term
        if (doc.ocrText?.toLowerCase().includes(term)) {
          score += 0.3;
        }
      }

      if (score > 0) {
        // Normalize score
        const normalizedScore = Math.min(score / queryTerms.length, 1.0);

        // Generate snippet
        let snippet = doc.name;
        if (doc.ocrText) {
          const index = doc.ocrText.toLowerCase().indexOf(queryTerms[0]);
          if (index !== -1) {
            const start = Math.max(0, index - 50);
            const end = Math.min(doc.ocrText.length, index + 150);
            snippet =
              (start > 0 ? "..." : "") +
              doc.ocrText.substring(start, end) +
              (end < doc.ocrText.length ? "..." : "");
          }
        }

        results.push({
          document: doc,
          score: normalizedScore,
          snippet,
        });
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  // ===== LLM Integration =====

  async chat(message: string, context?: string): Promise<string> {
    const provider = this.getConfig<string>("llmProvider") || "ollama";

    try {
      if (provider === "ollama") {
        const response = await axios.post(
          `${this.llmEndpoint}/api/generate`,
          {
            model: this.llmModel,
            prompt: context
              ? `Kontext:\n${context}\n\nFrage: ${message}`
              : message,
            stream: false,
          },
          { timeout: 120000 }
        );

        return response.data.response || "";
      } else if (provider === "openai") {
        const apiKey = this.getConfig<string>("openaiApiKey");
        if (!apiKey) {
          throw new DmsError("OpenAI API Key nicht konfiguriert", "LLM_ERROR");
        }
        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: this.llmModel || "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "Du bist ein hilfreicher DMS-Assistent.",
              },
              ...(context
                ? [{ role: "user", content: `Kontext:\n${context}` }]
                : []),
              { role: "user", content: message },
            ],
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 60000,
          }
        );

        interface OpenAIResponse {
          choices: Array<{ message: { content: string } }>;
        }
        return (
          (response.data as OpenAIResponse).choices[0]?.message?.content || ""
        );
      }

      throw new DmsError(
        `Provider ${provider} nicht implementiert`,
        "LLM_ERROR",
        { provider, supportedProviders: ["ollama", "openai"] }
      );
    } catch (error) {
      if (error instanceof DmsError) {
        throw error;
      }
      const axiosError = error as AxiosError;
      throw new DmsError(
        "LLM Service nicht erreichbar",
        "SERVICE_UNAVAILABLE",
        {
          provider,
          originalError: axiosError.message,
          suggestion:
            provider === "ollama"
              ? "Starten Sie Ollama mit: ollama serve"
              : "Überprüfen Sie Ihre API-Konfiguration",
        }
      );
    }
  }

  async summarize(text: string): Promise<string> {
    return this.chat(`Fasse den folgenden Text kurz zusammen:\n\n${text}`);
  }

  async extractInfo(text: string, infoType: string): Promise<string> {
    return this.chat(
      `Extrahiere ${infoType} aus dem folgenden Text:\n\n${text}`
    );
  }

  // ===== TTS/STT =====

  async textToSpeech(text: string): Promise<void> {
    if (!text || text.trim().length === 0) {
      throw new DmsError("Kein Text zum Vorlesen", "TTS_ERROR");
    }

    const ttsBackend = this.getConfig<string>("ttsBackend") || "piper";

    try {
      // Ensure storage directory exists
      const storageDir = this.context.globalStorageUri.fsPath;
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      const response = await axios.post(
        `${this.ttsEndpoint}/synthesize`,
        {
          text: text.trim(),
          voice: "de_DE-thorsten-low",
          backend: ttsBackend,
        },
        {
          responseType: "arraybuffer",
          timeout: 60000,
        }
      );

      // Save audio and play
      const audioPath = path.join(storageDir, `tts_${Date.now()}.mp3`);
      fs.writeFileSync(audioPath, response.data);

      // Open in default audio player
      await vscode.env.openExternal(vscode.Uri.file(audioPath));

      // Clean up old audio files (keep only last 5)
      this.cleanupOldAudioFiles(storageDir);
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new DmsError(
        "TTS Service nicht erreichbar",
        "SERVICE_UNAVAILABLE",
        {
          service: "tts",
          backend: ttsBackend,
          endpoint: this.ttsEndpoint,
          originalError: axiosError.message,
          suggestion:
            "Starten Sie den TTS-Service: docker-compose up -d tts-service",
        }
      );
    }
  }

  private cleanupOldAudioFiles(directory: string): void {
    try {
      const files = fs
        .readdirSync(directory)
        .filter((f) => f.startsWith("tts_") && f.endsWith(".mp3"))
        .map((f) => ({
          name: f,
          path: path.join(directory, f),
          time: fs.statSync(path.join(directory, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only the 5 most recent files
      for (const file of files.slice(5)) {
        fs.unlinkSync(file.path);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  async speechToText(): Promise<string> {
    // STT is handled via SpeechPanel WebView using Web Speech API
    // This method is kept for programmatic access if a backend service is available
    try {
      const response = await axios.get(
        `${this.ttsEndpoint.replace("8505", "8506")}/listen`,
        {
          timeout: 30000,
        }
      );
      return response.data.text || "";
    } catch {
      // Fallback to WebView-based STT
      vscode.window
        .showInformationMessage(
          "Für Spracheingabe öffnen Sie bitte das Sprach-Panel",
          "Panel öffnen"
        )
        .then((selection) => {
          if (selection === "Panel öffnen") {
            vscode.commands.executeCommand("dms.speechToText");
          }
        });
      return "";
    }
  }
}
