import axios, { AxiosError } from "axios";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// Custom Error Classes for better error handling
export class DmsError extends Error {
  constructor(
    message: string,
    public readonly code: DmsErrorCode,
    public readonly details?: Record<string, unknown>,
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
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  private _onDidDocumentsChange: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidDocumentsChange: vscode.Event<void> =
    this._onDidDocumentsChange.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadDocumentsCache();
    this.initializeFileWatcher();
  }

  private initializeFileWatcher() {
    const docsPath = this.documentsPath;
    // Watch for changes in the documents directory
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(docsPath, "**/*"),
    );

    this.fileWatcher.onDidCreate(async (uri) => {
      if (this.isSupportedFile(uri.fsPath)) {
        console.log(`File created: ${uri.fsPath}`);
        // Only create if not already in cache (prevents overwriting during rename)
        if (!this.documentsCache.has(uri.fsPath)) {
          const doc = await this.createDocumentEntry(uri.fsPath);
          this.documentsCache.set(uri.fsPath, doc);
          await this.saveDocumentsCache();
          this._onDidDocumentsChange.fire();
        }
      }
    });

    this.fileWatcher.onDidDelete(async (uri) => {
      console.log(`File deleted: ${uri.fsPath}`);
      if (this.documentsCache.has(uri.fsPath)) {
        this.documentsCache.delete(uri.fsPath);
        await this.saveDocumentsCache();
        this._onDidDocumentsChange.fire();
      }
    });

    this.fileWatcher.onDidChange(async (uri) => {
      if (this.isSupportedFile(uri.fsPath)) {
        console.log(`File changed: ${uri.fsPath}`);
        // Update modification time
        const doc = this.documentsCache.get(uri.fsPath);
        if (doc) {
          const stats = fs.statSync(uri.fsPath);
          doc.modifiedAt = stats.mtime;
          await this.saveDocumentsCache();
          this._onDidDocumentsChange.fire();
        }
      }
    });

    this.context.subscriptions.push(this.fileWatcher);
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

  // ===== Auto-Rename & File Operations =====

