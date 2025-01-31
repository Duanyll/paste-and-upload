import * as vscode from 'vscode';
import _ from 'lodash';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from "@aws-sdk/lib-storage";
import { filesize } from 'filesize';

export class S3Uploader {
    private client: S3Client;

    constructor() {
        this.client = this.createClient();
    }

    private createClient(): S3Client {
        const s3Option = vscode.workspace.getConfiguration('paste-and-upload.s3');
        const region = s3Option.get<string>('region');
        if (_.isEmpty(region)) {
            throw new Error('Region is required');
        }
        const endpoint = _.isEmpty(s3Option.get<string>('endpoint')) ? undefined : s3Option.get<string>('endpoint');
        const accessKeyId = s3Option.get<string>('accessKeyId');
        const secretAccessKey = s3Option.get<string>('secretAccessKey');
        const credentials = (!_.isEmpty(accessKeyId) && !_.isEmpty(secretAccessKey)) ? {
            accessKeyId: accessKeyId as string,
            secretAccessKey: secretAccessKey as string
        } : undefined;
        return new S3Client({
            region,
            endpoint,
            credentials
        });
    }

    public async uploadBuffer(buffer: Uint8Array, key: string): Promise<void> {
        const bucket = vscode.workspace.getConfiguration('paste-and-upload.s3').get<string>('bucket');
        if (_.isEmpty(bucket)) {
            throw new Error('Bucket is required');
        }
        const upload = new Upload({
            client: this.client,
            params: {
                Bucket: bucket as string,
                Key: key,
                Body: buffer
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
        const bucket = vscode.workspace.getConfiguration('paste-and-upload.s3').get<string>('bucket');
        if (_.isEmpty(bucket)) {
            throw new Error('Bucket is required');
        }
        await this.client.send(new DeleteObjectCommand({
            Bucket: bucket as string,
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
}