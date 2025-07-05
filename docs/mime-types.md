# MIME Types Recieved in VSCode Paste and Drop Providers API

This document describes the MIME types that are received by the `Paste` and `Drop` providers in the VSCode API. The test was done on a Windows 10 machine with VSCode version 1.97.0.

## Pasting

### Paste Image from Windows Explorer

Copied single image file.

```
[1] image/png: [File] Icon2.png, D:%5Csource%5CCurrent%5Cvscode-paste-and-upload%5Cpaste-and-upload%5Ctest%5CIcon2.png
[2] text/uri-list: file:///d%3A/source/Current/vscode-paste-and-upload/paste-and-upload/test/Icon2.png
```

Copied multiple image files.

```
[1] image/png: [File] Icon2.png, D:%5Csource%5CCurrent%5Cvscode-paste-and-upload%5Cpaste-and-upload%5Ctest%5CIcon2.png
[2] image/png: [File] Icon3_512.png, D:%5Csource%5CCurrent%5Cvscode-paste-and-upload%5Cpaste-and-upload%5Ctest%5CIcon3_512.png
[3] image/png: [File] Icon3_2048.png, D:%5Csource%5CCurrent%5Cvscode-paste-and-upload%5Cpaste-and-upload%5Ctest%5CIcon3_2048.png
[4] text/uri-list: file:///d%3A/source/Current/vscode-paste-and-upload/paste-and-upload/test/Icon2.png
file:///d%3A/so ... (268 bytes)
```

### Paste Image from Microsoft Edge

Copied with `Copy image` context menu option. Note that the image is originally served as `image/webp` (though its url ends with `.png`), but is converted to `image/png` when copied.

```
[1] image/png: [File] image.png, undefined
[2] text/html: <html><body><!--StartFragment--><img src="https://img.duanyll.com/img/20241106155323.png"/><!--E ... (131 bytes)
```

Copied with `Copy image link` context menu option.

```
[1] text/plain: https://img.duanyll.com/img/20241106155445.png
```

### Paste Image from Snipaste

```
[1] image/png: [File] image.png, undefined
```

### Paste Image from QQNT (Electron)

Copied an image in chat with context menu option.

```
[1] image/png: [File] c795afab7fd80c4ded78304b4d4778ba.png, C:%5[REDACTED]c795afab7fd80c4ded78304b4d4778ba.png
[2] text/uri-list: file:///c%3A/[REDACTED]/nt_qq/nt_data/Pic/2025-01/Ori/c795af ... (130 bytes)
```

### Paste Image from VSCode Explorer

Copied with `Copy` context menu option.

```
[1] text/uri-list: file:///d%3A/source/Current/vscode-paste-and-upload/paste-and-upload/test/Icon2.png
```

### Paste Directory from Windows Explorer

This gives a DataTransferItem object with empty MIME types, and cannot read data bytes from it.

```
[1] : [File] refs, D:%5Csource%5CCurrent%5Cvscode-paste-and-upload%5Cpaste-and-upload%5C.git%5Crefs
[2] text/uri-list: file:///d%3A/source/Current/vscode-paste-and-upload/paste-and-upload/.git/refs
```

## Dropping

### Drop Image from Windows Explorer

```
[1] image/png: [File] Icon2.png, D:%5Csource%5CCurrent%5Cvscode-paste-and-upload%5Cpaste-and-upload%5Ctest%5CIcon2.png
[2] text/uri-list: file:///d%3A/source/Current/vscode-paste-and-upload/paste-and-upload/test/Icon2.png
```

### Drop Image from Microsoft Edge

Note that this time the webp image is not converted to png.

```
[1] image/webp: [File] 20241106155323.webp, undefined
[2] text/plain: https://img.duanyll.com/img/20241106155323.png
[3] text/uri-list: https://img.duanyll.com/img/20241106155323.png
[4] text/html: <img class="lazy entered loaded" src="https://img.duanyll.com/img/20241106155323.png" data-src="http ... (184 bytes)
```

### Drop Image from QQNT (Electron)

Dragged an image from chat.

```
[1] image/png: [File] c795afab7fd80c4ded78304b4d4778ba.png, C:%5[REDACTED]c795afab7fd80c4ded78304b4d4778ba.png
[2] text/uri-list: file:///c%3A/[REDACTED]/nt_qq/nt_data/Pic/2025-01/Ori/c795af ... (130 bytes)
```

### Drop Image from VSCode Explorer

```
[1] text/plain: D:\source\Current\vscode-paste-and-upload\paste-and-upload\test\Icon2.png
[2] text/uri-list: file:///d%3A/source/Current/vscode-paste-and-upload/paste-and-upload/test/Icon2.png
```

### Drop Directory from Windows Explorer

Similar to pasting, this gives a DataTransferItem object with empty MIME types.

```
[1] : [File] refs, D:%5Csource%5CCurrent%5Cvscode-paste-and-upload%5Cpaste-and-upload%5C.git%5Crefs
[2] text/uri-list: file:///d%3A/source/Current/vscode-paste-and-upload/paste-and-upload/.git/refs
```

## Conclusion

To retrieve the image file, first check for MIME types with an attachment of file. If there is no attachment, check for `text/uri-list` and try to download the file from the URIs. Gussing MIME types from file extensions is not reliable, as shown in the case of webp images from Microsoft Edge.

## GIF

When pasting or dropping a GIF image from browser, it will be converted to PNG format and lose its animation.

```
[1] text/html: <html><body><!--StartFragment--><img src="https://img.duanyll.com/img/43466dda.gif" alt="不同插值方式改 ... (151 bytes)
[2] image/png: [File] image.png, undefined
```

However a `text/html` item is still provided, which contains the original GIF image URL. Should try to HEAD the URL to detect if it is a GIF image, and retrieve it if so.

The URL in the `text/html` is always URI-encoded, we can try to extract it with a simple regex:

```
[1] text/html: <html>
<body>
<!--StartFragment--><img src="https://cdn.duanyll.com/%E4%B8%AD%E6%96%87"/><!--EndFr ... (127 bytes)
```