  async autoRenameDocument(documentId: string): Promise<string> {
    const oldPath = this.getPathFromId(documentId);
    const doc = this.documentsCache.get(oldPath);

    if (!doc) {
      throw new DmsError("Dokument nicht gefunden", "FILE_NOT_FOUND");
    }

    // 1. Get content for AI
    let content = doc.ocrText;
    if (!content || content.length < 50) {
      // Try to read file if OCR text is missing
      try {
        content = await this.runOcrFallback(vscode.Uri.file(oldPath));
      } catch {
        content = "";
      }
    }

    if (!content || content.length < 10) {
      throw new DmsError(
        "Zu wenig Text für automatische Umbenennung",
        "INVALID_DOCUMENT",
      );
    }

    // 2. Ask LLM for filename
    const prompt = `
    Analysiere den folgenden Dokumententext und generiere einen passenden Dateinamen.
    Format: YYYY-MM-DD_Sender_Typ_Kurzbeschreibung.ext
    
    Regeln:
    - Datum: Das wichtigste Datum im Dokument (Rechnungsdatum, Briefdatum). Wenn keins gefunden, nimm heute.
    - Sender: Firmenname oder Person (z.B. Telekom, Amazon, Finanzamt).
    - Typ: Rechnung, Vertrag, Brief, Lieferschein, Info.
    - Kurzbeschreibung: 1-3 Stichworte (optional).
    - Dateiendung: Muss beibehalten werden (${path.extname(oldPath)}).
    - Keine Leerzeichen, nutze Unterstriche.
    - Antworte NUR mit dem Dateinamen, kein anderer Text.

    Dokumententext:
    ${content.substring(0, 2000)}
    `;

    const newFilename = (await this.chat(prompt)).trim().replace(/[`'"]/g, "");

    // Validate filename (basic check)
    if (
      !newFilename.endsWith(path.extname(oldPath)) ||
      newFilename.includes(" ")
    ) {
      // Fallback or error? Let's try to fix extension
      const ext = path.extname(oldPath);
      const fixed = newFilename.split(".")[0].replace(/\s/g, "_") + ext;
      console.log(`Fixed filename: ${newFilename} -> ${fixed}`);
      return this.renameDocument(oldPath, fixed);
    }

    return this.renameDocument(oldPath, newFilename);
  }

  async renameDocument(oldPath: string, newFilename: string): Promise<string> {
    if (!fs.existsSync(oldPath)) {
      throw new DmsError("Ursprungsdatei nicht gefunden", "FILE_NOT_FOUND");
    }

    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newFilename);

    if (fs.existsSync(newPath)) {
      throw new DmsError("Zieldatei existiert bereits", "INVALID_DOCUMENT");
    }

    // 1. Rename file
    fs.renameSync(oldPath, newPath);

    // 2. Update Cache (preserve tags & metadata)
    const oldDoc = this.documentsCache.get(oldPath);
    if (oldDoc) {
      const newDoc: DmsDocument = {
        ...oldDoc,
        id: Buffer.from(newPath).toString("base64"),
        name: newFilename,
        path: newPath,
        modifiedAt: new Date(),
      };

      this.documentsCache.delete(oldPath);
      this.documentsCache.set(newPath, newDoc);
      await this.saveDocumentsCache();
      this._onDidDocumentsChange.fire();
    }

    return newFilename;
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
    return this.getConfig<string>("llmEndpoint") || "http://49.13.150.177";
  }

  get llmModel(): string {
    return this.getConfig<string>("llmModel") || "llama3.2";
  }

  get ttsEndpoint(): string {
    return this.getConfig<string>("ttsEndpoint") || "http://49.13.150.177:8505";
  }

  get ocrLanguage(): string {
    return this.getConfig<string>("ocrLanguage") || "deu+eng";
  }

  get ocrEndpoint(): string {
    return this.getConfig<string>("ocrEndpoint") || "http://49.13.150.177/ocr";
  }

  get semanticSearchEndpoint(): string {
    return (
      this.getConfig<string>("semanticSearchEndpoint") ||
      "http://49.13.150.177/search"
    );
  }

  get graphEndpoint(): string {
    return (
      this.getConfig<string>("graphEndpoint") || "http://49.13.150.177/graph"
    );
  }

  get apiKey(): string | undefined {
    return this.getConfig<string>("apiKey");
  }

  private getHeaders(
    contentType: string = "application/json",
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
    // 1. Try to load from dms-index.json in documents folder (Portable Index)
    const indexFile = path.join(this.documentsPath, "dms-index.json");

    if (fs.existsSync(indexFile)) {
      try {
        const content = fs.readFileSync(indexFile, "utf-8");
        const data = JSON.parse(content);
        // Convert date strings back to Date objects
        for (const key in data) {
          if (data[key].createdAt)
            data[key].createdAt = new Date(data[key].createdAt);
          if (data[key].modifiedAt)
            data[key].modifiedAt = new Date(data[key].modifiedAt);
        }
        this.documentsCache = new Map(Object.entries(data));
        console.log(`Loaded index from ${indexFile}`);
        return;
      } catch (e) {
        console.error("Failed to load dms-index.json", e);
      }
    }

    // 2. Fallback: Load from globalState (Legacy)
    const cacheData =
      this.context.globalState.get<Record<string, DmsDocument>>(
        "documentsCache",
      );
    if (cacheData) {
      // Migration: If we have data in globalState but not in file, we will save to file next time
      this.documentsCache = new Map(Object.entries(cacheData));
      // Trigger save to create the file
      void this.saveDocumentsCache();
    }
  }

  private async saveDocumentsCache(): Promise<void> {
    // Save to dms-index.json
    const indexFile = path.join(this.documentsPath, "dms-index.json");
    const cacheObject = Object.fromEntries(this.documentsCache);

    try {
      // Ensure directory exists
      if (!fs.existsSync(this.documentsPath)) {
        fs.mkdirSync(this.documentsPath, { recursive: true });
      }
      fs.writeFileSync(
        indexFile,
        JSON.stringify(cacheObject, null, 2),
        "utf-8",
      );
    } catch (e) {
      console.error("Failed to save dms-index.json", e);
    }

    // Keep globalState in sync for now (as backup)
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

  async importDocuments(
    uris: vscode.Uri[],
    conflictStrategy: "overwrite" | "rename" | "skip" = "rename",
  ): Promise<number> {
    const docsPath = this.documentsPath;
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }

    let count = 0;

    for (const uri of uris) {
      const stats = fs.statSync(uri.fsPath);
      if (stats.isDirectory()) {
        // Copy entire directory
        const dirName = path.basename(uri.fsPath);
        const targetDir = path.join(docsPath, dirName);
        count += this.copyDirectory(uri.fsPath, targetDir, conflictStrategy);
      } else {
        // Copy single file
        const fileName = path.basename(uri.fsPath);
        const targetPath = path.join(docsPath, fileName);

        if (this.handleFileImport(uri.fsPath, targetPath, conflictStrategy)) {
          count++;
        }
      }
    }
    return count;
  }

  private handleFileImport(
    srcPath: string,
    destPath: string,
    strategy: "overwrite" | "rename" | "skip",
  ): boolean {
    if (fs.existsSync(destPath)) {
      if (strategy === "skip") {
        return false;
      }
      if (strategy === "rename") {
        const ext = path.extname(destPath);
        const name = path.basename(destPath, ext);
        let counter = 1;
        let newDest = path.join(
          path.dirname(destPath),
          `${name}_${counter}${ext}`,
        );
        while (fs.existsSync(newDest)) {
          counter++;
          newDest = path.join(
            path.dirname(destPath),
            `${name}_${counter}${ext}`,
          );
        }
        fs.copyFileSync(srcPath, newDest);
        return true;
      }
      // overwrite
    }
    fs.copyFileSync(srcPath, destPath);
    return true;
  }

  private copyDirectory(
    src: string,
    dest: string,
    strategy: "overwrite" | "rename" | "skip",
  ): number {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    let count = 0;
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        count += this.copyDirectory(srcPath, destPath, strategy);
      } else {
        if (this.handleFileImport(srcPath, destPath, strategy)) {
          count++;
        }
      }
    }
    return count;
  }

  async exportDocuments(
    targetUri: vscode.Uri,
    filter?: { tag?: string; after?: Date },
  ): Promise<number> {
    let docs = await this.getDocuments();

    // Apply filters
    if (filter?.tag) {
      docs = docs.filter((d) => d.tags.includes(filter.tag!));
    }
    if (filter?.after) {
      docs = docs.filter((d) => d.createdAt > filter.after!);
    }

    const targetPath = targetUri.fsPath;
    let count = 0;

    for (const doc of docs) {
      const destPath = path.join(targetPath, path.basename(doc.path));
      try {
        fs.copyFileSync(doc.path, destPath);
        count++;
      } catch (e) {
        console.error(`Export failed for ${doc.path}:`, e);
      }
    }
    return count;
  }

  // ===== OCR =====

  async runOcr(uri: vscode.Uri): Promise<string> {
    // Verify file exists
    if (!fs.existsSync(uri.fsPath)) {
      throw new DmsError(
        `Datei nicht gefunden: ${uri.fsPath}`,
        "FILE_NOT_FOUND",
        { path: uri.fsPath },
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
      },
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
        },
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

    // Handle "tag:" queries directly
    if (query.toLowerCase().startsWith("tag:")) {
      const tag = query.substring(4).trim();
      const docs = await this.getDocumentsByTag(tag);
      return docs.map((doc) => ({
        document: doc,
        score: 1.0,
        snippet: `Tag Match: ${tag}`,
      }));
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
        },
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
        }),
      );
      return results;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ECONNREFUSED") {
        console.warn(
          `Semantic search error (${
            axiosError.response?.status || axiosError.code
          }): ${axiosError.message}`,
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
          { timeout: 120000 },
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
          },
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
        { provider, supportedProviders: ["ollama", "openai"] },
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
        },
      );
    }
  }

  async summarize(text: string): Promise<string> {
    return this.chat(`Fasse den folgenden Text kurz zusammen:\n\n${text}`);
  }

  async extractInfo(text: string, infoType: string): Promise<string> {
    return this.chat(
      `Extrahiere ${infoType} aus dem folgenden Text:\n\n${text}`,
    );
  }

  async compareDocuments(docId1: string, docId2: string): Promise<string> {
    const doc1 = this.documentsCache.get(this.getPathFromId(docId1));
    const doc2 = this.documentsCache.get(this.getPathFromId(docId2));

    if (!doc1 || !doc2) {
      throw new DmsError("Dokument(e) nicht gefunden", "FILE_NOT_FOUND");
    }

    const text1 =
      doc1.ocrText || (await this.runOcrFallback(vscode.Uri.file(doc1.path)));
    const text2 =
      doc2.ocrText || (await this.runOcrFallback(vscode.Uri.file(doc2.path)));

    const prompt = `
    Vergleiche die folgenden zwei Dokumente.
    Erstelle eine strukturierte Gegenüberstellung (Markdown).
    
    Dokument A: ${doc1.name}
    ---
    ${text1.substring(0, 3000)}
    ---

    Dokument B: ${doc2.name}
    ---
    ${text2.substring(0, 3000)}
    ---

    Aufgabe:
    1. Fasse den Inhalt beider Dokumente kurz zusammen.
    2. Liste Gemeinsamkeiten auf.
    3. Liste Unterschiede auf (besonders Daten, Beträge, Namen).
    4. Fazit.
    `;

    return this.chat(prompt);
  }

  async extractStructuredData(
    docId: string,
    templateType: "invoice" | "contract" | "generic",
  ): Promise<string> {
    const doc = this.documentsCache.get(this.getPathFromId(docId));
    if (!doc) {
      throw new DmsError("Dokument nicht gefunden", "FILE_NOT_FOUND");
    }

    const text =
      doc.ocrText || (await this.runOcrFallback(vscode.Uri.file(doc.path)));

    let fields = "";
    switch (templateType) {
      case "invoice":
        fields =
          "Rechnungsnummer, Rechnungsdatum, Lieferdatum, Gesamtbetrag (Brutto), Währung, Absender (Firma), Empfänger, IBAN, Zahlungsziel";
        break;
      case "contract":
        fields =
          "Vertragspartner A, Vertragspartner B, Vertragsgegenstand, Startdatum, Laufzeit/Enddatum, Kündigungsfrist, Monatliche Kosten";
        break;
      case "generic":
      default:
        fields =
          "Titel, Datum, Hauptakteure, Wichtige Beträge/Zahlen, Zusammenfassung (1 Satz)";
        break;
    }

    const prompt = `
    Analysiere das folgende Dokument und extrahiere die gewünschten Daten im JSON-Format.
    
    Dokument: ${doc.name}
    ---
    ${text.substring(0, 4000)}
    ---

    Zu extrahierende Felder: ${fields}

    Antworte NUR mit dem validen JSON-Block. Keine Erklärungen.
    `;

    return this.chat(prompt);
  }

  async autoTagDocument(docId: string): Promise<string[]> {
    const doc = this.documentsCache.get(this.getPathFromId(docId));
    if (!doc) {
      throw new DmsError("Dokument nicht gefunden", "FILE_NOT_FOUND");
    }

    const text =
      doc.ocrText || (await this.runOcrFallback(vscode.Uri.file(doc.path)));
    const existingTags = await this.getTags();

    const prompt = `
    Analysiere das folgende Dokument und schlage passende Tags vor.
    
    Dokument: ${doc.name}
    ---
    ${text.substring(0, 3000)}
    ---

    Bereits verwendete Tags im System: ${existingTags.join(", ")}

    Regeln:
    1. Nutze bevorzugt existierende Tags, wenn sie passen.
    2. Erstelle neue Tags nur, wenn nötig (kurz, prägnant, lowercase).
    3. Maximal 5 Tags.
    4. Antworte NUR mit einer kommagetrennten Liste der Tags (z.B. rechnung, telekom, 2024).
    `;

    const response = await this.chat(prompt);
    const newTags = response.split(",").map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9äöüß\-_]/g, ""),
    );

    // Add tags to document
    for (const tag of newTags) {
      if (tag && !doc.tags.includes(tag)) {
        doc.tags.push(tag);
      }
    }
    await this.saveDocumentsCache();
    return newTags;
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
        },
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
        },
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
        },
      );
      return response.data.text || "";
    } catch {
      // Fallback to WebView-based STT
      vscode.window
        .showInformationMessage(
          "Für Spracheingabe öffnen Sie bitte das Sprach-Panel",
          "Panel öffnen",
        )
        .then((selection) => {
          if (selection === "Panel öffnen") {
            vscode.commands.executeCommand("dms.openSpeechPanel");
          }
        });
      return "";
    }
  }

  // ===== System Health & Maintenance =====

  async checkHealth(): Promise<
    Record<
      string,
      { status: "ok" | "error"; message?: string; latency?: number }
    >
  > {
    const services = {
      ocr: this.ocrEndpoint,
      search: this.semanticSearchEndpoint,
      llm: this.llmEndpoint,
      tts: this.ttsEndpoint,
    };

    const results: Record<string, any> = {};

    for (const [name, url] of Object.entries(services)) {
      const start = Date.now();
      try {
        // Try a simple GET request to the base URL or /health
        // We use a short timeout to fail fast
        await axios.get(url, { timeout: 5000, validateStatus: () => true });
        results[name] = { status: "ok", latency: Date.now() - start };
      } catch (error) {
        const axiosError = error as AxiosError;
        results[name] = {
          status: "error",
          message: axiosError.message,
          latency: Date.now() - start,
        };
      }
    }
    return results;
  }

  // ===== GraphRAG Integration =====

  async extractEntitiesFromDocument(docId: string): Promise<any> {
    const doc = this.documentsCache.get(this.getPathFromId(docId));
    if (!doc) {
      throw new DmsError("Dokument nicht gefunden", "FILE_NOT_FOUND");
    }

    const text =
      doc.ocrText || (await this.runOcrFallback(vscode.Uri.file(doc.path)));

    try {
      const response = await axios.post(
        `${this.graphEndpoint}/extract`,
        {
          doc_id: docId,
          text: text,
          metadata: {
            filename: doc.name,
            tags: doc.tags,
            path: doc.path,
          },
        },
        {
          headers: this.getHeaders(),
          timeout: 30000,
        },
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new DmsError(
          `Graph-Extraktion fehlgeschlagen: ${error.message}`,
          "SERVICE_UNAVAILABLE",
        );
      }
      throw error;
    }
  }

  async queryKnowledgeGraph(
    query: string,
    params: Record<string, any> = {},
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.graphEndpoint}/query`,
        {
          query: query,
          params: params,
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        },
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new DmsError(
          `Graph-Query fehlgeschlagen: ${error.message}`,
          "SERVICE_UNAVAILABLE",
        );
      }
      throw error;
    }
  }

