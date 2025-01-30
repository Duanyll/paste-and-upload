import * as vscode from 'vscode';
import _ from 'lodash';

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