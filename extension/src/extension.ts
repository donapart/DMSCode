import * as path from "path";
import * as vscode from "vscode";
import { DmsAssistant } from "./chat/DmsAssistant";
import { PdfViewerProvider } from "./editors/PdfViewerProvider";
import { DocumentsTreeProvider } from "./providers/DocumentsTreeProvider";
import { RecentTreeProvider } from "./providers/RecentTreeProvider";
import { SearchResultsProvider } from "./providers/SearchResultsProvider";
import { TagsTreeProvider } from "./providers/TagsTreeProvider";
import { DmsService } from "./services/DmsService";
import { CalendarPanel } from "./views/CalendarPanel";
import { DashboardPanel } from "./views/DashboardPanel";
import { DocumentDetailsPanel } from "./views/DocumentDetailsPanel";
import { ScannerPanel } from "./views/ScannerPanel";
import { SemanticSearchPanel } from "./views/SemanticSearchPanel";
import { SpeechPanel } from "./views/SpeechPanel";

let dmsService: DmsService;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log("DMSCode Extension wird aktiviert...");

  // Initialize DMS Service
  dmsService = new DmsService(context);

  // ===== StatusBar Item =====
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "dms.openDashboard";
  context.subscriptions.push(statusBarItem);
  updateStatusBar();

  // ===== Welcome Message (First Start) =====
  const hasSeenWelcome = context.globalState.get<boolean>(
    "dms.hasSeenWelcome",
    false
  );
  if (!hasSeenWelcome) {
    showWelcomeMessage(context);
  }

  // ===== Tree View Providers =====
  const documentsProvider = new DocumentsTreeProvider(dmsService);
  const tagsProvider = new TagsTreeProvider(dmsService);
  const recentProvider = new RecentTreeProvider(dmsService);
  const searchResultsProvider = new SearchResultsProvider(dmsService);

  // Register Tree Views
  // Use createTreeView for documents to enable multi-select
  context.subscriptions.push(
    vscode.window.createTreeView("dms.documentsView", {
      treeDataProvider: documentsProvider,
      canSelectMany: true,
    }),
    vscode.window.registerTreeDataProvider("dms.tagsView", tagsProvider),
    vscode.window.registerTreeDataProvider("dms.recentView", recentProvider),
    vscode.window.registerTreeDataProvider(
      "dms.searchResultsView",
      searchResultsProvider
    )
  );

  // Auto-Refresh when documents change
  context.subscriptions.push(
    dmsService.onDidDocumentsChange(() => {
      documentsProvider.refresh();
      tagsProvider.refresh();
      recentProvider.refresh();
    })
  );

  // Refresh Documents Command
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.refreshDocuments", () => {
      documentsProvider.refresh();
      tagsProvider.refresh();
      recentProvider.refresh();
      vscode.window.showInformationMessage("Dokumente aktualisiert");
    })
  );

  // ===== Custom Editor for PDF =====
  context.subscriptions.push(PdfViewerProvider.register(context));

  // ===== Chat Participant (AI Assistant) =====
  const dmsAssistant = new DmsAssistant(dmsService);
  context.subscriptions.push(
    vscode.chat.createChatParticipant(
      "dms.assistant",
      dmsAssistant.handleRequest.bind(dmsAssistant)
    )
  );

  // ===== Commands =====

  // Import Documents
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.importDocuments", async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: "Importieren",
      });

      if (uris && uris.length > 0) {
        const strategy = await vscode.window.showQuickPick(
          [
            {
              label: "Umbenennen",
              description: "Automatisch nummerieren bei Konflikten",
              picked: true,
              value: "rename",
            },
            {
              label: "Überschreiben",
              description: "Existierende Dateien ersetzen",
              value: "overwrite",
            },
            {
              label: "Überspringen",
              description: "Existierende Dateien behalten",
              value: "skip",
            },
          ],
          { placeHolder: "Konfliktstrategie wählen" }
        );

        if (strategy) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Importiere Dokumente...",
            },
            async () => {
              const count = await dmsService.importDocuments(
                uris,
                strategy.value as any
              );
              vscode.window.showInformationMessage(
                `${count} Dokument(e) erfolgreich importiert.`
              );
              documentsProvider.refresh();
            }
          );
        }
      }
    })
  );

  // Export Documents
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.exportDocuments", async () => {
      const targetUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Exportieren nach...",
      });

      if (targetUri && targetUri.length > 0) {
        const filterOption = await vscode.window.showQuickPick(
          [
            { label: "Alle Dokumente", value: "all" },
            { label: "Nach Tag filtern", value: "tag" },
            { label: "Nur neue (letzte 30 Tage)", value: "recent" },
          ],
          { placeHolder: "Export-Filter wählen" }
        );

        if (!filterOption) return;

        let filter: { tag?: string; after?: Date } | undefined;

        if (filterOption.value === "tag") {
          const tags = await dmsService.getTags();
          const selectedTag = await vscode.window.showQuickPick(tags, {
            placeHolder: "Tag auswählen",
          });
          if (!selectedTag) return;
          filter = { tag: selectedTag };
        } else if (filterOption.value === "recent") {
          const date = new Date();
          date.setDate(date.getDate() - 30);
          filter = { after: date };
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Exportiere Dokumente...",
          },
          async () => {
            const count = await dmsService.exportDocuments(
              targetUri[0],
              filter
            );
            vscode.window.showInformationMessage(
              `${count} Dokument(e) erfolgreich exportiert.`
            );
          }
        );
      }
    })
  );

  // System Health Check
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.checkHealth", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Prüfe Systemstatus...",
        },
        async () => {
          const health = await dmsService.checkHealth();
          const statusItems = Object.entries(health).map(([service, info]) => {
            const icon = info.status === "ok" ? "✅" : "❌";
            return `${icon} **${service.toUpperCase()}**: ${info.status} (${
              info.latency
            }ms)${info.message ? ` - ${info.message}` : ""}`;
          });

          const message = `### System Status\n\n${statusItems.join("\n")}`;

          // Show as markdown preview or info message? Info message is too small.
          // Let's use a modal dialog for now or just output channel.
          // Better: Create a temporary markdown document.
          const doc = await vscode.workspace.openTextDocument({
            content: message,
            language: "markdown",
          });
          await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside,
          });
        }
      );
    })
  );

  // Reindex All
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.reindexAll", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Möchten Sie wirklich alle Dokumente neu indexieren? Dies kann einige Zeit dauern.",
        "Ja, starten",
        "Abbrechen"
      );

      if (confirm !== "Ja, starten") return;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Indexiere Dokumente...",
          cancellable: true,
        },
        async (progress, token) => {
          const result = await dmsService.reindexAll((current, total, msg) => {
            progress.report({
              message: `${msg} (${current}/${total})`,
              increment: 100 / total,
            });
          });

          vscode.window.showInformationMessage(
            `Re-Indexierung abgeschlossen.\nErfolgreich: ${result.success}\nFehlgeschlagen: ${result.failed}`
          );
        }
      );
    })
  );

  // Dashboard öffnen
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.openDashboard", () => {
      DashboardPanel.createOrShow(context.extensionUri, dmsService);
    })
  );

  // Scanner öffnen
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.scanDocument", () => {
      ScannerPanel.createOrShow(context.extensionUri, dmsService);
    })
  );

  // Semantische Suche
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.semanticSearch",
      async (initialQuery?: string) => {
        let query = initialQuery;

        if (!query) {
          query = await vscode.window.showInputBox({
            prompt: "Semantische Suche",
            placeHolder: "Suchbegriff eingeben...",
          });
        }

        if (query) {
          SemanticSearchPanel.createOrShow(
            context.extensionUri,
            dmsService,
            searchResultsProvider,
            query
          );
        }
      }
    )
  );

  // PDF Viewer öffnen
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.openPdfViewer",
      async (uri?: vscode.Uri) => {
        if (!uri) {
          const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            filters: { PDF: ["pdf"] },
          });
          if (files && files.length > 0) {
            uri = files[0];
          }
        }
        if (uri) {
          await vscode.commands.executeCommand(
            "vscode.openWith",
            uri,
            "dms.pdfViewer"
          );
        }
      }
    )
  );

  // OCR ausführen
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.runOcr",
      async (item?: any, items?: any[]) => {
        let targets: vscode.Uri[] = [];

        if (items && items.length > 0) {
          targets = items.map((i) => vscode.Uri.file(i.document.path));
        } else if (item?.document?.path) {
          targets = [vscode.Uri.file(item.document.path)];
        } else if (item instanceof vscode.Uri) {
          targets = [item];
        } else {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            targets = [editor.document.uri];
          }
        }

        if (targets.length === 0) {
          const docs = await dmsService.getDocuments();
          const picked = await vscode.window.showQuickPick(
            docs.map((d) => ({
              label: d.name,
              description: d.path,
              document: d,
            })),
            { placeHolder: "Dokument(e) für OCR auswählen", canPickMany: true }
          );
          if (picked) {
            targets = picked.map((p) => vscode.Uri.file(p.document.path));
          }
        }

        if (targets.length === 0) {
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "OCR & Indexierung wird ausgeführt...",
            cancellable: true,
          },
          async (progress, token) => {
            let successCount = 0;
            let failCount = 0;
            let lastText = "";

            for (let i = 0; i < targets.length; i++) {
              if (token.isCancellationRequested) {
                break;
              }
              const uri = targets[i];
              progress.report({
                message: `${path.basename(uri.fsPath)} (${i + 1}/${
                  targets.length
                })`,
                increment: 100 / targets.length,
              });

              try {
                lastText = await dmsService.runOcr(uri);
                successCount++;
              } catch (error) {
                console.error(`OCR Fehler bei ${uri.fsPath}:`, error);
                failCount++;
              }
            }

            if (failCount === 0) {
              vscode.window.showInformationMessage(
                `OCR für ${successCount} Dokument(e) erfolgreich!`
              );
            } else {
              vscode.window.showWarningMessage(
                `OCR abgeschlossen: ${successCount} erfolgreich, ${failCount} fehlgeschlagen.`
              );
            }

            if (targets.length === 1 && successCount === 1 && lastText) {
              const doc = await vscode.workspace.openTextDocument({
                content: lastText,
                language: "plaintext",
              });
              await vscode.window.showTextDocument(doc);
            }
          }
        );
      }
    )
  );

  // AI Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.aiChat", async () => {
      // Öffne den Chat-Panel mit @dms
      await vscode.commands.executeCommand(
        "workbench.action.chat.open",
        "@dms"
      );
    })
  );

  // Chat mit Dokument
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.chatWithDocument",
      async (item?: any) => {
        let docPath: string | undefined;

        if (item?.document?.path) {
          docPath = item.document.path;
        } else {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            docPath = editor.document.uri.fsPath;
          }
        }

        if (docPath) {
          // Open document first to ensure it's the active editor for context
          const doc = await vscode.workspace.openTextDocument(docPath);
          await vscode.window.showTextDocument(doc);

          // Open Chat with a prompt that implies context usage
          await vscode.commands.executeCommand(
            "workbench.action.chat.open",
            "@dms Fasse dieses Dokument zusammen und beantworte Fragen dazu."
          );
        } else {
          vscode.window.showWarningMessage(
            "Bitte wählen Sie ein Dokument aus."
          );
        }
      }
    )
  );

  // Text-to-Speech
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.textToSpeech", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.selection;
        const text = selection.isEmpty
          ? editor.document.getText()
          : editor.document.getText(selection);

        await dmsService.textToSpeech(text);
        vscode.window.showInformationMessage("TTS gestartet");
      }
    })
  );

  // Speech-to-Text
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.speechToText", async () => {
      vscode.window.showInformationMessage("STT: Sprechen Sie jetzt...");
      const text = await dmsService.speechToText();
      if (text) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, text);
          });
        }
      }
    })
  );

  // Kalender öffnen
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.openCalendar", () => {
      CalendarPanel.createOrShow(context.extensionUri, dmsService);
    })
  );

  // Dokument Details anzeigen
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.showDetails", async (item?: any) => {
      let doc: any;
      if (item?.document) {
        doc = item.document;
      } else {
        const docs = await dmsService.getDocuments();
        const picked = await vscode.window.showQuickPick(
          docs.map((d) => ({
            label: d.name,
            description: d.path,
            document: d,
          })),
          { placeHolder: "Dokument auswählen" }
        );
        if (picked) {
          doc = picked.document;
        }
      }

      if (doc) {
        DocumentDetailsPanel.createOrShow(
          context.extensionUri,
          dmsService,
          doc
        );
      }
    })
  );

  // Speech Panel öffnen
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.openSpeechPanel", async () => {
      SpeechPanel.createOrShow(context.extensionUri, dmsService);
    })
  );

  // === Tag Management Commands ===

  // Tag zu Dokument hinzufügen
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.addTag",
      async (item?: any, items?: any[]) => {
        let targets: any[] = [];
        if (items && items.length > 0) {
          targets = items;
        } else if (item) {
          targets = [item];
        } else {
          const docs = await dmsService.getDocuments();
          const picked = await vscode.window.showQuickPick(
            docs.map((d) => ({
              label: d.name,
              description: d.path,
              document: d,
            })),
            { placeHolder: "Dokument(e) auswählen", canPickMany: true }
          );
          if (picked) {
            targets = picked.map((p) => ({ document: p.document }));
          }
        }

        if (!targets || targets.length === 0) {
          return;
        }

        const tag = await vscode.window.showInputBox({
          prompt: "Neuen Tag eingeben",
          placeHolder: "z.B. wichtig, rechnung, 2024",
        });

        if (tag) {
          const cleanTag = tag.trim();
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Füge Tag "${cleanTag}" zu ${targets.length} Dokument(en) hinzu...`,
            },
            async () => {
              for (const t of targets) {
                if (t.document?.id) {
                  await dmsService.addTagToDocument(t.document.id, cleanTag);
                }
              }
            }
          );
          documentsProvider.refresh();
          tagsProvider.refresh();
          vscode.window.showInformationMessage(
            `Tag "${cleanTag}" zu ${targets.length} Dokument(en) hinzugefügt`
          );
        }
      }
    )
  );

  // Auto-Tagging (AI)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.autoTag",
      async (item?: any, items?: any[]) => {
        let targets: any[] = [];
        if (items && items.length > 0) {
          targets = items;
        } else if (item) {
          targets = [item];
        } else {
          const docs = await dmsService.getDocuments();
          const picked = await vscode.window.showQuickPick(
            docs.map((d) => ({
              label: d.name,
              description: d.path,
              document: d,
            })),
            {
              placeHolder: "Dokument(e) für Auto-Tagging auswählen",
              canPickMany: true,
            }
          );
          if (picked) {
            targets = picked.map((p) => ({ document: p.document }));
          }
        }

        if (!targets || targets.length === 0) {
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Generiere Tags für ${targets.length} Dokument(e)...`,
            cancellable: true,
          },
          async (progress, token) => {
            for (let i = 0; i < targets.length; i++) {
              if (token.isCancellationRequested) break;
              const doc = targets[i].document;
              progress.report({
                message: doc.name,
                increment: 100 / targets.length,
              });

              try {
                const newTags = await dmsService.autoTagDocument(doc.id);
                console.log(`Auto-tagged ${doc.name}: ${newTags.join(", ")}`);
              } catch (e) {
                console.error(`Auto-tagging failed for ${doc.name}:`, e);
              }
            }

            documentsProvider.refresh();
            tagsProvider.refresh();
            vscode.window.showInformationMessage(`Auto-Tagging abgeschlossen.`);
          }
        );
      }
    )
  );

  // Tag von Dokument entfernen
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.removeTag",
      async (item?: any, items?: any[]) => {
        let targets: any[] = [];
        if (items && items.length > 0) {
          targets = items;
        } else if (item) {
          targets = [item];
        } else {
          const docs = await dmsService.getDocuments();
          const picked = await vscode.window.showQuickPick(
            docs.map((d) => ({
              label: d.name,
              description: d.path,
              document: d,
            })),
            { placeHolder: "Dokument(e) auswählen", canPickMany: true }
          );
          if (picked) {
            targets = picked.map((p) => ({ document: p.document }));
          }
        }

        if (!targets || targets.length === 0) {
          return;
        }

        let tagToRemove: string | undefined;

        if (targets.length === 1) {
          const doc = targets[0].document;
          if (!doc.tags || doc.tags.length === 0) {
            vscode.window.showWarningMessage(
              "Keine Tags zum Entfernen vorhanden"
            );
            return;
          }
          tagToRemove = await vscode.window.showQuickPick(doc.tags, {
            placeHolder: "Tag zum Entfernen auswählen",
          });
        } else {
          tagToRemove = await vscode.window.showInputBox({
            prompt: "Tag zum Entfernen eingeben (gilt für alle ausgewählten)",
            placeHolder: "Tag Name",
          });
        }

        if (tagToRemove) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Entferne Tag "${tagToRemove}" von ${targets.length} Dokument(en)...`,
            },
            async () => {
              for (const t of targets) {
                if (t.document?.id) {
                  await dmsService.removeTagFromDocument(
                    t.document.id,
                    tagToRemove!
                  );
                }
              }
            }
          );
          documentsProvider.refresh();
          tagsProvider.refresh();
          vscode.window.showInformationMessage(
            `Tag "${tagToRemove}" von ${targets.length} Dokument(en) entfernt`
          );
        }
      }
    )
  );

  // Dokumente vergleichen (AI)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.compareDocuments",
      async (item?: any, items?: any[]) => {
        let targets: any[] = [];
        if (items && items.length === 2) {
          targets = items;
        } else {
          // Fallback: QuickPick for 2 docs
          const docs = await dmsService.getDocuments();
          const picked = await vscode.window.showQuickPick(
            docs.map((d) => ({
              label: d.name,
              description: d.path,
              document: d,
            })),
            {
              placeHolder: "Wähle exakt 2 Dokumente zum Vergleich",
              canPickMany: true,
            }
          );
          if (picked && picked.length === 2) {
            targets = picked.map((p) => ({ document: p.document }));
          }
        }

        if (!targets || targets.length !== 2) {
          vscode.window.showWarningMessage(
            "Bitte wählen Sie genau 2 Dokumente für den Vergleich aus."
          );
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Vergleiche Dokumente...",
          },
          async () => {
            try {
              const result = await dmsService.compareDocuments(
                targets[0].document.id,
                targets[1].document.id
              );
              const doc = await vscode.workspace.openTextDocument({
                content: result,
                language: "markdown",
              });
              await vscode.window.showTextDocument(doc);
            } catch (error) {
              vscode.window.showErrorMessage(`Fehler beim Vergleich: ${error}`);
            }
          }
        );
      }
    )
  );

  // Daten extrahieren (AI)
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.extractData", async (item?: any) => {
      let docId: string | undefined;
      if (item?.document?.id) {
        docId = item.document.id;
      } else {
        const docs = await dmsService.getDocuments();
        const picked = await vscode.window.showQuickPick(
          docs.map((d) => ({
            label: d.name,
            description: d.path,
            document: d,
          })),
          { placeHolder: "Dokument auswählen" }
        );
        if (picked) {
          docId = picked.document.id;
        }
      }

      if (!docId) return;

      const template = await vscode.window.showQuickPick(
        [
          {
            label: "Rechnung",
            value: "invoice",
            description: "Nummer, Datum, Betrag, IBAN...",
          },
          {
            label: "Vertrag",
            value: "contract",
            description: "Partner, Laufzeit, Kosten...",
          },
          {
            label: "Allgemein",
            value: "generic",
            description: "Zusammenfassung, Wichtige Daten",
          },
        ],
        { placeHolder: "Extraktions-Template wählen" }
      );

      if (template) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Extrahiere Daten (${template.label})...`,
          },
          async () => {
            try {
              const result = await dmsService.extractStructuredData(
                docId!,
                template.value as any
              );
              const doc = await vscode.workspace.openTextDocument({
                content: result,
                language: "json",
              });
              await vscode.window.showTextDocument(doc);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Fehler bei der Extraktion: ${error}`
              );
            }
          }
        );
      }
    })
  );

  // Tag löschen (global)
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.deleteTag", async () => {
      const tags = await dmsService.getTags();
      if (tags.length === 0) {
        vscode.window.showWarningMessage("Keine Tags vorhanden");
        return;
      }
      const tag = await vscode.window.showQuickPick(tags, {
        placeHolder: "Tag zum Löschen auswählen",
      });
      if (!tag) return;

      const confirm = await vscode.window.showWarningMessage(
        `Tag "${tag}" aus allen Dokumenten entfernen?`,
        { modal: true },
        "Löschen"
      );
      if (confirm === "Löschen") {
        const count = await dmsService.deleteTag(tag);
        documentsProvider.refresh();
        tagsProvider.refresh();
        vscode.window.showInformationMessage(
          `Tag aus ${count} Dokument(en) entfernt`
        );
      }
    })
  );

  // Auto-Rename
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dms.autoRename",
      async (item?: { document?: { id: string } }) => {
        if (!item?.document?.id) {
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "AI analysiert Dokument und generiert Dateinamen...",
            cancellable: false,
          },
          async () => {
            try {
              const newName = await dmsService.autoRenameDocument(
                item.document!.id
              );
              vscode.window.showInformationMessage(`Umbenannt zu: ${newName}`);
              // Refresh happens automatically via FileWatcher event
            } catch (error) {
              vscode.window.showErrorMessage(
                `Fehler beim Umbenennen: ${error}`
              );
            }
          }
        );
      }
    )
  );

  // Import
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.importDocuments", async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: true,
        filters: {
          Dokumente: ["pdf", "docx", "doc", "txt", "md", "epub"],
          Bilder: ["png", "jpg", "jpeg", "tiff", "bmp"],
        },
      });
      if (files && files.length > 0) {
        await dmsService.importDocuments(files);
        documentsProvider.refresh();
        vscode.window.showInformationMessage(
          `${files.length} Dokument(e) importiert`
        );
      }
    })
  );

  // Export
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.exportDocuments", async () => {
      const folder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
      });
      if (folder && folder.length > 0) {
        await dmsService.exportDocuments(folder[0]);
        vscode.window.showInformationMessage("Export abgeschlossen");
      }
    })
  );

  // Settings
  context.subscriptions.push(
    vscode.commands.registerCommand("dms.showSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:dmscode.dmscode"
      );
    })
  );

  // Update StatusBar when documents change
  dmsService.onDidDocumentsChange(() => {
    updateStatusBar();
  });

  console.log("DMSCode Extension erfolgreich aktiviert!");
}

// ===== Helper Functions =====

async function updateStatusBar() {
  if (!statusBarItem || !dmsService) return;

  try {
    const count = await dmsService.getDocumentCount();
    statusBarItem.text = `$(file-text) DMS: ${count}`;
    statusBarItem.tooltip = `DMSCode - ${count} Dokumente\nKlicken für Dashboard`;
    statusBarItem.show();
  } catch {
    statusBarItem.text = "$(file-text) DMS";
    statusBarItem.tooltip = "DMSCode - Document Management System";
    statusBarItem.show();
  }
}

async function showWelcomeMessage(context: vscode.ExtensionContext) {
  const action = await vscode.window.showInformationMessage(
    "🎉 Willkommen bei DMSCode! Ihr Document Management System für VS Code ist bereit.",
    "Dashboard öffnen",
    "Einrichten",
    "Später"
  );

  if (action === "Dashboard öffnen") {
    vscode.commands.executeCommand("dms.openDashboard");
  } else if (action === "Einrichten") {
    vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      "dmscode.dmscode#dms.gettingStarted"
    );
  }

  // Mark as seen
  context.globalState.update("dms.hasSeenWelcome", true);
}

export function deactivate() {
  console.log("DMSCode Extension wird deaktiviert...");
}
