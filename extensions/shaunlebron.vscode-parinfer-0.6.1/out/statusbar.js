"use strict";
const vscode_1 = require("vscode");
const utils_1 = require("./utils");
exports.statusBarItem = utils_1.atom();
function initStatusBar(cmd) {
    const sbItem = vscode_1.window.createStatusBarItem(vscode_1.StatusBarAlignment.Right);
    sbItem.command = cmd;
    sbItem.show();
    exports.statusBarItem.update(() => sbItem);
}
exports.initStatusBar = initStatusBar;
function setStatusDisabledIndicator(statusBarItem) {
    statusBarItem.text = "$(code)";
    statusBarItem.color = "#cccccc";
    statusBarItem.tooltip = "Parinfer is disabled";
}
function setStatusIndicator(statusBarItem, state) {
    const mode = state === "indent-mode" ? "Indent" : "Paren";
    statusBarItem.text = `$(code) ${mode}`;
    statusBarItem.color = "#ffffff";
    statusBarItem.tooltip = `Parinfer is in ${mode} mode`;
}
function updateStatusBar(state) {
    const sbItem = exports.statusBarItem.deref();
    if (typeof state !== "string") {
        sbItem.hide();
    }
    else if (state === "disabled") {
        setStatusDisabledIndicator(sbItem);
        sbItem.show();
    }
    else {
        setStatusIndicator(sbItem, state);
        sbItem.show();
    }
}
exports.updateStatusBar = updateStatusBar;
//# sourceMappingURL=statusbar.js.map