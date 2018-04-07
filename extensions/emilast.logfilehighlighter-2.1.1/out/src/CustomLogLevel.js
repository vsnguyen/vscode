'use strict';
const vscode = require("vscode");
class CustomLogLevel {
    constructor(value, color) {
        this.value = value;
        this.color = color;
        this.regexes = this.createRegex(value);
        this.decoration = vscode.window.createTextEditorDecorationType({
            color: this.color,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }
    dispose() {
        this.decoration.dispose();
    }
    createRegex(logLevelValue) {
        const result = [];
        // Check if the log level value is a "simple" string or not.
        if (!/^\w+$/g.test(logLevelValue)) {
            // log level is already regex.
            try {
                result.push(new RegExp(logLevelValue, 'g'));
            }
            catch (err) {
                vscode.window.showErrorMessage('Regex of custom log level is invalid. Error: ' + err);
            }
        }
        else {
            // Log level consits only of "simple" characters -> build regex.
            const first = new RegExp('\\b(?!\\[)(' + logLevelValue.toUpperCase() +
                '|' + logLevelValue + ')(?!\\]|\\:)\\b', 'g');
            const second = new RegExp('\\[(' + logLevelValue + ')\\]|\\b(' + logLevelValue + ')\\:', 'ig');
            result.push(first, second);
        }
        return result;
    }
}
module.exports = CustomLogLevel;
//# sourceMappingURL=CustomLogLevel.js.map