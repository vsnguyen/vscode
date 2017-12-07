"use strict";
const vscode_1 = require("vscode");
const statusbar_1 = require("./statusbar");
const editor_1 = require("./editor");
const parinfer_1 = require("./parinfer");
editor_1.editorStates.addWatch((states) => {
    const editor = vscode_1.window.activeTextEditor;
    const currentEditorState = states.get(editor);
    if (editor && currentEditorState) {
        statusbar_1.updateStatusBar(currentEditorState);
        if (currentEditorState === "indent-mode" ||
            currentEditorState === "paren-mode") {
            parinfer_1.applyParinfer(editor);
        }
    }
    else if (editor) {
        statusbar_1.updateStatusBar();
    }
});
function toggleMode(editor) {
    editor_1.editorStates.update((states) => {
        const nextState = states.get(editor) === "paren-mode" ? "indent-mode" : "paren-mode";
        return states.set(editor, nextState);
    });
}
function activatePane(editor) {
    if (editor) {
        parinfer_1.parinfer(editor);
    }
}
function activate(context) {
    statusbar_1.initStatusBar("parinfer.toggleMode");
    activatePane(vscode_1.window.activeTextEditor);
    context.subscriptions.push(vscode_1.commands.registerCommand("parinfer.toggleMode", () => {
        toggleMode(vscode_1.window.activeTextEditor);
    }), vscode_1.commands.registerCommand("parinfer.disable", () => {
        parinfer_1.disableParinfer(vscode_1.window.activeTextEditor);
    }), vscode_1.window.onDidChangeTextEditorSelection((event) => {
        parinfer_1.applyParinfer(vscode_1.window.activeTextEditor, event);
    }), vscode_1.window.onDidChangeActiveTextEditor(activatePane));
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map