/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const editorUtils_1 = require("./editorUtils");
const completionUtils_1 = require("./completionUtils");
let chalk = require("chalk");
let core = require('core-js/library');
// combine to arrays of CompletionItems by adding all the items from the second array that are not already represented
// in the first array to the first array
function joinAndRemoveDuplicates(list1, list2) {
    let rval = list1;
    let terms = list1.map((val) => {
        return val.label;
    });
    for (var ci of list2) {
        if (terms.indexOf(ci.label) == -1) {
            rval.push(ci);
        }
    }
    return rval;
}
class ClojureCompletionItemProvider {
    constructor(conn) {
        this.connection = conn;
    }
    completionsParams(document, position) {
        let fileContents = document.getText();
        var ns = editorUtils_1.EditorUtils.findNSDeclaration(fileContents);
        if (ns == null) {
            ns = "user";
        }
        let prefixRange = document.getWordRangeAtPosition(position);
        var prefix = "";
        if (prefixRange != null) {
            prefix = document.getText(prefixRange);
        }
        let offset = document.offsetAt(position) - 1;
        var src = fileContents.substring(0, offset) + "__prefix__" + fileContents.substring(offset + prefix.length);
        src = editorUtils_1.EditorUtils.escapeClojureCodeInString(src);
        return [src, ns, prefix, offset];
    }
    provideCompletionItems(document, position, token) {
        let self = this;
        // Get the parameters needed for completion
        let [src, ns, prefix, offset] = self.completionsParams(document, position);
        let rval = null;
        if (prefix == "") {
            rval = Promise.resolve(new vscode_1.CompletionList([], true));
        }
        else {
            rval = new Promise((resolve, reject) => {
                // Sometimes vscode freaks out and sends the whole source as the prefix
                // so I check for newlines and reject them here.
                if (prefix == "") {
                    let ci = new vscode_1.CompletionItem("");
                    resolve(new vscode_1.CompletionList([], true));
                }
                else {
                    // get string match completions
                    let allWords = src.match(/[^\s\(\)"',;~@#$%^&{}\[\]\\`\n]+/g);
                    let wordSet = new core.Set(allWords);
                    let words = core.Array.from(wordSet);
                    // find the actual matching words
                    let matches = words.filter((val) => {
                        return (val.substr(0, prefix.length) == prefix);
                    }).sort();
                    let textCompletions = matches.map((val) => {
                        let ci = new vscode_1.CompletionItem(val);
                        ci.kind = vscode_1.CompletionItemKind.Text;
                        return ci;
                    });
                    // Call Compliment to get the completions
                    // TODO - add optimization to check the length of the prefix and set isInComplete in the CompletionList
                    // to false if the length is > 3 chars (or whatever length namespace show up in the list at).
                    self.connection.findCompletions(ns, prefix, src, offset, (err, result) => {
                        if (result && result.length > 0) {
                            let results = completionUtils_1.CompletionUtils.complimentResultsToCompletionItems(result[0]["completions"]);
                            if (results != null) {
                                let completionList = new vscode_1.CompletionList(joinAndRemoveDuplicates(results, textCompletions), true);
                                completionList.isIncomplete = true;
                                resolve(completionList);
                            }
                            else {
                                resolve(new vscode_1.CompletionList([], true));
                            }
                        }
                        else {
                            //reject(err);
                            resolve(new vscode_1.CompletionList([], true));
                        }
                    });
                }
            });
        }
        return rval;
    }
}
exports.ClojureCompletionItemProvider = ClojureCompletionItemProvider;
//# sourceMappingURL=clojureCompletionItemProvider.js.map