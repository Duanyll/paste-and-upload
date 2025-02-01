import * as vscode from 'vscode';
import _ from 'lodash';
import { ResourceFile, ResourceUploader } from './common.mjs';
import { ResourceFileLoader } from './loader.mjs';
import { S3Uploader } from './s3Uploader.mjs';

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
    s3uploader: ResourceUploader = new S3Uploader();
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

    public async provideDocumentDropEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        dataTransfer: vscode.DataTransfer,
        token: vscode.CancellationToken,
    ): Promise<ResourceUploadDocumentDropEdit | undefined> {
        const loader = this.getLoader(document.languageId);
        const files = await loader.prepareFilesToUpload(dataTransfer);
        return new ResourceUploadDocumentDropEdit(files, document.uri, document.languageId, [new vscode.Range(position, position)]);
    }

    public async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken,
    ): Promise<ResourceUploadDocumentPasteEdit[] | undefined> {
        const loader = this.getLoader(document.languageId);
        const files = await loader.prepareFilesToUpload(dataTransfer);
        return [new ResourceUploadDocumentPasteEdit(files, document.uri, document.languageId, ranges)];
    }

    async executeUpload(edit: ResourceUploadDocumentDropEdit | ResourceUploadDocumentPasteEdit) {
        const loader = this.getLoader(edit.languageId);
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uploader = this.s3uploader;
        const snippets: string[] = [];
        for (const file of edit.files) {
            try {
                const result = await uploader.uploadFile(file, workspaceEdit);
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
        console.log('resolveDocumentDropEdit: ', edit.files[0].name);
        await this.executeUpload(edit);
        return edit;
    }

    public async resolveDocumentPasteEdit(edit: ResourceUploadDocumentPasteEdit, token: vscode.CancellationToken): Promise<ResourceUploadDocumentPasteEdit> {
        console.log('resolveDocumentPasteEdit', edit.files[0].name);
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
        );
    }
}