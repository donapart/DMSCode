import * as vscode from 'vscode';
import { DocumentsTreeProvider } from './providers/DocumentsTreeProvider';
import { TagsTreeProvider } from './providers/TagsTreeProvider';
import { RecentTreeProvider } from './providers/RecentTreeProvider';
import { SearchResultsProvider } from './providers/SearchResultsProvider';
import { DashboardPanel } from './views/DashboardPanel';
import { ScannerPanel } from './views/ScannerPanel';
import { SemanticSearchPanel } from './views/SemanticSearchPanel';
import { CalendarPanel } from './views/CalendarPanel';
import { SpeechPanel } from './views/SpeechPanel';
import { PdfViewerProvider } from './editors/PdfViewerProvider';
import { DmsAssistant } from './chat/DmsAssistant';
import { DmsService } from './services/DmsService';

let dmsService: DmsService;

export function activate(context: vscode.ExtensionContext) {
    console.log('DMSCode Extension wird aktiviert...');

    // Initialize DMS Service
    dmsService = new DmsService(context);

    // ===== Tree View Providers =====
    const documentsProvider = new DocumentsTreeProvider(dmsService);
    const tagsProvider = new TagsTreeProvider(dmsService);
    const recentProvider = new RecentTreeProvider(dmsService);
    const searchResultsProvider = new SearchResultsProvider(dmsService);

    // Register Tree Views
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('dms.documentsView', documentsProvider),
        vscode.window.registerTreeDataProvider('dms.tagsView', tagsProvider),
        vscode.window.registerTreeDataProvider('dms.recentView', recentProvider),
        vscode.window.registerTreeDataProvider('dms.searchResultsView', searchResultsProvider)
    );

    // Refresh Documents Command
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.refreshDocuments', () => {
            documentsProvider.refresh();
            tagsProvider.refresh();
            recentProvider.refresh();
            vscode.window.showInformationMessage('Dokumente aktualisiert');
        })
    );

    // ===== Custom Editor for PDF =====
    context.subscriptions.push(
        PdfViewerProvider.register(context)
    );

    // ===== Chat Participant (AI Assistant) =====
    const dmsAssistant = new DmsAssistant(dmsService);
    context.subscriptions.push(
        vscode.chat.createChatParticipant('dms.assistant', dmsAssistant.handleRequest.bind(dmsAssistant))
    );

    // ===== Commands =====
    
    // Dashboard öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, dmsService);
        })
    );

    // Scanner öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.scanDocument', () => {
            ScannerPanel.createOrShow(context.extensionUri, dmsService);
        })
    );

    // Semantische Suche
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.semanticSearch', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Semantische Suche',
                placeHolder: 'Suchbegriff eingeben...'
            });
            if (query) {
                SemanticSearchPanel.createOrShow(context.extensionUri, dmsService, query);
            }
        })
    );

    // PDF Viewer öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.openPdfViewer', async (uri?: vscode.Uri) => {
            if (!uri) {
                const files = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    filters: { 'PDF': ['pdf'] }
                });
                if (files && files.length > 0) {
                    uri = files[0];
                }
            }
            if (uri) {
                await vscode.commands.executeCommand('vscode.openWith', uri, 'dms.pdfViewer');
            }
        })
    );

    // OCR ausführen
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.runOcr', async (uri?: vscode.Uri) => {
            const editor = vscode.window.activeTextEditor;
            const targetUri = uri || editor?.document.uri;
            
            if (targetUri) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'OCR wird ausgeführt...',
                    cancellable: false
                }, async () => {
                    try {
                        const text = await dmsService.runOcr(targetUri);
                        const doc = await vscode.workspace.openTextDocument({
                            content: text,
                            language: 'plaintext'
                        });
                        await vscode.window.showTextDocument(doc);
                        vscode.window.showInformationMessage('OCR erfolgreich abgeschlossen!');
                    } catch (error) {
                        vscode.window.showErrorMessage(`OCR Fehler: ${error}`);
                    }
                });
            }
        })
    );

    // AI Chat
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.aiChat', async () => {
            // Öffne den Chat-Panel mit @dms
            await vscode.commands.executeCommand('workbench.action.chat.open', '@dms');
        })
    );

    // Text-to-Speech
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.textToSpeech', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const selection = editor.selection;
                const text = selection.isEmpty 
                    ? editor.document.getText() 
                    : editor.document.getText(selection);
                
                await dmsService.textToSpeech(text);
                vscode.window.showInformationMessage('TTS gestartet');
            }
        })
    );

    // Speech-to-Text
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.speechToText', async () => {
            vscode.window.showInformationMessage('STT: Sprechen Sie jetzt...');
            const text = await dmsService.speechToText();
            if (text) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    editor.edit(editBuilder => {
                        editBuilder.insert(editor.selection.active, text);
                    });
                }
            }
        })
    );

    // Kalender öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.openCalendar', () => {
            CalendarPanel.createOrShow(context.extensionUri, dmsService);
        })
    );

    // Speech Panel öffnen (für STT)
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.speechToText', async () => {
            SpeechPanel.createOrShow(context.extensionUri, dmsService);
        })
    );

    // === Tag Management Commands ===
    
    // Tag zu Dokument hinzufügen
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.addTag', async (item?: { document?: { id: string } }) => {
            const tag = await vscode.window.showInputBox({
                prompt: 'Neuen Tag eingeben',
                placeHolder: 'z.B. wichtig, rechnung, 2024'
            });
            if (tag && item?.document?.id) {
                await dmsService.addTagToDocument(item.document.id, tag.trim());
                documentsProvider.refresh();
                tagsProvider.refresh();
                vscode.window.showInformationMessage(`Tag "${tag}" hinzugefügt`);
            }
        })
    );

    // Tag von Dokument entfernen
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.removeTag', async (item?: { document?: { id: string; tags: string[] } }) => {
            if (!item?.document?.tags?.length) {
                vscode.window.showWarningMessage('Keine Tags zum Entfernen vorhanden');
                return;
            }
            const tag = await vscode.window.showQuickPick(item.document.tags, {
                placeHolder: 'Tag zum Entfernen auswählen'
            });
            if (tag) {
                await dmsService.removeTagFromDocument(item.document.id, tag);
                documentsProvider.refresh();
                tagsProvider.refresh();
                vscode.window.showInformationMessage(`Tag "${tag}" entfernt`);
            }
        })
    );

    // Tag umbenennen (global)
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.renameTag', async () => {
            const tags = await dmsService.getTags();
            if (tags.length === 0) {
                vscode.window.showWarningMessage('Keine Tags vorhanden');
                return;
            }
            const oldTag = await vscode.window.showQuickPick(tags, {
                placeHolder: 'Tag zum Umbenennen auswählen'
            });
            if (!oldTag) return;
            
            const newTag = await vscode.window.showInputBox({
                prompt: `"${oldTag}" umbenennen zu:`,
                value: oldTag
            });
            if (newTag && newTag !== oldTag) {
                const count = await dmsService.renameTag(oldTag, newTag.trim());
                documentsProvider.refresh();
                tagsProvider.refresh();
                vscode.window.showInformationMessage(`Tag in ${count} Dokument(en) umbenannt`);
            }
        })
    );

    // Tag löschen (global)
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.deleteTag', async () => {
            const tags = await dmsService.getTags();
            if (tags.length === 0) {
                vscode.window.showWarningMessage('Keine Tags vorhanden');
                return;
            }
            const tag = await vscode.window.showQuickPick(tags, {
                placeHolder: 'Tag zum Löschen auswählen'
            });
            if (!tag) return;
            
            const confirm = await vscode.window.showWarningMessage(
                `Tag "${tag}" aus allen Dokumenten entfernen?`,
                { modal: true },
                'Löschen'
            );
            if (confirm === 'Löschen') {
                const count = await dmsService.deleteTag(tag);
                documentsProvider.refresh();
                tagsProvider.refresh();
                vscode.window.showInformationMessage(`Tag aus ${count} Dokument(en) entfernt`);
            }
        })
    );

    // Import
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.importDocuments', async () => {
            const files = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: true,
                canSelectMany: true,
                filters: {
                    'Dokumente': ['pdf', 'docx', 'doc', 'txt', 'md', 'epub'],
                    'Bilder': ['png', 'jpg', 'jpeg', 'tiff', 'bmp']
                }
            });
            if (files && files.length > 0) {
                await dmsService.importDocuments(files);
                documentsProvider.refresh();
                vscode.window.showInformationMessage(`${files.length} Dokument(e) importiert`);
            }
        })
    );

    // Export
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.exportDocuments', async () => {
            const folder = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false
            });
            if (folder && folder.length > 0) {
                await dmsService.exportDocuments(folder[0]);
                vscode.window.showInformationMessage('Export abgeschlossen');
            }
        })
    );

    // Settings
    context.subscriptions.push(
        vscode.commands.registerCommand('dms.showSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:dmscode.dmscode');
        })
    );

    // ===== Status Bar =====
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(file-text) DMS';
    statusBarItem.tooltip = 'DMSCode - Document Management System';
    statusBarItem.command = 'dms.openDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update document count
    dmsService.getDocumentCount().then(count => {
        statusBarItem.text = `$(file-text) DMS: ${count} Docs`;
    });

    console.log('DMSCode Extension erfolgreich aktiviert!');
}

export function deactivate() {
    console.log('DMSCode Extension wird deaktiviert...');
}
