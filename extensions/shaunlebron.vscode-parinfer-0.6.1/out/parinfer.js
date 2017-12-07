"use strict";
const vscode_1 = require("vscode");
const parinfer_1 = require("parinfer");
const editor_1 = require("./editor");
const utils_1 = require("./utils");
const messages_1 = require("./messages");
function disableParinfer(editor) {
    editor_1.editorStates.update((states) => states.set(editor, "disabled"));
}
exports.disableParinfer = disableParinfer;
function _applyParinfer(editor, event, mode) {
    if (event && event.kind !== vscode_1.TextEditorSelectionChangeKind.Keyboard) {
        return;
    }
    const currentText = editor.document.getText();
    const lines = utils_1.splitLines(currentText);
    if (lines[lines.length - 1] !== "") {
        lines.push("");
    }
    const cursors = event ? event.selections : editor.selections;
    const cursor = event ? event.selections[0].active : editor.selection.active;
    const line = cursor.line;
    const multipleCursors = cursors.length > 1;
    const isSelection = (event ? event.selections[0].isEmpty : editor.selection.isEmpty) === false;
    const singleCursor = !(isSelection || multipleCursors);
    const startRow = utils_1.findStartRow(lines, line);
    const endRow = utils_1.findEndRow(lines, line);
    const opts = {
        cursorLine: line - startRow,
        cursorX: cursor.character
    };
    const linesToInfer = lines.slice(startRow, endRow);
    const textToInfer = linesToInfer.join("\n") + "\n";
    const result = mode === "paren-mode" ? parinfer_1.parenMode(textToInfer, opts) : parinfer_1.indentMode(textToInfer, opts);
    const parinferSuccess = result.success;
    const inferredText = parinferSuccess ? result.text : false;
    if (typeof inferredText === "string" && inferredText !== textToInfer) {
        editor.edit((edit) => {
            edit.replace(new vscode_1.Range(new vscode_1.Position(startRow, 0), new vscode_1.Position(endRow, 0)), inferredText);
        }, {
            undoStopAfter: false,
            undoStopBefore: false
        })
            .then((applied) => {
            if (applied) {
                const cursor = editor.selection.active;
                const nextCursor = cursor.with(cursor.line, result.cursorX);
                editor.selection = new vscode_1.Selection(nextCursor, nextCursor);
            }
        });
    }
}
function applyParinfer(editor, event) {
    const state = editor_1.editorStates.deref().get(editor);
    if (editor && state) {
        if (state === "indent-mode") {
            _applyParinfer(editor, event, "indent-mode");
        }
        if (state === "paren-mode") {
            _applyParinfer(editor, event, "paren-mode");
        }
    }
}
exports.applyParinfer = applyParinfer;
function parinfer(editor) {
    // This duplicates same languages in package.json under activationEvents.
    // They might be needed here too in case parinfer somehow bypasses those activationEvents?
    let shouldInit = (editor.document.languageId === "clojure" ||
        editor.document.languageId === "scheme" ||
        editor.document.languageId === "lisp" ||
        editor.document.languageId === "racket");
    editor_1.editorStates.update((states) => {
        const state = states.get(editor);
        if (!state && !shouldInit) {
            return states.set(editor, state);
        }
        else if (!state) {
            return states.set(editor, "disabled");
        }
        else {
            shouldInit = false;
            return states.set(editor, state);
        }
    });
    if (shouldInit) {
        const showOpenFileDialog = true;
        const currentFile = editor.document.fileName;
        const currentText = editor.document.getText();
        const parenModeResult = parinfer_1.parenMode(currentText);
        const parenModeSucceeded = parenModeResult.success === true;
        const parenModeText = parenModeResult.text;
        const textDelta = utils_1.linesDiff(currentText, parenModeText);
        const parenModeChangedFile = parenModeSucceeded && textDelta.diff !== 0;
        if (!parenModeSucceeded && showOpenFileDialog) {
            vscode_1.window.showInformationMessage(messages_1.parenModeFailedMsg(currentFile), "Ok")
                .then((btn) => {
                if (btn === "Ok") {
                    editor_1.editorStates.update((states) => states.set(editor, "paren-mode"));
                }
            });
        }
        else if (!parenModeSucceeded && !showOpenFileDialog) {
            editor_1.editorStates.update((states) => states.set(editor, "paren-mode"));
        }
        else if (parenModeChangedFile && showOpenFileDialog) {
            vscode_1.window.showInformationMessage(messages_1.parenModeChangedFileMsg(currentFile, textDelta.diff), "Yes", "No")
                .then((btn) => {
                if (btn === "Yes") {
                    editor.edit((edit) => {
                        edit.replace(editor_1.getEditorRange(editor), parenModeText);
                    });
                    editor_1.editorStates.update((states) => states.set(editor, "indent-mode"));
                }
            });
        }
        else if (parenModeChangedFile && !showOpenFileDialog) {
            editor.edit((edit) => {
                edit.replace(editor_1.getEditorRange(editor), parenModeText);
            });
            editor_1.editorStates.update((states) => states.set(editor, "indent-mode"));
        }
        else {
            let defaultMode = vscode_1.workspace.getConfiguration('parinfer').get("defaultMode");
            editor_1.editorStates.update((states) => states.set(editor, defaultMode));
        }
    }
}
exports.parinfer = parinfer;
//# sourceMappingURL=parinfer.js.map