/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
class ClojureDocumentRangeFormattingEditProvider {
    constructor(conn) {
        this.connection = conn;
    }
    provideDocumentRangeFormattingEdits(document, range, options, token) {
        let self = this;
        let codeString = document.getText(range);
        let rval = new Promise((resolve, reject) => {
            // Use the REPL to find the definition point
            if (self.connection.isConnected()) {
                self.connection.reformat(codeString, (err, result) => {
                    if (result && result.length > 0) {
                        var def = [];
                        let res = result[0];
                        if (res["code"]) {
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
exports.ClojureDocumentRangeFormattingEditProvider = ClojureDocumentRangeFormattingEditProvider;
//# sourceMappingURL=clojureDocumentRangeFormattingEditProvider.js.map