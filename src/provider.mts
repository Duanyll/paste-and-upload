import * as vscode from 'vscode';
import _ from 'lodash';
import { ResourceFile, ResourceUploader, UploadDestination } from './common.mjs';
import { ResourceFileLoader } from './loader.mjs';
import { S3Uploader } from './s3Uploader.mjs';
import { WorkspaceUploader } from './workspaceUploader.mjs';
import { inspectDataTransfer } from './utils.mjs';

const resourceUploadKind = vscode.DocumentDropOrPasteEditKind.Empty.append('resource-upload');

class ResourceUploadDocumentPasteEdit extends vscode.DocumentPasteEdit {
    constructor(
        public readonly files: ResourceFile[],
        public readonly documentUri: vscode.Uri,
        public readonly languageId: string,
        public readonly ranges: readonly vscode.Range[],
    ) {
        super("", "Upload resource files", resourceUploadKind);
    }
}

class ResourceUploadDocumentDropEdit extends vscode.DocumentDropEdit {
    constructor(
        public readonly files: ResourceFile[],
        public readonly documentUri: vscode.Uri,
        public readonly languageId: string,
        public readonly ranges: readonly vscode.Range[],
    ) {
        super("", "Upload resource files", resourceUploadKind);
    }
}

export class ResourcePasteOrDropProvider implements vscode.DocumentPasteEditProvider<ResourceUploadDocumentPasteEdit>, vscode.DocumentDropEditProvider<ResourceUploadDocumentDropEdit> {
    loaders: { [languageId: string]: ResourceFileLoader } = {};
    uploaders: { [key: string]: ResourceUploader } = {};
    undoHistory: [string, () => Thenable<void>][] = [];
    undoLimit = vscode.workspace.getConfiguration('paste-and-upload').get<number>('undoLimit') ?? 10;
    constructor() {
        console.log('ResourcePasteOrDropProvider created');
    }

    private getLoader(languageId: string): ResourceFileLoader {
        if (!this.loaders[languageId]) {
            this.loaders[languageId] = new ResourceFileLoader(languageId);
        }
        return this.loaders[languageId];
    }

    private getUploader(key: UploadDestination) {
        if (!this.uploaders[key]) {
            switch (key) {
                case 's3':
                    this.uploaders[key] = new S3Uploader();
                    break;
                case 'workspace':
                    this.uploaders[key] = new WorkspaceUploader();
                    break;
                default:
                    throw new Error(`Unknown upload destination ${key}`);
            }
        }
        return this.uploaders[key];
    }

    public async provideDocumentDropEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        dataTransfer: vscode.DataTransfer,
        token: vscode.CancellationToken,
    ): Promise<ResourceUploadDocumentDropEdit[] | undefined> {
        inspectDataTransfer(dataTransfer);
        const loader = this.getLoader(document.languageId);
        const files = await loader.prepareFilesToUpload(dataTransfer);
        if (files.length === 0) {
            return undefined;
        }
        const edit = new ResourceUploadDocumentDropEdit(files, document.uri, document.languageId, [new vscode.Range(position, position)]);
        await this.executeUpload(edit);
        return [edit];
    }

    public async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken,
    ): Promise<ResourceUploadDocumentPasteEdit[] | undefined> {
        inspectDataTransfer(dataTransfer);
        const loader = this.getLoader(document.languageId);
        const files = await loader.prepareFilesToUpload(dataTransfer);
        if (files.length === 0) {
            return undefined;
        }
        return [new ResourceUploadDocumentPasteEdit(files, document.uri, document.languageId, ranges)];
    }

    async executeUpload(edit: ResourceUploadDocumentDropEdit | ResourceUploadDocumentPasteEdit) {
        const loader = this.getLoader(edit.languageId);
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uploader = this.getUploader(loader.getUploadDestination());
        const snippets: string[] = [];
        for (const file of edit.files) {
            try {
                const result = await uploader.uploadFile(file, edit.documentUri, workspaceEdit);
                snippets.push(loader.generateSnippet(file, result.uri));
                if (result.undo) {
                    this.undoHistory.push([result.undoTitle ?? file.name, result.undo]);
                    if (this.undoHistory.length > this.undoLimit) {
                        this.undoHistory.shift();
                    }
                }
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to upload ${file.name}: ${e}`);
            }
        }
        const snippet = snippets.join(' ');
        workspaceEdit.set(edit.documentUri, edit.ranges.map(r => new vscode.SnippetTextEdit(r, new vscode.SnippetString(snippet))));
        edit.additionalEdit = workspaceEdit;
    }

    public async resolveDocumentDropEdit(edit: ResourceUploadDocumentDropEdit, token: vscode.CancellationToken): Promise<ResourceUploadDocumentDropEdit> {
        // FIXME: VS Code never calls this method
        console.log('Calling resolveDocumentDropEdit');
        // await this.executeUpload(edit);
        return edit;
    }

    public async resolveDocumentPasteEdit(edit: ResourceUploadDocumentPasteEdit, token: vscode.CancellationToken): Promise<ResourceUploadDocumentPasteEdit> {
        await this.executeUpload(edit);
        return edit;
    }

    async showUndoMenu() {
        const items = this.undoHistory.map(([title, undo], index) => ({
            label: title,
            index,
        }));
        if (items.length === 0) {
            vscode.window.showInformationMessage('No recent upload to undo');
            return;
        }
        const item = await vscode.window.showQuickPick(items, {
            title: 'Undo recent upload',
            placeHolder: 'Select an upload to undo',
        });
        if (item) {
            const [title, undo] = this.undoHistory[item.index];
            try {
                await undo();
                vscode.window.showInformationMessage(`Undo ${title} successfully`);
                this.undoHistory.splice(item.index, 1);
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to undo ${title}: ${e}`);
            }
        }
    }

    public register(): vscode.Disposable {
        return vscode.Disposable.from(
            vscode.languages.registerDocumentDropEditProvider({ pattern: "**" }, this, {
                providedDropEditKinds: [resourceUploadKind],
                dropMimeTypes: ['files', 'text/uri-list', 'image/*']
            }),
            vscode.languages.registerDocumentPasteEditProvider({ pattern: "**" }, this, {
                providedPasteEditKinds: [resourceUploadKind],
                pasteMimeTypes: ['files', 'text/uri-list', 'image/*']
            }),
            vscode.commands.registerCommand('paste-and-upload.undoRecentUpload', () => this.showUndoMenu()),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('paste-and-upload')) {
                    this.undoLimit = vscode.workspace.getConfiguration('paste-and-upload').get<number>('undoLimit') ?? 10;
                    while (this.undoHistory.length > this.undoLimit) {
                        this.undoHistory.shift();
                    }
                    this.loaders = {};
                    this.uploaders = {};
                }
            })
        );
    }
}