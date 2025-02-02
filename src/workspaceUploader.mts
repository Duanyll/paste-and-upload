import * as vscode from 'vscode';
import { ResourceFile, ResourceUploader, ResourceUploadResult, WorkspaceOptions } from "./common.mjs";

export class WorkspaceUploader implements ResourceUploader {
    options: WorkspaceOptions;
    constructor(){
        const workspaceSection = vscode.workspace.getConfiguration('paste-and-upload.workspace');
        this.options = {
            path: workspaceSection.get<string>('path') ?? '',
            linkBase: workspaceSection.get<string>('linkBase') ?? '',
        };
    }

    async uploadFile(file: ResourceFile, doucumentUri: vscode.Uri, edit: vscode.WorkspaceEdit): Promise<ResourceUploadResult> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(doucumentUri);
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        const filename = file.extension ? `${file.name}.${file.extension}` : file.name;
        const destUri = vscode.Uri.joinPath(workspaceFolder.uri, this.options.path, filename);
        edit.createFile(destUri, { overwrite: true, contents: file.data });
        return {
            uri: `${this.options.linkBase}${filename}`
        };
    }
}