"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const cljConnection_1 = require("./cljConnection");
const cljParser_1 = require("./cljParser");
const nreplClient_1 = require("./nreplClient");
class ClojureHoverProvider {
    provideHover(document, position, token) {
        if (!cljConnection_1.cljConnection.isConnected())
            return Promise.reject('No nREPL connected.');
        let wordRange = document.getWordRangeAtPosition(position);
        if (wordRange === undefined)
            return Promise.resolve(new vscode.Hover('Docstring not found'));
        let currentWord;
        currentWord = document.lineAt(position.line).text.slice(wordRange.start.character, wordRange.end.character);
        const ns = cljParser_1.cljParser.getNamespace(document.getText());
        return cljConnection_1.cljConnection.sessionForFilename(document.fileName).then(session => {
            return nreplClient_1.nreplClient.info(currentWord, ns, session.id).then(info => {
                if (info.doc) {
                    return Promise.resolve(new vscode.Hover(info.doc));
                }
                return Promise.reject(undefined);
            });
        });
    }
}
exports.ClojureHoverProvider = ClojureHoverProvider;
//# sourceMappingURL=clojureHover.js.map