"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const cljConnection_1 = require("./cljConnection");
const cljParser_1 = require("./cljParser");
const nreplClient_1 = require("./nreplClient");
class ClojureDefinitionProvider {
    provideDefinition(document, position, token) {
        if (!cljConnection_1.cljConnection.isConnected())
            return Promise.reject('No nREPL connected.');
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange)
            return Promise.reject('No word selected.');
        const currentWord = document.lineAt(position.line).text.slice(wordRange.start.character, wordRange.end.character);
        const ns = cljParser_1.cljParser.getNamespace(document.getText());
        return cljConnection_1.cljConnection.sessionForFilename(document.fileName).then(session => {
            return nreplClient_1.nreplClient.info(currentWord, ns, session.id).then(info => {
                if (!info.file)
                    return Promise.reject('No word definition found.');
                let uri = vscode.Uri.parse(info.file);
                let pos = new vscode.Position(info.line - 1, info.column);
                let definition = new vscode.Location(uri, pos);
                return Promise.resolve(definition);
            });
        });
    }
}
exports.ClojureDefinitionProvider = ClojureDefinitionProvider;
//# sourceMappingURL=clojureDefinition.js.map