  async getDocumentGraph(docId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.graphEndpoint}/graph/${docId}`, {
        headers: this.getHeaders(),
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new DmsError("Dokument-Graph nicht gefunden", "FILE_NOT_FOUND");
        }
        throw new DmsError(
          `Graph-Abfrage fehlgeschlagen: ${error.message}`,
          "SERVICE_UNAVAILABLE",
        );
      }
      throw error;
    }
  }

  async reindexAll(
    progressCallback?: (
      current: number,
      total: number,
      message: string,
    ) => void,
  ): Promise<{ success: number; failed: number }> {
    const docs = await this.getDocuments();
    let success = 0;
    let failed = 0;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (progressCallback) {
        progressCallback(i + 1, docs.length, `Verarbeite ${doc.name}...`);
      }

      try {
        // 1. Ensure OCR text exists
        if (!doc.ocrText || doc.ocrText.length < 10) {
          // Try to run OCR if missing
          try {
            await this.runOcr(vscode.Uri.file(doc.path));
            // runOcr already indexes, so we can continue
            success++;
            continue;
          } catch (e) {
            console.warn(`OCR failed for ${doc.name} during reindex`, e);
            // If OCR fails, we can't index
            failed++;
            continue;
          }
        }

        // 2. Send to Search Index
        await this.indexDocument(doc);
        success++;
      } catch (error) {
        console.error(`Indexing failed for ${doc.name}`, error);
        failed++;
      }
    }

    return { success, failed };
  }
}
