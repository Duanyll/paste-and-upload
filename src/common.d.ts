declare module "md5.js" {
    export default class MD5 {
        constructor();
        update(data: Uint8Array): this;
        digest(type: "hex"): string;
    }
}