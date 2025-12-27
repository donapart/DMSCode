import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Type definitions for tests
interface TestDocument {
    id: string;
    name: string;
    path: string;
    type: string;
    tags: string[];
    createdAt: Date;
    modifiedAt: Date;
    ocrText?: string;
}

interface MockContext {
    globalState: {
        get: <T>() => T | undefined;
        update: () => Promise<void>;
    };
    globalStorageUri: { fsPath: string };
}

// Mock DmsService for testing
class MockDmsService {
    private documents: TestDocument[] = [];
    private tempDir: string;

    constructor() {
        this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-test-'));
    }

    get documentsPath(): string {
        return this.tempDir;
    }

    get context(): MockContext {
        return {
            globalState: {
                get: <T>() => ({} as T),
                update: () => Promise.resolve()
            },
            globalStorageUri: { fsPath: this.tempDir }
        };
    }

    async getDocuments(): Promise<TestDocument[]> {
        return this.documents;
    }

    async getDocumentCount(): Promise<number> {
        return this.documents.length;
    }

    async getTags(): Promise<string[]> {
        const tags = new Set<string>();
        for (const doc of this.documents) {
            doc.tags?.forEach((tag: string) => tags.add(tag));
        }
        return Array.from(tags);
    }

    async getRecentDocuments(limit: number = 10): Promise<TestDocument[]> {
        return this.documents
            .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
            .slice(0, limit);
    }

    addTestDocument(doc: Partial<TestDocument>): void {
        this.documents.push({
            id: doc.id || `doc-${Date.now()}`,
            name: doc.name || 'test.pdf',
            path: doc.path || path.join(this.tempDir, doc.name || 'test.pdf'),
            type: doc.type || 'pdf',
            tags: doc.tags || [],
            createdAt: doc.createdAt || new Date(),
            modifiedAt: doc.modifiedAt || new Date(),
            ...doc
        } as TestDocument);
    }

