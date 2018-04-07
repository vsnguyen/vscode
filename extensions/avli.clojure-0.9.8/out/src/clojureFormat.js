"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const cljConnection_1 = require("./cljConnection");
const nreplClient_1 = require("./nreplClient");
function slashEscape(contents) {
    return contents
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}
function slashUnescape(contents) {
    const replacements = { '\\\\': '\\', '\\n': '\n', '\\"': '"' };
    return contents.replace(/\\(\\|n|")/g, function (match) {
        return replacements[match];
    });
}
exports.formatFile = (textEditor, edit) => {
    if (!cljConnection_1.cljConnection.isConnected()) {
        vscode.window.showErrorMessage("Formatting functions don't work, connect to nREPL first.");
        return;
    }
    const selection = textEditor.selection;
    let contents = selection.isEmpty ? textEditor.document.getText() : textEditor.document.getText(selection);
    // Escaping the string before sending it to nREPL
    contents = slashEscape(contents);
    let cljfmtParams = vscode.workspace.getConfiguration('clojureVSCode').cljfmtParameters;
    cljfmtParams = cljfmtParams.isEmpty ? "nil" : "{" + cljfmtParams + "}";
    // Running "(require 'cljfmt.core)" in right after we have checked we are connected to nREPL
    // would be a better option but in this case "cljfmt.core/reformat-string" fails the first
    // time it is called. I have no idea what causes this behavior so I decided to put the require
    // statement right here - don't think it does any harm. If someone knows how to fix it
    // please send a pull request with a fix.
    nreplClient_1.nreplClient.evaluate(`(require 'cljfmt.core) (cljfmt.core/reformat-string "${contents}" ${cljfmtParams})`)
        .then(value => {
        if ('ex' in value[0]) {
            vscode.window.showErrorMessage(value[1].err);
            return;
        }
        ;
        if (('value' in value[1]) && (value[1].value != 'nil')) {
            let new_content = value[1].value.slice(1, -1);
            new_content = slashUnescape(new_content);
            let selection = textEditor.selection;
            if (textEditor.selection.isEmpty) {
                const lines = textEditor.document.getText().split(/\r?\n/g);
                const lastChar = lines[lines.length - 1].length;
                selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(textEditor.document.lineCount, lastChar));
            }
            textEditor.edit(editBuilder => {
                editBuilder.replace(selection, new_content);
            });
        }
        ;
    });
};
exports.maybeActivateFormatOnSave = () => {
    vscode.workspace.onWillSaveTextDocument(e => {
        const document = e.document;
        if (document.languageId !== "clojure") {
            return;
        }
        let textEditor = vscode.window.activeTextEditor;
        let editorConfig = vscode.workspace.getConfiguration('editor');
        const globalEditorFormatOnSave = editorConfig && editorConfig.has('formatOnSave') && editorConfig.get('formatOnSave') === true;
        let clojureConfig = vscode.workspace.getConfiguration('clojureVSCode');
        if ((clojureConfig.formatOnSave || globalEditorFormatOnSave) && textEditor.document === document) {
            exports.formatFile(textEditor, null);
        }
    });
};
//# sourceMappingURL=clojureFormat.js.map