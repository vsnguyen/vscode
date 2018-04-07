"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const clojureMode_1 = require("./clojureMode");
const clojureSuggest_1 = require("./clojureSuggest");
const clojureEval_1 = require("./clojureEval");
const clojureDefinition_1 = require("./clojureDefinition");
const clojureConfiguration_1 = require("./clojureConfiguration");
const clojureHover_1 = require("./clojureHover");
const clojureSignature_1 = require("./clojureSignature");
const jarContentProvider_1 = require("./jarContentProvider");
const nreplController_1 = require("./nreplController");
const cljConnection_1 = require("./cljConnection");
const clojureFormat_1 = require("./clojureFormat");
function activate(context) {
    cljConnection_1.cljConnection.setCljContext(context);
    context.subscriptions.push(nreplController_1.nreplController);
    cljConnection_1.cljConnection.disconnect(false);
    var config = vscode.workspace.getConfiguration('clojureVSCode');
    if (config.autoStartNRepl) {
        cljConnection_1.cljConnection.startNRepl();
    }
    clojureFormat_1.maybeActivateFormatOnSave();
    vscode.commands.registerCommand('clojureVSCode.manuallyConnectToNRepl', cljConnection_1.cljConnection.manuallyConnect);
    vscode.commands.registerCommand('clojureVSCode.stopDisconnectNRepl', cljConnection_1.cljConnection.disconnect);
    vscode.commands.registerCommand('clojureVSCode.startNRepl', cljConnection_1.cljConnection.startNRepl);
    const evaluationResultChannel = vscode.window.createOutputChannel('Evaluation results');
    vscode.commands.registerCommand('clojureVSCode.eval', () => clojureEval_1.clojureEval(evaluationResultChannel));
    vscode.commands.registerCommand('clojureVSCode.evalAndShowResult', () => clojureEval_1.clojureEvalAndShowResult(evaluationResultChannel));
    vscode.commands.registerTextEditorCommand('clojureVSCode.formatFile', clojureFormat_1.formatFile);
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(clojureMode_1.CLOJURE_MODE, new clojureSuggest_1.ClojureCompletionItemProvider(), '.', '/'));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(clojureMode_1.CLOJURE_MODE, new clojureDefinition_1.ClojureDefinitionProvider()));
    context.subscriptions.push(vscode.languages.registerHoverProvider(clojureMode_1.CLOJURE_MODE, new clojureHover_1.ClojureHoverProvider()));
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(clojureMode_1.CLOJURE_MODE, new clojureSignature_1.ClojureSignatureProvider(), ' ', '\n'));
    vscode.workspace.registerTextDocumentContentProvider('jar', new jarContentProvider_1.JarContentProvider());
    vscode.languages.setLanguageConfiguration(clojureMode_1.CLOJURE_MODE.language, new clojureConfiguration_1.ClojureLanguageConfiguration());
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=clojureMain.js.map