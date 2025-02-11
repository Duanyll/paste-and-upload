<p align="center">
  <img src="https://github.com/Duanyll/paste-and-upload/blob/master/assets/icon.png?raw=true" />
</p>

# Paste and Upload

[![](https://img.shields.io/badge/Visual_Studio_Marketplace-Download-blue)](https://marketplace.visualstudio.com/items?itemName=duanyll.paste-and-upload) [![](https://img.shields.io/badge/Open_VSX-Download-blue)](https://open-vsx.org/extension/duanyll/paste-and-upload) [![](https://img.shields.io/badge/GitHub-Source-blue)](https://github.com/duanyll/paste-and-upload)

This extension allows you to paste images (and other files) directly from your clipboard, upload them to a S3 bucket or save them to your workspace, then insert a link pointing to the image. It utilizes the `DocumentPaste` and `DocumentDrop` API and works on remote workspaces.

## Features

- Fetch images from clipboard with VS Code API, even in remote workspaces. No extra hotkeys required, simply press `Ctrl+V` to paste images!
  ![Paste from Snipaste](assets/snipaste.gif)
- Or drag and drop images from your file explorer or browser
  ![Drag and Drop from Microsoft Edge](assets/drop.gif)
- Language overridable snippets for inserting links (Built-in support for Markdown and LaTeX)
- Upload images to any S3-compatible storage (Not limited to AWS S3, e.g. Aliyun OSS, Cloudflare R2, etc.)
- Or save images to your workspace (Supports virtual workspaces like [Overleaf Workshop](https://marketplace.visualstudio.com/items?itemName=iamhyc.overleaf-workshop))
  ![Overleaf Workshop Example](assets/overleaf.gif)

## Requirements

Need VS Code 1.97 or later. No external dependencies are required, works across all platforms and remote workspaces.

## Extension Settings

The S3 settings are required if you want to upload images to S3. You can configure them in your user settings (or workspace settings) like this:

```jsonc
{
  "paste-and-upload.s3.region": "oss-cn-hongkong",
  // If you are not using AWS S3, you need to set the endpoint
  "paste-and-upload.s3.endpoint": "https://oss-cn-hongkong.aliyuncs.com",
  "paste-and-upload.s3.accessKeyId": "YourAccessKeyId",
  "paste-and-upload.s3.secretAccessKey": "YourSecretAccessKey",
  "paste-and-upload.s3.bucket": "your-bucket-name",
  // Will be prepended to S3 object key (Slashes will be preserved as is)
  "paste-and-upload.s3.prefix": "img/",
  // Will be prepended to inserted link (Slashes will be preserved as is)
  "paste-and-upload.s3.publicUrlBase": "https://cdn.duanyll.com/img/"
}
```

It is recommended to configure S3 credentials in your user settings to avoid leaking them. After configuring S3 related options, you can press `Ctrl+Shift+P` and search for `Paste and Upload: Test S3 Connection` to verify your settings.

All settings are overridable by workspace settings. Settings directly belonging to `paste-and-upload` section can be overriden by language-specific settings. For example, the following configuration will enable paste-and-upload for Markdown and LaTeX, and upload images to S3 for Markdown and save images to workspace for LaTeX:

```jsonc
{
  "paste-and-upload.enabled": false,
  // Save as ${workspaceFolder}/figures/image.png
  "paste-and-upload.workspace.path": "figures",
  // Insert \includegraphics{image.png} (If you have \graphicspath{figures})
  "paste-and-upload.workspace.linkBase": "",
  "[markdown]": {
    "paste-and-upload.enabled": true,
    "paste-and-upload.uploadDestination": "s3"
  },
  "[latex]": {
    "paste-and-upload.enabled": true,
    "paste-and-upload.uploadDestination": "workspace"
  }
}
```

A full list of settings can be found in the VS Code settings UI (search for `Paste and Upload`). Here are some notable settings:

| Name                                    | Description                               | Default    | Default for Markdown                |
| --------------------------------------- | ----------------------------------------- | ---------- | ----------------------------------- |
| `paste-and-upload.enabled`              | Enable or disable the extension           | `true`     |                                     |
| `paste-and-upload.uploadDestination`    | Where to upload images to                 | `s3`       |                                     |
| `paste-and-upload.fileNamingMethod`     | How to name the uploaded files            | `md5short` |                                     |
| `paste-and-upload.defaultSnippet`       | The default snippet to insert             | `$url`     | `[${1:$TM_SELECTED_TEXT}](${url})`  |
| `paste-and-upload.imageSnippet`         | The snippet for images                    | `$url`     | `![${1:$TM_SELECTED_TEXT}](${url})` |
| `paste-and-upload.mimeTypeFilter`       | Regex to filter pasted files by MIME type | `""`       |                                     |
| `paste-and-upload.ignoreWorkspaceFiles` | Ignore files already in workspace         | `true`     |                                     |

This extension utilizes the native VS Code API to paste images, please also refer to the `Paste As` and `Drop` sections in the VS Code settings to control the behavior of pasting and dropping files, and the priority of this extension.

## Known Issues

Undoing paste operation by pressing `Ctrl+Z` can revert changes in the workspace, but the images are not deleted from S3. This is a limitation of VS Code API. We provide a workaround by adding a `Paste and Upload: Undo Recent Upload` command, which will show a list of recent uploads and allow you to manually select and delete them.

![Undo Recent Upload](assets/undo.gif)

## Release Notes

### 0.1.0

Initial release of Paste and Upload.

### 0.2.0

- More documentation on settings
- Add first run notification

## Acknowledgements

The icon comes from [PureSugar Icons](https://dribbble.com/shots/6689165-Pure-Sugar-60-Free-SVG-Icons-Pack-Sketch-Vector-Icon-Freebie) by Nitish Khagwal.
