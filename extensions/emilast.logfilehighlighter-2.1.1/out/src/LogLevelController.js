'use strict';
const vscode = require("vscode");
class LogLevelController {
    constructor(colorizer) {
        this.LOG_ID = 'log';
        this._colorizer = colorizer;
        const subscriptions = [];
        // Subscribe to the events.
        vscode.workspace.onDidChangeConfiguration(() => {
            this.onDidChangeConfiguration();
        }, this, subscriptions);
        vscode.workspace.onDidChangeTextDocument((changedEvent) => {
            this.onDidChangeTextDocument(changedEvent);
        }, this, subscriptions);
        vscode.window.onDidChangeVisibleTextEditors((editors) => {
            this.onDidChangeVisibleTextEditors(editors);
        }, this, subscriptions);
        this._disposable = vscode.Disposable.from(...subscriptions);
        // Initial call.
        this.onDidChangeConfiguration();
    }
    dispose() {
        this._disposable.dispose();
        this._colorizer.dispose();
    }
    onDidChangeConfiguration() {
        this._colorizer.updateConfiguration();
        const logEditors = vscode.window.visibleTextEditors.filter((editor) => {
            return editor.document.languageId === this.LOG_ID;
        });
        if (logEditors.length !== 0) {
            this._colorizer.colorfyEditors(logEditors);
        }
    }
    onDidChangeTextDocument(changedEvent) {
        if (changedEvent.document.languageId === this.LOG_ID) {
            this._colorizer.colorfyDocument(changedEvent);
        }
    }
    onDidChangeVisibleTextEditors(editors) {
        const logEditors = editors.filter((editor) => {
            return editor.document.languageId === this.LOG_ID;
        });
        if (logEditors.length !== 0) {
            this._colorizer.colorfyEditors(logEditors);
        }
    }
}
module.exports = LogLevelController;
//# sourceMappingURL=LogLevelController.js.map