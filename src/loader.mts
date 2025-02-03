import * as vscode from 'vscode';
import _ from 'lodash';
import { fileTypeFromBuffer } from 'file-type';
import * as mimeLookup from 'mime-types';
import { filesize } from 'filesize';

import { extractBasenameAndExtension, generateFileName } from './utils.mjs';
import { ResourceFileLoaderOptions, MimeTypeDetectionMethod, FileNamingMethod, IncompleteResourceFile, ResourceFile, AllowMultipleFiles, ResourceUploader, UploadDestination } from './common.mjs';

export class ResourceFileLoader {
    private readonly options: ResourceFileLoaderOptions;
    constructor(public readonly languageId: string) {
        const languageOptions = vscode.workspace.getConfiguration('paste-and-upload', { languageId });
        this.options = {
            enabled: languageOptions.get<boolean>('enabled')!,
            uploadDestination: languageOptions.get<UploadDestination>('uploadDestination')!,
            fileSizeLimit: languageOptions.get<number>('fileSizeLimit')!,
            mimeTypeDetectionMethod: languageOptions.get<MimeTypeDetectionMethod>('mimeTypeDetectionMethod')!,
            keepOriginalFilename: languageOptions.get<boolean>('keepOriginalFilename')!,
            fileNamingMethod: languageOptions.get<FileNamingMethod>('fileNamingMethod')!,
            defaultSnippet: languageOptions.get<string>('defaultSnippet')!,
            imageSnippet: languageOptions.get<string>('imageSnippet')!,
            allowMultipleFiles: languageOptions.get<AllowMultipleFiles>('allowMultipleFiles')!,
            mimeTypeFilter: languageOptions.get<string>('mimeTypeFilter')!,
            ignoreWorkspaceFiles: languageOptions.get<boolean>('ignoreWorkspaceFiles')!
        };
    }

    public getUploadDestination(): UploadDestination {
        return this.options.uploadDestination;
    }

    private async loadDataTransferAttachments(dataTransfer: vscode.DataTransfer): Promise<IncompleteResourceFile[]> {
        let files: IncompleteResourceFile[] = [];
        for (const i of dataTransfer) {
            const [mime, item] = i;
            const itemFile = item.asFile();
            if (!_.isEmpty(mime) && itemFile) {
                if (this.options.ignoreWorkspaceFiles) {
                    let uri = itemFile.uri;
                    if (uri) {
                        if (vscode.workspace.getWorkspaceFolder(uri)) {
                            continue;
                        }
                    }
                }
                const data = await itemFile.data();
                const [name, extension] = extractBasenameAndExtension(itemFile.name);
                files.push({ mime, name, extension, data });
            }
        }
        return files;
    }

    private async loadDataTransferUriLists(dataTransfer: vscode.DataTransfer): Promise<IncompleteResourceFile[]> {
        let files: IncompleteResourceFile[] = [];
        const uriList = _.map(_.split(await dataTransfer.get('text/uri-list')?.asString(), '\n'), _.trim);
        for (const i of uriList) {
            const uri = vscode.Uri.parse(i);
            if (this.options.ignoreWorkspaceFiles && vscode.workspace.getWorkspaceFolder(uri)) {
                continue;
            }
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                if (stat.type & vscode.FileType.File) {
                    const data = await vscode.workspace.fs.readFile(uri);
                    const [name, extension] = extractBasenameAndExtension(uri.path);
                    files.push({ name, extension, data });
                }
            } catch (e) {
                console.log(`Cannot load file from URI: ${uri}`);
            }
        }
        return files;
    }

    private async completeResourceFile(file: IncompleteResourceFile): Promise<ResourceFile | undefined> {
        let name = file.name;
        if (_.isEmpty(name) || name === 'image' || !this.options.keepOriginalFilename) {
            name = await generateFileName(this.options.fileNamingMethod, file);
            if (_.isEmpty(name)) {
                return;
            }
        }
        let mime = file.mime;
        let extension = file.extension;
        if (mime === 'application/octet-stream') {
            mime = undefined;
        }
        // First, try to detect mime type based on extension, if allowed
        if (_.isEmpty(mime) && this.options.mimeTypeDetectionMethod === 'content') {
            const result = await fileTypeFromBuffer(file.data);
            if (result) {
                mime = result.mime;
                extension = result.ext;
            }
        }
        // Then, try to complete mime type and extension based on each other
        if (this.options.mimeTypeDetectionMethod !== 'none') {
            if (_.isEmpty(mime) && !_.isEmpty(extension)) {
                mime = mimeLookup.lookup(extension!) || 'application/octet-stream';
            } else if (_.isEmpty(extension) && !_.isEmpty(mime)) {
                extension = mimeLookup.extension(mime!) || '';
            }
        }
        // Finally, use default mime type and extension if still empty
        if (_.isEmpty(mime)) {
            mime = 'application/octet-stream';
        }
        if (_.isEmpty(extension)) {
            extension = '';
        }
        return { 
            mime: mime!,
            name: name!,
            extension: extension!,
            data: file.data
        };
    }

    private preventDuplicateFilenames(files: ResourceFile[]) {
        let names = new Set<string>();
        for (const i of files) {
            let name = i.name;
            let count = 1;
            while (names.has(name)) {
                name = `${i.name}.${count}`;
                count++;
            }
            i.name = name;
            names.add(name);
        }
    }

    public async prepareFilesToUpload(dataTransfer: vscode.DataTransfer): Promise<ResourceFile[]> {
        if (!this.options.enabled) {
            return [];
        }

        // Load files
        let files = await this.loadDataTransferAttachments(dataTransfer);
        if (_.isEmpty(files)) {
            files = await this.loadDataTransferUriLists(dataTransfer);
        }

        // Complete file information
        let result: ResourceFile[] = [];
        for (const i of files) {
            const file = await this.completeResourceFile(i);
            if (file) {
                result.push(file);
            }
        }
        this.preventDuplicateFilenames(result);

        // Filter by mime type
        if (!_.isEmpty(this.options.mimeTypeFilter)) {
            const regex = new RegExp(this.options.mimeTypeFilter, 'i');
            result = _.filter(result, i => regex.test(i.mime));
        }

        // Check against multiple files limit
        if (files.length > 1) {
            if (this.options.allowMultipleFiles === 'deny') {
                vscode.window.showWarningMessage('Multiple files are not allowed, please select only one file.');
                return [];
            } else if (this.options.allowMultipleFiles === 'prompt') {
                const result = await vscode.window.showInformationMessage('Multiple files detected, do you want to upload all of them?', 'Yes', 'No');
                if (result !== 'Yes') {
                    return [];
                }
            }
        }

        // Check against file size limit
        let totalSize = _.sumBy(result, i => i.data.length);
        if (this.options.fileSizeLimit > 0 && totalSize > this.options.fileSizeLimit) {
            const choice = await vscode.window.showWarningMessage(`The size of selected files (${filesize(totalSize)}) is very large, still upload?`, 'Yes', 'No');
            if (choice !== 'Yes') {
                return [];
            }
        }

        return result;
    }

    public generateSnippet(file: ResourceFile, url: string): string {
        let snippet = file.mime.startsWith('image/') ? this.options.imageSnippet : this.options.defaultSnippet;
        snippet = snippet.replace("${url}", url);
        snippet = snippet.replace("${filename}", _.isEmpty(file.extension) ? file.name : `${file.name}.${file.extension}`);
        snippet = snippet.replace("${filenameWithoutExtension}", file.name);
        snippet = snippet.replace("${extension}", file.extension);
        snippet = snippet.replace("${mimeType}", file.mime);
        return snippet;
    }
}