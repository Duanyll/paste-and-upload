import * as vscode from 'vscode';

import { ResourcePasteOrDropProvider } from './provider.mjs';
import { S3Uploader } from './s3Uploader.mjs';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "paste-and-upload" is now active!');
	context.subscriptions.push(vscode.commands.registerCommand('paste-and-upload.testS3Connection', () => {
		const uploader = new S3Uploader();
		uploader.testConnection();
	}));
	const provider = new ResourcePasteOrDropProvider();
	context.subscriptions.push(provider.register());
}

// This method is called when your extension is deactivated
export function deactivate() {}
