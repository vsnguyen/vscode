"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const editorUtils_1 = require("./editorUtils");
class ClojureHoverProvider {
    constructor(conn) {
        this.connection = conn;
    }
    provideHover(document, position, token) {
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
                    this.connection.doc(ns, variable, (err, msg) => {
                        if (err) {
                            reject(err);
                        }
                        else if (msg.constructor === Array && msg.length > 0) {
                            var docstring = msg[0]["doc"];
                            if (docstring == undefined) {
                                resolve(undefined);
                            }
                            else if (docstring.constructor === Array && docstring.length > 0) {
                                // let signature = docstring[1];
                                // docstring[1] = {langauge: "Clojure", value: signature};
                                // docstring[2] = {language: "Clojure", value: "```\n" + docstring[2].replace(/\\n/g,"\n") + "\n```"};
                                let hover = new vscode_1.Hover(docstring);
                                resolve(hover);
                            }
                            else {
                                resolve(undefined);
                            }
                        }
                        else {
                            resolve(undefined);
                        }
                    });
                }
                else {
                    resolve(undefined);
                }
            });
        }
        catch (Error) {
            return Promise.reject("");
        }
    }
}
exports.ClojureHoverProvider = ClojureHoverProvider;
//# sourceMappingURL=clojureHoverProvider.js.map