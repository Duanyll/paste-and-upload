import * as vscode from 'vscode';
import _ from 'lodash';

import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import MD5 from 'md5.js';
import { FileNamingMethod, IncompleteResourceFile } from './common.mjs';

const extensionConfig = vscode.workspace.getConfiguration('paste-and-upload');

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

export function extractBasenameAndExtension(filePath: string): [string, string] {
    const sep = /[\/\\]/;
    const parts = filePath.split(sep);
    const fileName = parts.pop()!;
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) {
        return [fileName, ''];
    } else {
        return [fileName.substring(0, lastDot), fileName.substring(lastDot + 1)];
    }
}

export async function generateFileName(method: FileNamingMethod, file: IncompleteResourceFile): Promise<string> {
    switch (method) {
        case 'md5':
        case 'md5Short':
            const hash = new MD5().update(file.data).digest('hex');
            return method === 'md5' ? hash : hash.substring(0, 8);
        case 'uuid':
            return uuidv4();
        case 'nanoid':
            return nanoid();
        case 'unixTimestamp':
            return Date.now().toString();
        case 'readableTimestamp':
            return new Date().toISOString().replace(/[:.]/g, '-');
        case 'prompt':
            const input = await vscode.window.showInputBox({
                prompt: 'Enter new file name for upload',
                value: file.name
            }) ?? '';
            return input;
    }
}