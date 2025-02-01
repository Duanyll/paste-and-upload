import * as vscode from 'vscode';

export interface ResourceFile {
    mime: string;
    name: string;
    extension: string;
    data: Uint8Array;
}

export interface IncompleteResourceFile {
    mime?: string;
    name?: string;
    extension?: string;
    data: Uint8Array;
}

export type MimeTypeDetectionMethod = 'content' | 'extension' | 'none';
export type FileNamingMethod = 'md5' | 'md5Short' | 'uuid' | 'nanoid' | 'unixTimestamp' | 'readableTimestamp' | 'prompt';
export type AllowMultipleFiles = 'allow' | 'deny' | 'prompt';
export interface ResourceFileLoaderOptions {
    enabled: boolean;
    fileSizeLimit: number;
    mimeTypeDetectionMethod: MimeTypeDetectionMethod;
    keepOriginalFilename: boolean;
    fileNamingMethod: FileNamingMethod;
    defaultSnippet: string;
    imageSnippet: string;
    allowMultipleFiles: AllowMultipleFiles;
}

export interface ResourceUploadResult {
    uri: string;
    undoTitle?: string;
    undo?: () => Thenable<void>;
}

export interface ResourceUploader {
    uploadFile(file: ResourceFile, edit: vscode.WorkspaceEdit): Promise<ResourceUploadResult>;
}

export interface S3Options {
    region: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket: string;
    prefix?: string;
    publicUrlBase?: string;
    omitExtension?: boolean;
}