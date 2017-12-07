"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const editorUtils_1 = require("./editorUtils");
class ClojureSignatureProvider {
    constructor(conn) {
        this.connection = conn;
    }
    provideSignatureHelp(document, position, token) {
        let self = this;
        let ns = editorUtils_1.EditorUtils.findNSDeclaration(document.getText());
        let wordRange = document.getWordRangeAtPosition(position);
        let variable = document.getText(wordRange);
        // ignore things outside of a namespace
        if (ns == null) {
            return Promise.reject("");
        }
        // ignore keywords
        if (variable.substr(0, 1) == ":") {
            return Promise.reject("");
        }
        try {
            return new Promise((resolve, reject) => {
                if (this.connection.isConnected()) {
                    this.connection.args(ns, variable, (err, msg) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            var args = msg[0]["args"];
                            if (args == undefined) {
                                resolve(undefined);
                            }
                            else {
                                let sigInfo = new vscode_1.SignatureInformation(variable);
                                sigInfo.parameters = args.map((arg) => {
                                    return new vscode_1.ParameterInformation(arg);
                                });
                                let sigHelp = new vscode_1.SignatureHelp();
                                sigHelp.signatures = [sigInfo];
                                resolve(sigHelp);
                            }
                        }
                    });
                }
                else {
                    resolve(undefined);
                }
            });
        }
        catch (Error) {
            return Promise.reject([]);
        }
    }
}
exports.ClojureSignatureProvider = ClojureSignatureProvider;
//# sourceMappingURL=cloureSignatureProvider.js.map