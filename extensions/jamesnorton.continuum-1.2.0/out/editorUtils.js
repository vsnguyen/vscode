"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
// Functions based on editor utils in proto-repl https://github.com/jasongilman/proto-repl
var EditorUtils;
(function (EditorUtils) {
    class Scope {
        constructor(t, r) {
            this.type = t;
            this.range = r;
        }
        containsPosition(position) {
            return this.range.start.isBeforeOrEqual(position) && this.range.end.isAfterOrEqual(position);
        }
    }
    EditorUtils.Scope = Scope;
    // Escapes the Clojure code and places it in quotations
    function escapeClojureCodeInString(code) {
        let escaped = code.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
        return `\"${escaped}\"`;
    }
    EditorUtils.escapeClojureCodeInString = escapeClojureCodeInString;
    function getTopLevelForms(document) {
        var forms;
        for (var i = 0; i < document.lineCount; i++) {
            let line = document.lineAt(i);
            if (!line.isEmptyOrWhitespace) {
                // look for open or close parens/brackets or ;
                var inString = false;
                for (var j = 0; j < line.text.length; j++) {
                    let c = line.text.charAt(j);
                    //if (c)
                    if (["(", "[", "{"].indexOf(c) != -1) {
                    }
                }
            }
        }
        return forms;
    }
    EditorUtils.getTopLevelForms = getTopLevelForms;
    // Returns true if the position is in a comment
    //  export function inComment(editor: TextEditor, position: Position) {
    //    let text = editor.document.getText();
    //    let lines = text.split("\n");
    //    let offset = editor.document.offsetAt(position);
    //  }
    // Returns true if the given position is in a string
    //  export function isInString(editor: TextEditor, position: Position) {
    //    let offset = editor.document.offsetAt(position);
    //    let text = editor.document.getText();
    //     // find the position of all the quotation marks
    //     var start = 0;
    //     var inQuotes = false;
    //     while (start != -1 && start < offset) {
    //       start = text.indexOf("\"");
    //       if (start != -1 && start < offset && text[start - 1] != "\\") {
    //         inQuotes = !inQuotes;
    //       }
    //     }
    //     return inQuotes;
    //  }
    function makeRange(document, start, end) {
        let startPos = document.positionAt(start);
        let endPos = document.positionAt(end);
        return new vscode_1.Range(startPos, endPos);
    }
    // Returns the various scopes (comment, string) for a document and their ranges
    function getScopes(document) {
        var rval = new Array();
        var inString = false;
        var inComment = false;
        var rangeStart;
        let text = document.getText();
        // iterate over all the characters in the document
        for (var i = 0; i < text.length; i++) {
            let currentChar = text[i];
            if (inString) {
                if (currentChar == "\"") {
                    inString = false;
                    rval.push(new Scope("string", makeRange(document, rangeStart, i)));
                }
            }
            else if (inComment) {
                if (currentChar == "\n") {
                    inComment = false;
                    rval.push(new Scope("comment", makeRange(document, rangeStart, i)));
                }
            }
            else if (currentChar == "\"") {
                inString = true;
                rangeStart = i;
            }
            else if (currentChar == ";") {
                inComment = true;
                rangeStart = i;
            }
        }
        return rval;
    }
    EditorUtils.getScopes = getScopes;
    function scopesContainPosition(scopes, position) {
        for (var scope of scopes) {
            if (scope.containsPosition(position)) {
                return true;
            }
        }
        return false;
    }
    //Find the innermost form containing the cursor
    function getInnermostFormRange(document, position) {
        if (!document) {
            return; // No open document
        }
        let scopes = getScopes(document);
        let offset = document.offsetAt(position);
        // find the form containing the offset
        let text = document.getText();
        var start = -1;
        var end = -1;
        // find opening brace/paren
        for (var i = offset; i >= 0; i--) {
            let position = document.positionAt(i);
            if (!scopesContainPosition(scopes, position)) {
                let currentChar = text[i];
                if (currentChar == "{") {
                    if (i - 1 >= 0 && text[i - 1] == "#") {
                        start = i - 1;
                    }
                    else {
                        start = i;
                    }
                    break;
                }
                else if (currentChar == "(") {
                    if (i - 1 >= 0 && text[i - 1] == "#") {
                        start = i - 1;
                    }
                    else {
                        start = i;
                    }
                    break;
                }
                else if (currentChar == "[") {
                    start = i;
                    break;
                }
            }
        }
        // find ending brace/paren
        for (var i = offset; i < text.length; i++) {
            let position = document.positionAt(i);
            if (!scopesContainPosition(scopes, position)) {
                let currentChar = text[i];
                if (currentChar == "}" || currentChar == "]" || currentChar == ")") {
                    end = i;
                    break;
                }
            }
        }
        let startPos = document.positionAt(start);
        let endPos = document.positionAt(end);
        return new vscode_1.Range(startPos, endPos);
    }
    EditorUtils.getInnermostFormRange = getInnermostFormRange;
    function getInnermostForm(document, position) {
        if (!document) {
            return; // No open document
        }
        const range = getInnermostFormRange(document, position);
        if (!range) {
            return;
        }
        return document.getText(range);
    }
    EditorUtils.getInnermostForm = getInnermostForm;
    // Find the argument position of the current document position and the function name
    function getArgumentSignature(document, position) {
        let posIndex = document.offsetAt(position);
        const formOffsets = findContainingBracketPositions(document.getText(), posIndex);
        if (!formOffsets) {
            return;
        }
        const startPos = document.positionAt(formOffsets[0]);
        const endPos = document.positionAt(formOffsets[1]);
        const formRange = new vscode_1.Range(startPos, endPos);
        const form = document.getText(formRange);
        // only return args for function forms
        if (form && form.match(/\(.*/)) {
            // char index in form of position
            const posCharIndex = document.offsetAt(position) - formOffsets[0];
            // the part of the form to the left of the position
            const leftPart = form.substr(0, posCharIndex);
            const innerElementsStr = leftPart.replace("(", "").replace("\n", " ");
            // split the string on whitespace or comma and remove any empty strings
            const innerElements = innerElementsStr.split(/\s|,/).filter((val) => {
                return val.length != 0;
            });
            if (innerElements.length < 1) {
                return;
            }
            const func = innerElements[0];
            let argIndex = innerElements.length - 2;
            // if the character leftmost of the position is whitespace (or a comma) then
            // we have moved on to the next argument position
            if (innerElementsStr.match(/^.*(\s|,)$/)) {
                argIndex = argIndex + 1;
            }
            return [func, argIndex];
        }
    }
    EditorUtils.getArgumentSignature = getArgumentSignature;
    // Find the symbol under the cursor
    function getSymobleUnderCursor(editor) {
        if (!editor) {
            return; // No open text editor
        }
        var position = editor.selection.active;
        let wordRange = editor.document.getWordRangeAtPosition(position);
        var sym = editor.document.getText(wordRange);
        return sym;
    }
    EditorUtils.getSymobleUnderCursor = getSymobleUnderCursor;
    // Find the top level form containing the cursor
    function getTopLevelFormForCursor(editor) {
        if (!editor) {
            return; // No open text editor
        }
        var position = editor.selection.active;
    }
    EditorUtils.getTopLevelFormForCursor = getTopLevelFormForCursor;
    // Finds a Clojure Namespace declaration in the editor and returns the name
    // of the namespace.
    function findNSDeclaration(code) {
        let regex = /\(ns(\s+\^\{[\s\S]*?\})?\s+([\w\.\-_\d\*\+!\?]+)/;
        var ns = null;
        let match = regex.exec(code);
        if (match) {
            ns = match[2];
        }
        return ns;
    }
    EditorUtils.findNSDeclaration = findNSDeclaration;
    // Find the namespace for the currently open file
    function findNSForCurrentEditor(editor) {
        // get the contents of the current edtior
        if (!editor) {
            return; // No open text editor
        }
        const text = editor.document.getText();
        return findNSDeclaration(text);
    }
    EditorUtils.findNSForCurrentEditor = findNSForCurrentEditor;
    // Find the positions of the brackets that contain the given start and optional end positions.
    // Bracket in this context means parenthesis, square bracket, or squiggly bracket.
    function findContainingBracketPositions(text, startPosition, endPosition) {
        var startPos = startPosition;
        var endPos = startPosition;
        if (endPosition) {
            endPos = endPosition;
        }
        // find opening bracket
        var closingParenCount = 0;
        var closingSquareBracketCount = 0;
        var closingSquigglyBracketcount = 0;
        var pOpen;
        var pClose;
        for (pOpen = startPosition - 1; pOpen > -1; pOpen--) {
            let pChar = text[pOpen];
            if (pChar == '(') {
                if (closingParenCount == 0) {
                    break;
                }
                else {
                    closingParenCount -= 1;
                }
            }
            if (pChar == ')') {
                closingParenCount += 1;
            }
            if (pChar == '[') {
                if (closingSquareBracketCount == 0) {
                    break;
                }
                else {
                    closingSquareBracketCount -= 1;
                }
            }
            if (pChar == ']') {
                closingSquareBracketCount += 1;
            }
            if (pChar == '{') {
                if (closingSquigglyBracketcount == 0) {
                    break;
                }
                else {
                    closingSquigglyBracketcount -= 1;
                }
            }
            if (pChar == '}') {
                closingSquigglyBracketcount += 1;
            }
        }
        // Look for the closing matching bracket if we found an opening bracket
        if (pOpen != -1) {
            var openingParenCount = 0;
            var openingSquareBracketCount = 0;
            var openingSquigglyBracketCount = 0;
            for (pClose = endPos; pClose < text.length; pClose++) {
                let eChar = text[pClose];
                if (eChar == ')') {
                    if (openingParenCount == 0) {
                        break;
                    }
                    else {
                        openingParenCount -= 1;
                    }
                }
                if (eChar == '(') {
                    openingParenCount += 1;
                }
                if (eChar == ']') {
                    if (openingSquareBracketCount == 0) {
                        break;
                    }
                    else {
                        openingSquareBracketCount -= 1;
                    }
                }
                if (eChar == '[') {
                    openingSquareBracketCount += 1;
                }
                if (eChar == '}') {
                    if (openingSquigglyBracketCount == 0) {
                        break;
                    }
                    else {
                        openingSquigglyBracketCount -= 1;
                    }
                }
                if (eChar == '{') {
                    openingSquigglyBracketCount += 1;
                }
            }
            // Sanity check to make sure bracket types match
            let oChar = text[pOpen];
            let eChar = text[pClose];
            if ((oChar == '(' && eChar == ')') || (oChar == '[' && eChar == ']') || (oChar == '{' && eChar == '}')) {
                startPos = pOpen;
                endPos = pClose + 1;
            }
        }
        return [startPos, endPos];
    }
    EditorUtils.findContainingBracketPositions = findContainingBracketPositions;
    // Finds the Range occupied by the namespace declaration
    function findNSDeclarationRange(editor) {
        if (!editor) {
            return;
        }
        const text = editor.document.getText();
        let nsDeclare = "(ns";
        let charPos = text.indexOf(nsDeclare);
        if (charPos != -1) {
            const positions = findContainingBracketPositions(text, charPos + 1);
            const editStart = editor.document.positionAt(positions[0]);
            const editEnd = editor.document.positionAt(positions[1]);
            return new vscode_1.Range(editStart, editEnd);
        }
        return;
    }
    EditorUtils.findNSDeclarationRange = findNSDeclarationRange;
    // Expand selection to the next-outermost brackets containing the cursor.
    // Repeated invocations will expand selection to increasingly outer brackets.
    function selectBrackets(editor) {
        if (!editor) {
            return; // no open text editor
        }
        let document = editor.document;
        var startIndex = -1;
        var endIndex = document.getText().length;
        let selection = editor.selection;
        var newSelectionIndices;
        // If we have a selection and the cursor is not outside it, use it to find brackets
        if (selection.contains(selection.active)) {
            startIndex = document.offsetAt(selection.start);
            endIndex = document.offsetAt(selection.end);
            newSelectionIndices = findContainingBracketPositions(document.getText(), startIndex, endIndex);
        }
        else {
            startIndex = document.offsetAt(selection.active);
            newSelectionIndices = findContainingBracketPositions(document.getText(), startIndex);
        }
        let anchor = document.positionAt(newSelectionIndices[0]);
        let active = document.positionAt(newSelectionIndices[1]);
        let newSelection = new vscode_1.Selection(anchor, active);
        editor.selection = newSelection;
    }
    EditorUtils.selectBrackets = selectBrackets;
    // Get the file path for the given editor
    function getFilePath(editor) {
        if (!editor) {
            return; // no open text editor
        }
        return editor.document.fileName;
    }
    EditorUtils.getFilePath = getFilePath;
})(EditorUtils = exports.EditorUtils || (exports.EditorUtils = {}));
//# sourceMappingURL=editorUtils.js.map