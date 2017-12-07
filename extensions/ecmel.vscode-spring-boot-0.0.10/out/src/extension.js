'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vsc = require("vscode");
const path = require("path");
const fs = require("fs");
let StreamZip = require('node-stream-zip');
let paths = [
    'META-INF/spring-configuration-metadata.json',
    'META-INF/additional-spring-configuration-metadata.json'
];
let items = {};
class Server {
    isValue(document, position) {
        let start = new vsc.Position(position.line, 0);
        let range = new vsc.Range(start, position);
        let text = document.getText(range);
        return text.includes('=') || text.includes(':');
    }
    provideCompletionItems(document, position, token) {
        if (this.isValue(document, position)) {
            return null;
        }
        let ci = [];
        for (let item in items) {
            ci.push(items[item]);
        }
        return new vsc.CompletionList(ci);
    }
    resolveCompletionItem(item, token) {
        return item;
    }
    provideHover(document, position, token) {
        let line = document.lineAt(position.line);
        let pair = line.text.split(/[\=\:]/);
        if (pair.length > 0) {
            if (pair[0].endsWith('.')) {
                pair[0] = pair[0].slice(0, -1);
            }
            let ci = items[pair[0]];
            if (ci) {
                return new vsc.Hover(ci.documentation + '\nDefault: ' + ci.detail);
            }
        }
        return null;
    }
}
function parse(data) {
    for (let property of data.properties) {
        let item = items[property.name];
        if (item && item.documentation) {
            continue;
        }
        item = new vsc.CompletionItem(property.name);
        item.detail = property.defaultValue + '  [' + property.type + ']';
        item.documentation = property.description;
        if (property.deprecation) {
            item.documentation += ' DEPRECATED';
            if (property.deprecation.replacement) {
                item.documentation += ' use ' + property.deprecation.replacement;
            }
        }
        items[property.name] = item;
    }
}
function scan(uri) {
    fs.readFile(uri.fsPath, 'utf8', function (err, data) {
        items = {};
        if (err) {
            console.log(err);
            return;
        }
        let jps = data.split(path.delimiter);
        for (let jp of jps) {
            let zip = new StreamZip({
                file: jp,
                storeEntries: true
            });
            zip.on('ready', function () {
                for (let pth of paths) {
                    let md = zip.entry(pth);
                    if (md) {
                        try {
                            parse(JSON.parse(zip.entryDataSync(md.name)));
                        }
                        catch (error) {
                            console.log(error);
                        }
                    }
                }
            });
            zip.on('error', function (error) {
                console.log(error);
            });
        }
    });
}
function activate(context) {
    if (vsc.workspace.rootPath) {
        let cp = path.resolve(vsc.workspace.rootPath, 'classpath.txt');
        scan(vsc.Uri.file(cp));
        let fsw = vsc.workspace.createFileSystemWatcher(cp);
        fsw.onDidCreate(scan);
        fsw.onDidChange(scan);
        fsw.onDidDelete(scan);
        context.subscriptions.push(fsw);
        context.subscriptions.push(vsc.languages.setLanguageConfiguration('properties', {
            wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\<\>\/\?\s]+)/g
        }));
        let server = new Server();
        context.subscriptions.push(vsc.languages.registerCompletionItemProvider(['properties'], server));
        context.subscriptions.push(vsc.languages.registerHoverProvider(['properties'], server));
    }
}
exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map