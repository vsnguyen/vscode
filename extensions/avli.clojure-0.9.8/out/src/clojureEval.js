"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const cljConnection_1 = require("./cljConnection");
const cljParser_1 = require("./cljParser");
const nreplClient_1 = require("./nreplClient");
function clojureEval(outputChannel) {
    evaluate(outputChannel, false);
}
exports.clojureEval = clojureEval;
function clojureEvalAndShowResult(outputChannel) {
    evaluate(outputChannel, true);
}
exports.clojureEvalAndShowResult = clojureEvalAndShowResult;
function evaluate(outputChannel, showResults) {
    if (!cljConnection_1.cljConnection.isConnected()) {
        vscode.window.showWarningMessage('You should connect to nREPL first to evaluate code.');
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const selection = editor.selection;
    let text = editor.document.getText();
    if (!selection.isEmpty) {
        const ns = cljParser_1.cljParser.getNamespace(text);
        text = `(ns ${ns})\n${editor.document.getText(selection)}`;
    }
    cljConnection_1.cljConnection.sessionForFilename(editor.document.fileName).then(session => {
        let response;
        if (!selection.isEmpty && session.type == 'ClojureScript') {
            // Piggieback's evalFile() ignores the text sent as part of the request
            // and just loads the whole file content from disk. So we use eval()
            // here, which as a drawback will give us a random temporary filename in
            // the stacktrace should an exception occur.
            response = nreplClient_1.nreplClient.evaluate(text, session.id);
        }
        else {
            response = nreplClient_1.nreplClient.evaluateFile(text, editor.document.fileName, session.id);
        }
        response.then(respObjs => {
            if (!!respObjs[0].ex)
                return handleError(outputChannel, selection, showResults, respObjs[0].session);
            return handleSuccess(outputChannel, showResults, respObjs);
        });
    });
}
function handleError(outputChannel, selection, showResults, session) {
    if (!showResults)
        vscode.window.showErrorMessage('Compilation error');
    return nreplClient_1.nreplClient.stacktrace(session)
        .then(stacktraceObjs => {
        const stacktraceObj = stacktraceObjs[0];
        let errLine = stacktraceObj.line !== undefined ? stacktraceObj.line - 1 : 0;
        let errChar = stacktraceObj.column !== undefined ? stacktraceObj.column - 1 : 0;
        if (!selection.isEmpty) {
            errLine += selection.start.line;
            errChar += selection.start.character;
        }
        outputChannel.appendLine(`${stacktraceObj.class} ${stacktraceObj.message}`);
        outputChannel.appendLine(` at ${stacktraceObj.file}:${errLine}:${errChar}`);
        stacktraceObj.stacktrace.forEach(trace => {
            if (trace.flags.indexOf('tooling') > -1)
                outputChannel.appendLine(`    ${trace.class}.${trace.method} (${trace.file}:${trace.line})`);
        });
        outputChannel.show();
        nreplClient_1.nreplClient.close(session);
    });
}
function handleSuccess(outputChannel, showResults, respObjs) {
    if (!showResults) {
        vscode.window.showInformationMessage('Successfully compiled');
    }
    else {
        respObjs.forEach(respObj => {
            if (respObj.out)
                outputChannel.append(respObj.out);
            if (respObj.err)
                outputChannel.append(respObj.err);
            if (respObj.value)
                outputChannel.appendLine(`=> ${respObj.value}`);
            outputChannel.show();
        });
    }
    nreplClient_1.nreplClient.close(respObjs[0].session);
}
//# sourceMappingURL=clojureEval.js.map