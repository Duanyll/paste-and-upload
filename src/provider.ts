import * as vscode from 'vscode';
import _ from 'lodash';
import { inspectDataTransfer } from './utils';

class ResourcePasteOrDropProvider implements vscode.DocumentPasteEditProvider, vscode.DocumentDropEditProvider {
    constructor() {
        console.log('ResourcePasteOrDropProvider created');
    }

    public async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentDropEdit | undefined> {
        await inspectDataTransfer(dataTransfer);
        return;
    }

    public async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit[] | undefined> {
        await inspectDataTransfer(dataTransfer);
        return;
    }
}

export function registerResourceDropOrPasteSupport(selector: vscode.DocumentSelector): vscode.Disposable {
    const kind = vscode.DocumentDropOrPasteEditKind.Text.append('s3uri');

    return vscode.Disposable.from(
        vscode.languages.registerDocumentDropEditProvider(selector, new ResourcePasteOrDropProvider(), {
            providedDropEditKinds: [kind],
            dropMimeTypes: ['files', 'text/*', 'image/*']
        }),
        vscode.languages.registerDocumentPasteEditProvider(selector, new ResourcePasteOrDropProvider(), {
            providedPasteEditKinds: [kind],
            pasteMimeTypes: ['files', 'text/*', 'image/*']
        })
    );
}