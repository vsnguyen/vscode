'use strict';
const status_bar_1 = require('./status_bar');
const utils = require('./utils');
const vscode_1 = require('vscode');
let paredit = require('paredit.js');
const languages = new Set(["clojure", "lisp", "scheme"]);
let enabled = true;
const navigate = (fn, ...args) => ({ textEditor, ast, selection }) => {
    let res = fn(ast, selection.cursor, ...args);
    utils.select(textEditor, res);
};
const navigateRange = (fn, ...args) => ({ textEditor, ast, selection }) => {
    let res = fn(ast, selection.start, selection.end, ...args);
    utils.select(textEditor, res);
};
function indent({ textEditor, range }) {
    let src = textEditor.document.getText(), ast = paredit.parse(src), res = paredit.editor.indentRange(ast, src, range.start, range.end);
    utils
        .edit(textEditor, utils.commands(res))
        .then((applied) => utils.undoStop(textEditor));
}
const edit = (fn, ...args) => ({ textEditor, src, ast, selection }) => {
    let res = fn(ast, src, selection.cursor, ...args);
    if (res)
        if (res.changes.length > 0) {
            let cmd = utils.commands(res), sel = { start: Math.min(...cmd.map(c => c.start)),
                end: Math.max(...cmd.map(utils.end)) };
            utils
                .edit(textEditor, cmd)
                .then((applied) => {
                utils.select(textEditor, res.newIndex);
                indent({ textEditor: textEditor,
                    range: sel });
            });
        }
        else
            utils.select(textEditor, res.newIndex);
};
const pareditCommands = [
    // NAVIGATION
    ['paredit.forwardSexp', navigate(paredit.navigator.forwardSexp)],
    ['paredit.backwardSexp', navigate(paredit.navigator.backwardSexp)],
    ['paredit.forwardDownSexp', navigate(paredit.navigator.forwardDownSexp)],
    ['paredit.backwardUpSexp', navigate(paredit.navigator.backwardUpSexp)],
    ['paredit.sexpRangeExpansion', navigateRange(paredit.navigator.sexpRangeExpansion)],
    ['paredit.closeList', navigate(paredit.navigator.closeList)],
    ['paredit.rangeForDefun', navigate(paredit.navigator.rangeForDefun)],
    // EDITING
    ['paredit.slurpSexpForward', edit(paredit.editor.slurpSexp, { 'backward': false })],
    ['paredit.slurpSexpBackward', edit(paredit.editor.slurpSexp, { 'backward': true })],
    ['paredit.barfSexpForward', edit(paredit.editor.barfSexp, { 'backward': false })],
    ['paredit.barfSexpBackward', edit(paredit.editor.barfSexp, { 'backward': true })],
    ['paredit.spliceSexp', edit(paredit.editor.spliceSexp)],
    ['paredit.splitSexp', edit(paredit.editor.splitSexp)],
    ['paredit.killSexpForward', edit(paredit.editor.killSexp, { 'backward': false })],
    ['paredit.killSexpBackward', edit(paredit.editor.killSexp, { 'backward': true })],
    ['paredit.spliceSexpKillForward', edit(paredit.editor.spliceSexpKill, { 'backward': false })],
    ['paredit.spliceSexpKillBackward', edit(paredit.editor.spliceSexpKill, { 'backward': true })],
    ['paredit.wrapAroundParens', edit(paredit.editor.wrapAround, '(', ')')],
    ['paredit.wrapAroundSquare', edit(paredit.editor.wrapAround, '[', ']')],
    ['paredit.wrapAroundCurly', edit(paredit.editor.wrapAround, '{', '}')],
    ['paredit.indentRange', indent],
    ['paredit.transpose', edit(paredit.editor.transpose)]];
function wrapPareditCommand(fn) {
    return () => {
        let textEditor = vscode_1.window.activeTextEditor;
        let doc = textEditor.document;
        if (!enabled || !languages.has(doc.languageId))
            return;
        let src = textEditor.document.getText();
        fn({ textEditor: textEditor,
            src: src,
            ast: paredit.parse(src),
            selection: utils.getSelection(textEditor) });
    };
}
function activate(context) {
    let statusBar = new status_bar_1.StatusBar();
    context.subscriptions.push(statusBar, vscode_1.commands.registerCommand('paredit.toggle', () => { enabled = !enabled; statusBar.enabled = enabled; }), vscode_1.window.onDidChangeActiveTextEditor((e) => statusBar.visible = languages.has(e.document.languageId)), ...pareditCommands
        .map(([command, fn]) => vscode_1.commands.registerCommand(command, wrapPareditCommand(fn))));
}
exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map