import * as vscode from 'vscode';
import _ from 'lodash';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from "@aws-sdk/lib-storage";
import { filesize } from 'filesize';
import { ResourceFile, ResourceUploader, ResourceUploadResult, S3Options } from './common.mjs';

export class S3Uploader implements ResourceUploader {
    private client: S3Client;
    private s3Option: S3Options;

    constructor() {
        const s3Section = vscode.workspace.getConfiguration('paste-and-upload.s3');
        const region = s3Section.get<string>('region');
        if (_.isEmpty(region)) {
            throw new Error('Region is required');
        }
        const bucket = s3Section.get<string>('bucket');
        if (_.isEmpty(bucket)) {
            throw new Error('Bucket is required');
        }
        const emptyToUndefined = (value: string | undefined) => _.isEmpty(value) ? undefined : value;
        this.s3Option = {
            region: region as string,
            endpoint: emptyToUndefined(s3Section.get<string>('endpoint')),
            accessKeyId: emptyToUndefined(s3Section.get<string>('accessKeyId')),
            secretAccessKey: emptyToUndefined(s3Section.get<string>('secretAccessKey')),
            bucket: bucket as string,
            prefix: emptyToUndefined(s3Section.get<string>('prefix')),
            publicUrlBase: emptyToUndefined(s3Section.get<string>('publicUrlBase')),
            omitExtension: s3Section.get<boolean>('omitExtension')
        }
        this.client = this.createClient();
    }

    private createClient(): S3Client {
        const credentials = (this.s3Option.accessKeyId && this.s3Option.secretAccessKey) ? {
            accessKeyId: this.s3Option.accessKeyId,
            secretAccessKey: this.s3Option.secretAccessKey
        } : undefined;
        return new S3Client({
            region: this.s3Option.region,
            endpoint: this.s3Option.endpoint,
            credentials
        });
    }

    public async uploadBuffer(buffer: Uint8Array, key: string, contentType?: string): Promise<void> {
        const upload = new Upload({
            client: this.client,
            params: {
                Bucket: this.s3Option.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType
            }
        });
        // Show progress bar if the upload is still running after 1 second
        const donePromise = upload.done();
        const stillRunning = true;
        const timeout = setTimeout(() => {
            if (!stillRunning) {
                return;
            }
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Uploading paste data (${filesize(buffer.length)})`,
                cancellable: true
            }, (progress, token) => {
                token.onCancellationRequested(() => {
                    upload.abort();
                });
                upload.on('httpUploadProgress', ({loaded, total}) => {
                    progress.report({increment: (loaded ?? 0) / (total ?? buffer.length) * 100});
                });
                return donePromise;
            });
        }, 1000);
        try {
            await donePromise;
        } finally {
            clearTimeout(timeout);
        }
    }

    public async deleteObject(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.s3Option.bucket,
            Key: key
        }));
    }

    public async testConnection(): Promise<void> {
        const payload = new Uint8Array(4 * 1024 * 1024);
        const prefix = vscode.workspace.getConfiguration('paste-and-upload.s3').get<string>('prefix') ?? '';
        const key = `${prefix}paste-and-upload-test.txt`;
        try {
            await this.uploadBuffer(payload, key);
        } catch (e) {
            vscode.window.showErrorMessage(`Unable to upload test payload: ${e}`);
            return;
        }
        try {
            await this.deleteObject(key);
        } catch (e) {
            vscode.window.showWarningMessage(`A test payload (${payload}) has been successfully uploaded, but unable to delete it: ${e}`);
            return;
        }
        vscode.window.showInformationMessage('Your S3 connection is working fine');
    }

    public generateKey(name: string, extension: string): string {
        const prefix = this.s3Option.prefix ?? '';
        if (this.s3Option.omitExtension || _.isEmpty(extension)) {
            return `${prefix}${name}`;
        } else {
            return `${prefix}${name}.${extension}`;
        }
    }

    public generatePublicUrl(name: string, extension: string): string {
        const publicUrlBase = this.s3Option.publicUrlBase;
        if (publicUrlBase) {
            if (this.s3Option.omitExtension || _.isEmpty(extension)) {
                return `${publicUrlBase}${name}`;
            } else {
                return `${publicUrlBase}${name}.${extension}`;
            }
        } else {
            const endpoint = this.s3Option.endpoint ?? `https://s3.${this.s3Option.region}.amazonaws.com`;
            return vscode.Uri.joinPath(vscode.Uri.parse(endpoint), this.s3Option.bucket, this.generateKey(name, extension)).toString();
        }
    }

    public async uploadFile(file: ResourceFile): Promise<ResourceUploadResult> {
        const key = this.generateKey(file.name, file.extension);
        await this.uploadBuffer(file.data, key, file.mime);
        return {
            uri: this.generatePublicUrl(file.name, file.extension),
            undoTitle: key,
            undo: async () => {
                await this.deleteObject(key);
            }
        };
    }
}