"use strict";
const vscode_1 = require("vscode");
const utils_1 = require("./utils");
exports.editorStates = utils_1.atom(new WeakMap());
function getEditorRange(editor) {
    const line = editor.document.lineCount - 1;
    const character = editor.document.lineAt(line).text.length;
    return new vscode_1.Range(new vscode_1.Position(0, 0), new vscode_1.Position(line, character));
}
exports.getEditorRange = getEditorRange;
//# sourceMappingURL=editor.js.map