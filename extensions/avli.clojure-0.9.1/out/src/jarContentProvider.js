"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const os = require("os");
const JSZip = require("jszip");
class JarContentProvider {
    provideTextDocumentContent(uri, token) {
        return new Promise((resolve, reject) => {
            let rawPath = uri.path;
            let pathToFileInJar = rawPath.slice(rawPath.search('!/') + 2);
            let pathToJar = rawPath.slice('file:'.length);
            pathToJar = pathToJar.slice(0, pathToJar.search('!'));
            if (os.platform() === 'win32') {
                pathToJar = pathToJar.replace(/\//g, '\\').slice(1);
            }
            fs.readFile(pathToJar, (err, data) => {
                let zip = new JSZip();
                zip.loadAsync(data).then((new_zip) => {
                    new_zip.file(pathToFileInJar).async("string").then((value) => {
                        resolve(value);
                    });
                });
            });
        });
    }
}
exports.JarContentProvider = JarContentProvider;
//# sourceMappingURL=jarContentProvider.js.map