import * as vscode from 'vscode';
import _ from 'lodash';

import { ResourcePasteOrDropProvider } from './provider.mjs';
import { S3Uploader } from './s3Uploader.mjs';

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('paste-and-upload.testS3Connection', () => {
		const uploader = new S3Uploader();
		uploader.testConnection();
	}));
	const provider = new ResourcePasteOrDropProvider();
	context.subscriptions.push(provider.register());

	const myExtension = vscode.extensions.getExtension('duanyll.paste-and-upload');
	const currentVersion = myExtension!.packageJSON.version;
	const lastVersion = context.globalState.get<string>('paste-and-upload.version');
	if (_.isEmpty(lastVersion)) {
		const result = await vscode.window.showInformationMessage('Thank you for installing Paste and Upload! Please check the S3 settings:', 'Open settings');
		if (result === 'Open settings') {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'paste-and-upload.s3');
		}
	}
	if (currentVersion !== lastVersion) {
		context.globalState.update('paste-and-upload.version', currentVersion);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
