"use strict";
function parenModeFailedMsg(currentFile) {
    return (`Parinfer was unable to parse ${currentFile}.
 It is likely that this file has unbalanced parentheses and will not compile.
 Parinfer will enter Paren Mode so you may fix the problem. Press Ctrl + ( to switch to Indent Mode once the file is balanced.`);
}
exports.parenModeFailedMsg = parenModeFailedMsg;
function parenModeChangedFileMsg(currentFile, diff) {
    return (`Parinfer needs to make some changes to ${currentFile} before enabling Indent Mode. These changes will only affect whitespace and indentation; the structure of the file will be unchanged.
 ${diff} ${diff === 1 ? "line" : "lines"} will be affected.
 Would you like Parinfer to modify the file? (recommended)`);
}
exports.parenModeChangedFileMsg = parenModeChangedFileMsg;
//# sourceMappingURL=messages.js.map