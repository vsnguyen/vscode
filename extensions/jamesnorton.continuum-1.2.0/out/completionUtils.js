"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
// Functions to work with completions from Compliment
var CompletionUtils;
(function (CompletionUtils) {
    // TODO find all the types returned by Compliment and add entries for them
    let typeMap = new Map();
    typeMap.set("function", vscode_1.CompletionItemKind.Function);
    typeMap.set("local", vscode_1.CompletionItemKind.Variable);
    // TODO request macro be added as a CompletionItemKind
    typeMap.set("macro", vscode_1.CompletionItemKind.Method);
    typeMap.set("namespace", vscode_1.CompletionItemKind.Module);
    typeMap.set("class", vscode_1.CompletionItemKind.Class);
    // Don't know what to use for vars. Maybe I should request a constant type be added to CompletionItemKind.
    typeMap.set("var", vscode_1.CompletionItemKind.Value);
    // TODO don't know if :protocol is actually a type returned by Compliment
    typeMap.set("protocol", vscode_1.CompletionItemKind.Interface);
    // TODO maybe find a better type
    typeMap.set("special-form", vscode_1.CompletionItemKind.Keyword);
    /**
     * Returns a CompletionItemKind that corresponds to the given type returned by Compliment.
    * @param type  And string representing the type of the completion (function, variable, etc.).
    */
    function typeKeywordToCompletionItemKind(type) {
        var kind = typeMap.get(type) || vscode_1.CompletionItemKind.Text;
        return kind;
    }
    CompletionUtils.typeKeywordToCompletionItemKind = typeKeywordToCompletionItemKind;
    /**
     * Converts a completion candidate from Compliment to a VSCode one.
     * */
    function complimentResultsToCompletionItems(completions) {
        var results = [];
        if (completions != null) {
            results = completions.map((candidateMap) => {
                let candidate = candidateMap["candidate"];
                let type = candidateMap["type"];
                var doc = candidateMap["docs"];
                doc = doc.replace(/\\n/g, "\n");
                var ns = candidateMap["ns"];
                if (ns == null) {
                    ns = "";
                }
                let ci = new vscode_1.CompletionItem(candidate);
                ci.kind = typeKeywordToCompletionItemKind(type);
                if (doc != "") {
                    ci.documentation = doc;
                }
                if (ns != "") {
                    ci.detail = `${type} ${ns}/${candidate}`;
                }
                else {
                    ci.detail = `${type} ${candidate}`;
                }
                return ci;
            });
        }
        return results;
    }
    CompletionUtils.complimentResultsToCompletionItems = complimentResultsToCompletionItems;
})(CompletionUtils = exports.CompletionUtils || (exports.CompletionUtils = {}));
//# sourceMappingURL=completionUtils.js.map