    cleanup(): void {
        try {
            fs.rmSync(this.tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

suite('DmsService Test Suite', () => {
    let mockService: MockDmsService;

    setup(() => {
        mockService = new MockDmsService();
    });

    teardown(() => {
        mockService.cleanup();
    });

    test('getDocuments returns empty array initially', async () => {
        const docs = await mockService.getDocuments();
        assert.strictEqual(docs.length, 0);
    });

    test('getDocumentCount returns correct count', async () => {
        mockService.addTestDocument({ name: 'doc1.pdf' });
        mockService.addTestDocument({ name: 'doc2.pdf' });
        
        const count = await mockService.getDocumentCount();
        assert.strictEqual(count, 2);
    });

    test('getTags returns unique tags', async () => {
        mockService.addTestDocument({ name: 'doc1.pdf', tags: ['invoice', 'important'] });
        mockService.addTestDocument({ name: 'doc2.pdf', tags: ['invoice', 'archived'] });
        
        const tags = await mockService.getTags();
        assert.strictEqual(tags.length, 3);
        assert.ok(tags.includes('invoice'));
        assert.ok(tags.includes('important'));
        assert.ok(tags.includes('archived'));
    });

    test('getRecentDocuments returns sorted documents', async () => {
        const oldDate = new Date('2024-01-01');
        const newDate = new Date('2024-12-01');
        
        mockService.addTestDocument({ name: 'old.pdf', modifiedAt: oldDate });
        mockService.addTestDocument({ name: 'new.pdf', modifiedAt: newDate });
        
        const recent = await mockService.getRecentDocuments(10);
        assert.strictEqual(recent[0].name, 'new.pdf');
        assert.strictEqual(recent[1].name, 'old.pdf');
    });

    test('getRecentDocuments respects limit', async () => {
        for (let i = 0; i < 20; i++) {
            mockService.addTestDocument({ name: `doc${i}.pdf` });
        }
        
        const recent = await mockService.getRecentDocuments(5);
        assert.strictEqual(recent.length, 5);
    });
});

suite('Document Validation Tests', () => {
    test('validates supported file extensions', () => {
        const supportedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.epub', '.png', '.jpg', '.jpeg', '.tiff'];
        const unsupportedExtensions = ['.exe', '.dll', '.bat', '.sh'];
        
        const isSupportedFile = (filename: string): boolean => {
            const ext = path.extname(filename).toLowerCase();
            return supportedExtensions.includes(ext);
        };
        
        assert.ok(isSupportedFile('document.pdf'));
        assert.ok(isSupportedFile('image.PNG'));
        assert.ok(isSupportedFile('text.txt'));
        assert.ok(!isSupportedFile('program.exe'));
        assert.ok(!isSupportedFile('script.bat'));
    });

    test('creates valid document entry', () => {
        const createDocumentEntry = (filePath: string): TestDocument => {
            const ext = path.extname(filePath).toLowerCase();
            return {
                id: Buffer.from(filePath).toString('base64'),
                name: path.basename(filePath),
                path: filePath,
                type: ext.replace('.', ''),
                tags: [],
                createdAt: new Date(),
                modifiedAt: new Date()
            };
        };
        
        const doc = createDocumentEntry('/test/document.pdf');
        
        assert.strictEqual(doc.name, 'document.pdf');
        assert.strictEqual(doc.type, 'pdf');
        assert.ok(doc.id.length > 0);
        assert.ok(Array.isArray(doc.tags));
    });
});

suite('Search Functionality Tests', () => {
    test('simple search matches document name', async () => {
        const documents = [
            { name: 'Invoice_2024.pdf', tags: ['invoice'] },
            { name: 'Contract.pdf', tags: ['legal'] },
            { name: 'Receipt_Invoice.pdf', tags: ['finance'] }
        ];
        
        const simpleSearch = (query: string) => {
            const queryLower = query.toLowerCase();
            return documents.filter(doc => 
                doc.name.toLowerCase().includes(queryLower) ||
                doc.tags.some(t => t.toLowerCase().includes(queryLower))
            );
        };
        
        const results = simpleSearch('invoice');
        assert.strictEqual(results.length, 3); // 2 by name, 1 by tag (invoice_2024 has both)
    });

    test('search is case insensitive', async () => {
        const documents = [
            { name: 'IMPORTANT.pdf', tags: [] },
            { name: 'Important.pdf', tags: [] },
            { name: 'important.pdf', tags: [] }
        ];
        
        const simpleSearch = (query: string) => {
            const queryLower = query.toLowerCase();
            return documents.filter(doc => 
                doc.name.toLowerCase().includes(queryLower)
            );
        };
        
        const results = simpleSearch('important');
        assert.strictEqual(results.length, 3);
    });
});

suite('Tag Management Tests', () => {
    interface TaggableDocument {
        tags: string[];
    }

    test('addTag adds new tag to document', () => {
        const doc: TaggableDocument = { tags: ['existing'] };
        
        const addTag = (document: TaggableDocument, tag: string) => {
            if (!document.tags.includes(tag)) {
                document.tags.push(tag);
            }
        };
        
        addTag(doc, 'new');
        assert.strictEqual(doc.tags.length, 2);
        assert.ok(doc.tags.includes('new'));
    });

    test('addTag prevents duplicates', () => {
        const doc: TaggableDocument = { tags: ['existing'] };
        
        const addTag = (document: TaggableDocument, tag: string) => {
            if (!document.tags.includes(tag)) {
                document.tags.push(tag);
            }
        };
        
        addTag(doc, 'existing');
        assert.strictEqual(doc.tags.length, 1);
    });

    test('removeTag removes tag from document', () => {
        const doc: TaggableDocument = { tags: ['tag1', 'tag2', 'tag3'] };
        
        const removeTag = (document: TaggableDocument, tag: string) => {
            document.tags = document.tags.filter((t: string) => t !== tag);
        };
        
        removeTag(doc, 'tag2');
        assert.strictEqual(doc.tags.length, 2);
        assert.ok(!doc.tags.includes('tag2'));
    });

    test('renameTag updates all occurrences', () => {
        const documents: TaggableDocument[] = [
            { tags: ['old-tag', 'other'] },
            { tags: ['old-tag'] },
            { tags: ['different'] }
        ];
        
        const renameTag = (docs: TaggableDocument[], oldTag: string, newTag: string) => {
            docs.forEach(doc => {
                const index = doc.tags.indexOf(oldTag);
                if (index !== -1) {
                    doc.tags[index] = newTag;
                }
            });
        };
        
        renameTag(documents, 'old-tag', 'new-tag');
        
        assert.ok(documents[0].tags.includes('new-tag'));
        assert.ok(documents[1].tags.includes('new-tag'));
        assert.ok(!documents[0].tags.includes('old-tag'));
    });
});

suite('Date Formatting Tests', () => {
    test('getRelativeTime returns correct values', () => {
        const getRelativeTime = (date: Date): string => {
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (minutes < 1) return 'gerade eben';
            if (minutes < 60) return `vor ${minutes} Min.`;
            if (hours < 24) return `vor ${hours} Std.`;
            if (days < 7) return `vor ${days} Tagen`;
            return date.toLocaleDateString('de-DE');
        };
        
        const now = new Date();
        
        assert.strictEqual(getRelativeTime(new Date(now.getTime() - 30000)), 'gerade eben');
        assert.strictEqual(getRelativeTime(new Date(now.getTime() - 5 * 60000)), 'vor 5 Min.');
        assert.strictEqual(getRelativeTime(new Date(now.getTime() - 3 * 60 * 60000)), 'vor 3 Std.');
        assert.strictEqual(getRelativeTime(new Date(now.getTime() - 2 * 24 * 60 * 60000)), 'vor 2 Tagen');
    });
});

suite('Error Handling Tests', () => {
    test('DmsError contains proper message and code', () => {
        class DmsError extends Error {
            constructor(
                message: string,
                public readonly code: string,
                public readonly details?: Record<string, unknown>
            ) {
                super(message);
                this.name = 'DmsError';
            }
        }
        
        const error = new DmsError('Service nicht erreichbar', 'SERVICE_UNAVAILABLE', { service: 'ocr' });
        
        assert.strictEqual(error.message, 'Service nicht erreichbar');
        assert.strictEqual(error.code, 'SERVICE_UNAVAILABLE');
        assert.strictEqual(error.details?.service, 'ocr');
    });
});
