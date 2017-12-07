/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
class ClojureDocumentFormattingEditProvider {
    constructor(conn) {
        this.connection = conn;
    }
    provideDocumentFormattingEdits(document, options, token) {
        let self = this;
        let codeString = document.getText();
        let rval = new Promise((resolve, reject) => {
            // Use the REPL to find the definition point
            if (self.connection.isConnected()) {
                self.connection.reformat(codeString, (err, result) => {
                    if (result && result.length > 0) {
                        var def = [];
                        let res = result[0];
                        if (res["code"]) {
                            // replace the whole document
                            let range = new vscode_1.Range(new vscode_1.Position(0, 0), new vscode_1.Position(document.lineCount - 1, 1000000));
                            let edit = vscode_1.TextEdit.replace(range, res["code"]);
                            resolve([edit]);
                        }
                    }
                    else {
                        reject(err);
                    }
                });
            }
            else {
                // The next line is commented out because it was triggering too ofter due to the
                // many ways a definition can be asked for. Re-enable it if this changes.
                //window.showErrorMessage("Please launch or attach to a REPL to enable definitions.")
                reject(undefined);
            }
        });
        return rval;
    }
}
exports.ClojureDocumentFormattingEditProvider = ClojureDocumentFormattingEditProvider;
//# sourceMappingURL=clojureDocumentFormattingEditProvider.js.map