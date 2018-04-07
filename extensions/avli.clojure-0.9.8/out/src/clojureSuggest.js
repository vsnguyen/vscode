"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const cljConnection_1 = require("./cljConnection");
const cljParser_1 = require("./cljParser");
const nreplClient_1 = require("./nreplClient");
const mappings = {
    'nil': vscode.CompletionItemKind.Value,
    'macro': vscode.CompletionItemKind.Value,
    'class': vscode.CompletionItemKind.Class,
    'keyword': vscode.CompletionItemKind.Keyword,
    'namespace': vscode.CompletionItemKind.Module,
    'function': vscode.CompletionItemKind.Function,
    'special-form': vscode.CompletionItemKind.Keyword,
    'var': vscode.CompletionItemKind.Variable,
    'method': vscode.CompletionItemKind.Method,
};
class ClojureCompletionItemProvider {
    provideCompletionItems(document, position, token) {
        if (!cljConnection_1.cljConnection.isConnected())
            return Promise.reject('No nREPL connected.');
        // TODO: Use VSCode means for getting a current word
        let lineText = document.lineAt(position.line).text;
        let words = lineText.split(' ');
        let currentWord = words[words.length - 1].replace(/^[\('\[\{]+|[\)\]\}]+$/g, '');
        let text = document.getText();
        let ns = cljParser_1.cljParser.getNamespace(text);
        let currentWordLength = currentWord.length;
        let buildInsertText = (suggestion) => {
            return suggestion[0] === '.' ? suggestion.slice(1) : suggestion;
        };
        return nreplClient_1.nreplClient.complete(currentWord, ns).then(completions => {
            if (!('completions' in completions))
                return Promise.reject(undefined);
            let suggestions = completions.completions.map(element => ({
                label: element.candidate,
                kind: mappings[element.type] || vscode.CompletionItemKind.Text,
                insertText: buildInsertText(element.candidate)
            }));
            let completionList = new vscode.CompletionList(suggestions, false);
            return Promise.resolve(completionList);
        });
    }
    resolveCompletionItem(item, token) {
        let document = vscode.window.activeTextEditor.document;
        let ns = cljParser_1.cljParser.getNamespace(document.getText());
        return nreplClient_1.nreplClient.info(item.label, ns).then(info => {
            item.documentation = info.doc;
            return Promise.resolve(item);
        });
    }
}
exports.ClojureCompletionItemProvider = ClojureCompletionItemProvider;
//# sourceMappingURL=clojureSuggest.js.map