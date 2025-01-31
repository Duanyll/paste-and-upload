import * as vscode from 'vscode';
import _ from 'lodash';
import { fileTypeFromBuffer } from 'file-type';
import { filesize } from 'filesize';
import { basename, extname } from 'path';

export async function inspectDataTransfer(dataTransfer: vscode.DataTransfer) {
    let count = 0;
    for (const i of dataTransfer) {
        count++;
        const [mime, item] = i;
        let itemStr = "";
        const itemFile = item.asFile();
        if (itemFile) {
            itemStr = `[File] ${itemFile.name}, ${itemFile.uri}`;
        } else {
            itemStr = await item.asString();
            if (itemStr.length > 100) {
                itemStr = `${itemStr.substring(0, 100)} ... (${itemStr.length} bytes)`;
            }
        }
        console.log(`[${count}] ${mime}: ${itemStr}`);
    }
    console.log(`Total ${count} items`);
}

async function promptFileSizeLimit(size: number): Promise<boolean> {
    const limit = vscode.workspace.getConfiguration('paste-and-upload').get<number>('fileSizeLimit');
    if (limit && size > limit) {
        const action = await vscode.window.showWarningMessage(
            `The file is very large (${filesize(size)}), do you still want to upload it?`,
            'Yes', 'No');
        return action === 'Yes';
    }
    return true;
}

export interface FileToUpload {
    mime: string;
    buffer: Uint8Array;
    extension: string;
    name: string;
}

async function fillFileToUpload(buffer: Uint8Array, filePath: string, knownMimeType?: string): Promise<FileToUpload> {
    const name = basename(filePath, extname(filePath));
    if (knownMimeType) {
        return {
            mime: knownMimeType,
            buffer,
            extension: extname(filePath).slice(1),
            name
        };
    } else {
        const fileType = await fileTypeFromBuffer(buffer);
        if (fileType) {
            return {
                mime: fileType.mime,
                buffer,
                extension: fileType.ext,
                name
            };
        } else {
            return {
                mime: 'application/octet-stream',
                buffer,
                extension: '',
                name
            };
        }   
    }
}

export async function readFilesFromDataTransfer(dataTransfer: vscode.DataTransfer): Promise<FileToUpload[]> {
    const files: FileToUpload[] = [];
    // First, try to read file attachments
    for (const i of dataTransfer) {
        const [mime, item] = i;
        const itemFile = item.asFile();
        if (itemFile) {
            // Here we cannot get the file size before actually reading the file
            const buffer = await itemFile.data();
            files.push(await fillFileToUpload(buffer, itemFile.name, mime));
        }
    }
    if (files.length > 0) {
        const totalSize = files.reduce((acc, cur) => acc + cur.buffer.length, 0);
        if (!await promptFileSizeLimit(totalSize)) {
            return [];
        }
        return files;
    }
    // If no file attachments, try to get `text/uri-list` and read files from URIs
    const uriList = dataTransfer.get('text/uri-list');
    if (uriList) {
        const uris = (await uriList.asString())!.split('\n').map(uri => uri.trim()).filter(uri => uri.length > 0);
        let totalSize = 0;
        for (const i of uris) {
            const uri = vscode.Uri.parse(i);
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                if (stat.type & vscode.FileType.File) {
                    totalSize += stat.size;
                }
            } catch (e) {
                console.log(`Cannot stat file from URI: ${uri}`);
            }
        }
        if (!await promptFileSizeLimit(totalSize)) {
            return [];
        }
        for (const i of uris) {
            const uri = vscode.Uri.parse(i);
            try {
                const buffer = await vscode.workspace.fs.readFile(uri);
                files.push(await fillFileToUpload(buffer, uri.path));
            } catch (e) {
                console.log(`Cannot read file from URI: ${uri}`);
            }
        }
    }
    return files;
}

export function inspectFilesToUpload(files: FileToUpload[]) {
    for (const i of files) {
        console.log(`[${i.name}.${i.extension}] ${i.mime} (${filesize(i.buffer.length)})`);
    }
    console.log(`Total ${files.length} files`);
}