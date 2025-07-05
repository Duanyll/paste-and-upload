import * as vscode from 'vscode';
import _ from 'lodash';
import axios, { AxiosProgressEvent, AxiosResponseHeaders } from 'axios';
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

export function inspectResouceFiles(files: IncompleteResourceFile[]) {
    for (const file of files) {
        console.log(`[${file.mime}] ${file.name}.${file.extension} (${file.data.length} bytes)`);
    }
    console.log(`Total ${files.length} files`);
}

function inferFilename(url: string, headers: AxiosResponseHeaders): string {
    const contentDisposition = headers['content-disposition'];
    if (contentDisposition) {
        const filenameMatch = /filename\*?=['"]?([^'"]+)['"]?/.exec(contentDisposition);
        if (filenameMatch && filenameMatch[1]) {
            try {
                return decodeURIComponent(filenameMatch[1]);
            } catch (e) {
                return filenameMatch[1];
            }
        }
    }

    try {
        const urlPath = new URL(url).pathname;
        const lastSegment = urlPath.split('/').pop();
        if (lastSegment) {
            return decodeURIComponent(lastSegment);
        }
    } catch (e) {
        console.warn('Could not parse URL to infer filename:', e);
    }
    
    return "image";
}

const acceptHeader = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

export async function headContentType(url: string): Promise<string | undefined> {
    const response = await axios.head(url, {
        headers: {
            Accept: acceptHeader
        }
    });
    return response.headers['content-type'];
}

export async function downloadFileWithProgress(url: string): Promise<IncompleteResourceFile> {
    const abortController = new AbortController();

    let progressReporter = (progressEvent: AxiosProgressEvent) => {};
    const onDownloadProgress = (progressEvent: AxiosProgressEvent) => {
        progressReporter(progressEvent);
    };

    const downloadPromise = axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        signal: abortController.signal,
        onDownloadProgress,
        headers: {
            Accept: acceptHeader
        }
    });

    const timeout = setTimeout(() => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Downloading from ${new URL(url).hostname}`,
            cancellable: true
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                abortController.abort();
                console.log('User cancelled the download.');
            });

            let lastReportedPercentage = 0;
            progressReporter = (event: AxiosProgressEvent) => {
                if (event.total) {
                    const currentPercentage = Math.round((event.loaded * 100) / event.total);
                    const increment = currentPercentage - lastReportedPercentage;
                    if (increment > 0) {
                        progress.report({ increment, message: `${currentPercentage}%` });
                        lastReportedPercentage = currentPercentage;
                    }
                }
            };
            return downloadPromise;
        });
    }, 1000);

    try {
        const response = await downloadPromise;
        const filename = inferFilename(url, response.headers as AxiosResponseHeaders);
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        return { data: Buffer.from(response.data), name: filename, mime: contentType };
    } catch (error) {
        if (axios.isCancel(error)) {
            throw new Error('Download was cancelled by the user.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
