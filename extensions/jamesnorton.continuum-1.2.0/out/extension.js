/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const s = require("socket.io");
const vscode_1 = require("vscode");
const replConnection_1 = require("./replConnection");
const fs_extra_1 = require("fs-extra");
const stripJsonComments = require("strip-json-comments");
const clojureCompletionItemProvider_1 = require("./clojureCompletionItemProvider");
const clojureDefinitionProvider_1 = require("./clojureDefinitionProvider");
const clojureHoverProvider_1 = require("./clojureHoverProvider");
const clojureSignatureProvider_1 = require("./clojureSignatureProvider");
const clojureDocumentFormattingEditProvider_1 = require("./clojureDocumentFormattingEditProvider");
const clojureDocumentRangeFormattingEditProvider_1 = require("./clojureDocumentRangeFormattingEditProvider");
const editorUtils_1 = require("./editorUtils");
const pathResolution_1 = require("./pathResolution");
let stripAnsi = require('strip-ansi');
let lowlight = require("lowlight");
let EXIT_CMD = "(System/exit 0)";
let diagnostics;
let sequentialTestDirs = [];
let parallelTestDirs = ["test"];
var activeEditor = null;
var sideChannelSocket = null;
var exceptionBreakpointClassItem;
var activeReplActions = null;
var refreshOnLaunch = true;
var replActionsEnabled = false;
var replRunning = false;
const languageConfiguration = {
    comments: {
        "lineComment": ";"
    },
    brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
    ],
    wordPattern: /[^\s\(\)"',;~@#$%^&{}\[\]\\`\n]+/g
};
var debuggedProcessLaunched = false;
var rconn;
var outputChannel;
var extensionDir;
var lastEvalNS = "";
var lastEvalExp = "";
var evalResponse = {};
// returns the version of this extension
function getVersion() {
    const ext = vscode_1.extensions.getExtension("jamesnorton.continuum");
    const pkgJSON = ext.packageJSON;
    return pkgJSON["version"];
}
// returns the required debug-middleware version
function getMiddlewareVersion() {
    const ext = vscode_1.extensions.getExtension("jamesnorton.continuum");
    const pkgJSON = ext.packageJSON;
    return pkgJSON["debugMiddlewareVersion"];
}
// returns the ansi color coding corresponding to the css class given
function cssToAnsi(cssClass) {
    let rval = "";
    switch (cssClass) {
        case 'hljs-name':
            rval = "\x1b[34m";
            break;
        case 'hljs-builtin-name':
            rval = "\x1b[35m";
            break;
        case 'hljs-string':
            rval = "\x1b[31m";
            break;
        case 'hljs-number':
            rval = "\x1b[36m";
            break;
        case 'hljs-comment':
            rval = "\x1b[32m";
            break;
        default:
            break;
    }
    return rval;
}
// recursively walk the output from lowlight to create an ansi colorized code string
function walkCodeMap(acc, obj) {
    let rval = acc;
    if (obj.type) {
        if (obj.type == 'element') {
            const properties = obj.properties;
            if (properties) {
                const cssClass = properties.className[0];
                const ansiCode = cssToAnsi(cssClass);
                rval = rval + ansiCode;
            }
            for (var child of obj.children) {
                rval = walkCodeMap(rval, child);
            }
        }
        else if (obj.type == 'text') {
            rval = rval + obj.value + "\x1b[39m";
        }
    }
    else {
        // top level - iterate over value array
        for (var nextObj of obj.value) {
            rval = walkCodeMap(rval, nextObj);
        }
    }
    return rval;
}
// add syntax highlighting using ansi color codes for the given clojure code
function highlight(code) {
    const codeMap = lowlight.highlight('clojure', code);
    return walkCodeMap("", codeMap);
}
function handleEvalResponse(response) {
    vscode_1.window.setStatusBarMessage("Code Evaluated");
    let cfg = vscode_1.workspace.getConfiguration("clojure");
    for (var resp of response) {
        if (resp["ns"]) {
            evalResponse["ns"] = resp["ns"];
        }
        if (resp["status"]) {
            if (resp["status"][0] == "done") {
                let ns = lastEvalNS;
                if (evalResponse["ns"]) {
                    ns = evalResponse["ns"];
                }
                pout(ns + "=>");
                if (cfg.get('highlightSyntaxInRepl') == true) {
                    pout(highlight(lastEvalExp));
                }
                else {
                    pout(lastEvalExp);
                }
                if (evalResponse["ex"]) {
                    perr(evalResponse["ex"]);
                }
                if (evalResponse["root-ex"]) {
                    perr("Root exception: " + evalResponse["root-ex"]);
                }
                if (evalResponse["out"]) {
                    //pout(evalResponse["out"]);
                }
                if (evalResponse["value"]) {
                    pout(evalResponse["value"]);
                }
                evalResponse = {};
            }
            else if (resp["status"][0] == "eval-error") {
                evalResponse["ex"] = resp["ex"];
                evalResponse["root-ex"] = resp["root-ex"];
            }
        }
        if (resp["out"]) {
            if (evalResponse["out"] != null) {
                evalResponse["out"] = evalResponse["out"] + "\n" + resp["out"];
            }
            else {
                evalResponse["out"] = resp["out"];
            }
        }
        if (resp["value"]) {
            evalResponse["value"] = resp["value"];
        }
    }
}
// The following two functions are used to print to the debug console.
function pout(data) {
    if (sideChannelSocket && data) {
        sideChannelSocket.emit('pout', data + "\n");
    }
}
function perr(data) {
    if (sideChannelSocket && data) {
        sideChannelSocket.emit('perr', data + "\n");
    }
}
// render an ascii progress bar for tests as a string
function progressBar(status) {
    let rval = " [";
    // let type = status.match(/Parallel Test/)
    // if (type[0] == null){
    // 	type = ["Sequential Test"]
    // }
    const counts = status.match(/(\d+)\/(\d+)/);
    const numFinished = parseInt(counts[1]);
    const total = parseInt(counts[2]);
    const numPluses = 20 * numFinished / total;
    const numMinuses = (20 - numPluses) * 2.2;
    for (let i = 0; i < numPluses; i++) {
        rval = rval + "+";
    }
    for (let i = 0; i < numMinuses; i++) {
        rval = rval + " ";
    }
    return rval + "] ";
}
function initSideChannel(sideChannelPort) {
    // start up a side channel that the debug adapter can use to query the extension
    console.log("Setting up side channel on port " + sideChannelPort);
    vscode_1.window.setStatusBarMessage("Setting up side channel on port " + sideChannelPort);
    let sideChannel = s(sideChannelPort);
    sideChannel.on('connection', (sock) => {
        sideChannelSocket = sock;
        sock.on('connect-to-repl', (data) => {
            const reqId = data["id"];
            const hostPortString = data["hostPort"];
            var host, port;
            [host, port] = hostPortString.split(":");
            connect(reqId, sock, host, port);
        });
        sock.on('get-breakpoint-exception-class', (data) => {
            const reqId = data["id"];
            const itemStr = exceptionBreakpointClassItem.text;
            const classStr = itemStr.substr(8, itemStr.length);
            sock.emit('get-breakpoint-exception-class-result', { id: reqId, class: classStr });
        });
        // sock.on('get-source-paths', (paths) => {
        // 	console.log("Getting source paths");
        // 	rconn.getSourcePaths(paths, (err: any, result: any) => {
        // 		if (err) {
        // 			sock.emit('source-path-result', err);
        // 		} else {
        // 			sock.emit('source-path-result', result);
        // 		}
        // 	});
        // });
        sock.on('eval-code', (data) => {
            console.log("Evaluating code");
            vscode_1.window.setStatusBarMessage("$(pulse) Evaluating Code $(pulse)");
            const code = data["expression"];
            const reqId = data["id"];
            // let ns = EditorUtils.findNSForCurrentEditor(activeEditor);
            let ns = 'user';
            rconn.eval(code, (err, result) => {
                console.log("Code evaluated");
                vscode_1.window.setStatusBarMessage("Code Evaluated");
                if (err) {
                    sock.emit('eval-code-result', { id: reqId, error: err });
                }
                else {
                    sock.emit('eval-code-result', { id: reqId, result: result });
                }
            }, ns);
        });
        sock.on('create-diag', (data) => {
            const reqId = data["id"];
            let diagMap = data["diagnostic"];
            let uri = vscode_1.Uri.file(diagMap["file"]);
            let diags = diagnostics.get(uri);
            if (diags == null) {
                diags = [];
            }
            let line = Number(diagMap["line"]) - 1;
            let message = diagMap["message"];
            let dRange = new vscode_1.Range(line, 1, line, 100000);
            let diag = new vscode_1.Diagnostic(dRange, message, vscode_1.DiagnosticSeverity.Error);
            diags = diags.concat(diag);
            diagnostics.set(uri, diags);
            sock.emit('create-diag-result', { id: reqId, result: "OK" });
        });
        sock.on('set-status', (data) => {
            const reqId = data["id"];
            let status = data["status"];
            status = status.trim();
            const progress = progressBar(status);
            status = status.replace(/\[.*?\]/, progress);
            vscode_1.window.setStatusBarMessage(status);
            sock.emit('set-status-result', { id: reqId, result: "OK" });
        });
        sock.on('reapply-breakpoints', (data) => {
            const reqId = data["id"];
            const com = vscode_1.commands.executeCommand("workbench.debug.viewlet.action.reapplyBreakpointsAction");
            com.then(value => {
                sock.emit('reapply-breakpionts-result', { id: reqId, result: value });
            }, rejected => {
                console.error(rejected);
                sock.emit('reapply-breakpionts-request', { id: reqId, error: rejected });
            });
        });
        sock.on('load-namespace', (data) => {
            const reqId = data["id"];
            const ns = data["ns"];
            rconn.eval("(require '" + ns + ")", (err, result) => {
                if (err) {
                    sock.emit('load-namespace-result', { id: reqId, error: err });
                }
                sock.emit('load-namespace-result', { id: reqId });
            });
        });
        sock.on('get-workspace-root', (data) => {
            const reqId = data["id"];
            sock.emit('get-workspace-root-result', { id: reqId, result: vscode_1.workspace.rootPath });
        });
        sock.on('terminate-and-exit', (data) => {
            replRunning = false;
            sideChannelSocket = null;
            sideChannel.close();
            // terminate the process for the JVM
            rconn.pid((err, result) => {
                // TODO this seems to never be reached
                const pid = result[0]["pid"];
                //exec("kill -9 " + pid);
                process.kill(pid, "SIGKILL");
                rconn.close((err, msg) => {
                    console.log("Connection closed)");
                });
            });
        });
        sock.on('exit', (data) => {
            replRunning = false;
            sideChannelSocket = null;
            sideChannel.close();
            rconn.close((err, msg) => {
                console.log("Connection closed)");
            });
        });
        sock.emit('go-eval', {});
    });
}
// read the launch.json file to get relevant info
function parseLaunchJson() {
    let launchJson = null;
    let launchJsonPath = path_1.join(vscode_1.workspace.rootPath, ".vscode", "launch.json");
    if (fs_extra_1.existsSync(launchJsonPath)) {
        let launchJsonStr = fs_extra_1.readFileSync(launchJsonPath).toString();
        launchJson = JSON.parse(stripJsonComments(launchJsonStr));
    }
    return launchJson;
}
// Set up actions that work without the REPL
function setUpActions(context) {
    context.subscriptions.push(vscode_1.commands.registerCommand('clojure.expand_selection', () => {
        editorUtils_1.EditorUtils.selectBrackets(activeEditor);
    }));
    context.subscriptions.push(vscode_1.commands.registerCommand('clojure.startSession', config => startSession(config)));
    // context.subscriptions.push(commands.registerCommand('clojure.debug', () => {
    // 	// if launch.json exists and there are available configurations then offer a menu of choices to the user
    // 	let launchJson = parseLaunchJson();
    // 	if (launchJson) {
    // 		const configNames = launchJson["configurations"].map((config: any) => {
    // 			return config["name"];
    // 		});
    // 		if (!configNames || configNames.length < 1) {
    // 				window.showErrorMessage("Please add at least one configuration to launch.json before launching the debugger.");
    // 		} else {
    // 			const options = {placeHolder: "Choose a launch profile"};
    // 			window.showQuickPick(configNames, options).then((res)=> {
    // 				if (res) {
    // 					let configName = res;
    // 					let index = configNames.indexOf(configName);
    // 					let sideChannelPort: number = launchJson["configurations"][index]["sideChannelPort"];
    // 					let refresh = launchJson["configurations"][index]["refreshOnLaunch"];
    // 					if (refresh == false) {
    // 						refreshOnLaunch = false;
    // 					} else {
    // 						refreshOnLaunch = true;
    // 					}
    // 					initSideChannel(sideChannelPort);
    // 					window.setStatusBarMessage("Starting deugger");
    // 					commands.executeCommand('vscode.startDebug', configName);
    // 				}
    // 			});
    // 		}
    // 	} else {
    // 		window.showErrorMessage("Please create a launch.json file and add at least one configuration before launching the debugger.");
    // 	}
    // }));
}
function removeReplActions(context) {
    exceptionBreakpointClassItem.dispose();
    exceptionBreakpointClassItem = null;
    if (activeReplActions) {
        for (var disposable of activeReplActions) {
            let index = context.subscriptions.indexOf(disposable, 0);
            if (index > -1) {
                context.subscriptions.splice(index, 1);
            }
            disposable.dispose();
        }
        activeReplActions = null;
    }
}
// Add Diagnostics for tests that fail or error
function handleTestOutput(result) {
    if (diagnostics) {
        diagnostics.clear();
    }
    const errMsg = result[0]["err-msg"];
    if (errMsg) {
        //const message = "Error Running Tests\n\r" + errMsg
        //window.showErrorMessage(message)
        vscode_1.window.showErrorMessage("Error Running Tests");
    }
    else {
        const report = JSON.parse(result[0]["report"]);
        let failures = report["fail"];
        const errors = report["error"];
        for (let f of failures) {
            const source = f["source"];
            const m = source.match(/\(.*?\) \((.*?):(\d+)\)/);
            let file = m[1];
            const line = Number(m[2]) - 1;
            file = pathResolution_1.PathResolution.convertDebuggerPathToClientPath(file, line);
            if (file) {
                let uri = vscode_1.Uri.file(file);
                let diags = diagnostics.get(uri);
                if (diags == null) {
                    diags = [];
                }
                let dRange = new vscode_1.Range(line, 1, line, 100000);
                const message = "FAILURE:\r\n" + stripAnsi(f["description"]);
                let diag = new vscode_1.Diagnostic(dRange, message, vscode_1.DiagnosticSeverity.Error);
                diags = diags.concat(diag);
                diagnostics.set(uri, diags);
            }
        }
        for (let e of errors) {
            const source = e["source"];
            let file;
            let line;
            let m = source.match(/.*? \((.*?):(\d+)\)/);
            if (m) {
                file = m[1];
                line = Number(m[2]) - 1;
            }
            else {
                m = source.match(/\(.*?\)/);
                file = m[0];
                line = 1;
            }
            file = pathResolution_1.PathResolution.convertDebuggerPathToClientPath(file, line);
            if (file) {
                let uri = vscode_1.Uri.file(file);
                let diags = diagnostics.get(uri);
                if (diags == null) {
                    diags = [];
                }
                let dRange = new vscode_1.Range(line, 1, line, 100000);
                const message = "ERROR:\r\n" + stripAnsi(e["description"]);
                let diag = new vscode_1.Diagnostic(dRange, message, vscode_1.DiagnosticSeverity.Error);
                diags = diags.concat(diag);
                diagnostics.set(uri, diags);
            }
        }
    }
}
function setUpReplActions(context, rconn) {
    let cfg = vscode_1.workspace.getConfiguration("clojure");
    exceptionBreakpointClassItem = vscode_1.window.createStatusBarItem();
    exceptionBreakpointClassItem.text = "$(stop) Throwable";
    exceptionBreakpointClassItem.command = "clojure.setExceptionBreakpointClass";
    exceptionBreakpointClassItem.show();
    activeReplActions = [];
    activeReplActions.push(vscode_1.languages.registerCompletionItemProvider("clojure", new clojureCompletionItemProvider_1.ClojureCompletionItemProvider(rconn), ""));
    activeReplActions.push(vscode_1.languages.registerDefinitionProvider("clojure", new clojureDefinitionProvider_1.ClojureDefinitionProvider(rconn)));
    activeReplActions.push(vscode_1.languages.registerHoverProvider("clojure", new clojureHoverProvider_1.ClojureHoverProvider(rconn)));
    activeReplActions.push(vscode_1.languages.registerSignatureHelpProvider("clojure", new clojureSignatureProvider_1.ClojureSignatureProvider(rconn), ' ', '\n'));
    activeReplActions.push(vscode_1.languages.registerDocumentFormattingEditProvider("clojure", new clojureDocumentFormattingEditProvider_1.ClojureDocumentFormattingEditProvider(rconn)));
    activeReplActions.push(vscode_1.languages.registerDocumentRangeFormattingEditProvider("clojure", new clojureDocumentRangeFormattingEditProvider_1.ClojureDocumentRangeFormattingEditProvider(rconn)));
    ////////////////////////////////////////////////////
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.eval', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before evaluating code.");
        }
        else {
            // only support evaluating selected text for now.
            // See https://github.com/indiejames/vscode-clojure-debug/issues/39.
            vscode_1.window.setStatusBarMessage("$(pulse) Evaluating Code");
            let editor = vscode_1.window.activeTextEditor;
            let selection = editor.selection;
            let range = new vscode_1.Range(selection.start, selection.end);
            let code = editor.document.getText(range);
            lastEvalExp = code;
            let ns = editorUtils_1.EditorUtils.findNSForCurrentEditor(activeEditor);
            if (ns) {
                lastEvalNS = ns;
                rconn.eval(code, (err, result) => {
                    handleEvalResponse(result);
                }, ns);
            }
            else {
                lastEvalNS = "";
                rconn.eval(code, (err, result) => {
                    handleEvalResponse(result);
                });
            }
        }
    }));
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.setExceptionBreakpointClass', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before setting breakpionts.");
        }
        else {
            const input = vscode_1.window.showInputBox({ prompt: "Exception Class" });
            input.then(value => {
                exceptionBreakpointClassItem.text = "$(stop) " + value;
                // reapply breakpoints to update exception breakpoints
                const com = vscode_1.commands.executeCommand("workbench.debug.viewlet.action.reapplyBreakpointsAction");
                com.then(value => {
                    console.log(value);
                }, rejected => {
                    console.error(rejected);
                });
            });
        }
    }));
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.load-file', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before loading code.");
        }
        else {
            const path = editorUtils_1.EditorUtils.getFilePath(activeEditor);
            rconn.loadFile(path, (err, result) => {
                // TODO handle errors here
                // reapply the breakpoints since they will have been invalidated on any reloaded code
                const com = vscode_1.commands.executeCommand("workbench.debug.viewlet.action.reapplyBreakpointsAction");
                com.then(value => {
                    console.log(value);
                    console.log("Loaded Clojure code.");
                }, rejected => {
                    console.error(rejected);
                });
            });
        }
    }));
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.refresh', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before refreshing code.");
        }
        else {
            rconn.refresh((err, result) => {
                // TODO handle errors here
                // reapply the breakpoints since they will have been invalidated on any reloaded code
                const com = vscode_1.commands.executeCommand("workbench.debug.viewlet.action.reapplyBreakpointsAction");
                com.then(value => {
                    console.log(value);
                    console.log("Refreshed Clojure code.");
                }, rejected => {
                    console.error(rejected);
                });
            });
        }
    }));
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.superRefresh', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before refreshing code.");
        }
        else {
            rconn.superRefresh((err, result) => {
                // TODO handle errors here
                // reapply the breakpoints since they will have been invalidated on any reloaded code
                const com = vscode_1.commands.executeCommand("workbench.debug.viewlet.action.reapplyBreakpointsAction");
                com.then(value => {
                    console.log(value);
                    console.log("Refreshed Clojure code.");
                }, rejected => {
                    console.error(rejected);
                });
            });
        }
    }));
    // TODO create a test runner class and move these to it
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.run-all-tests', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before running tests.");
        }
        else {
            if (cfg.get("refreshNamespacesBeforeRunnningAllTests") === true) {
                console.log("Calling refresh...");
                rconn.refresh((err, result) => {
                    // TODO handle errors here
                    console.log("Refreshed Clojure code.");
                    rconn.runAllTests(parallelTestDirs, sequentialTestDirs, (err, result) => {
                        if (result) {
                            handleTestOutput(result);
                        }
                    });
                });
            }
            else {
                rconn.runAllTests(parallelTestDirs, sequentialTestDirs, (err, result) => {
                    console.log("All tests run.");
                    if (result) {
                        handleTestOutput(result);
                    }
                });
            }
        }
    }));
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.run-test-file', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before running tests.");
        }
        else {
            diagnostics = vscode_1.languages.createDiagnosticCollection("test results");
            let ns = editorUtils_1.EditorUtils.findNSForCurrentEditor(activeEditor);
            if (cfg.get("refreshNamespacesBeforeRunnningTestNamespace") === true) {
                rconn.refresh((err, result) => {
                    console.log("Refreshed Clojure code.");
                    rconn.runTestsInNS(ns, (err, result) => {
                        console.log("Tests for namespace " + ns + " run.");
                        if (result) {
                            handleTestOutput(result);
                        }
                    });
                });
            }
            else {
                rconn.runTestsInNS(ns, (err, result) => {
                    console.log("Tests for ns " + ns + " run.");
                    if (result) {
                        handleTestOutput(result);
                    }
                });
            }
        }
    }));
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.run-test', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before running tests.");
        }
        else {
            diagnostics = vscode_1.languages.createDiagnosticCollection("test results");
            let ns = editorUtils_1.EditorUtils.findNSForCurrentEditor(activeEditor);
            let test = editorUtils_1.EditorUtils.getSymobleUnderCursor(activeEditor);
            if (cfg.get("refreshNamespacesBeforeRunnningTest") === true) {
                rconn.refresh((err, result) => {
                    rconn.runTest(ns, test, (err, result) => {
                        if (result) {
                            handleTestOutput(result);
                        }
                        console.log("Test " + test + " run.");
                    });
                });
            }
            else {
                rconn.runTest(ns, test, (err, result) => {
                    if (result) {
                        handleTestOutput(result);
                    }
                    console.log("Test " + test + " run.");
                });
            }
        }
    }));
    activeReplActions.push(vscode_1.commands.registerCommand('clojure.fix-namespace-declaration', () => {
        if (!replRunning) {
            vscode_1.window.showErrorMessage("Please launch or attach to a REPL before attempting to autofix a namespace declaration.");
        }
        else {
            vscode_1.window.setStatusBarMessage("$(pulse) Fixing NS Declaration");
            const path = editorUtils_1.EditorUtils.getFilePath(activeEditor);
            rconn.fixNamespace(path, (err, result) => {
                if (err) {
                    console.log(err);
                }
                else {
                    let nsDeclaration = result[0]["value"];
                    nsDeclaration = nsDeclaration.replace(/\\n/g, "\n").replace(/"/g, "").replace(/\\/g, "\"");
                    // replace the declaration in the open file
                    const nsRange = editorUtils_1.EditorUtils.findNSDeclarationRange(activeEditor);
                    let editor = activeEditor;
                    editor.edit((editBuilder) => {
                        editBuilder.replace(nsRange, nsDeclaration);
                        vscode_1.window.setStatusBarMessage("Namespace Declaration Fixed");
                    });
                }
            });
        }
    }));
    context.subscriptions.concat(activeReplActions);
}
// Create a connection to the debugged process and run some init code
function connect(reqId, sock, host, port) {
    console.log("Attaching to debugged process");
    vscode_1.window.setStatusBarMessage("Attaching to debugged process");
    let cfg = vscode_1.workspace.getConfiguration("clojure");
    rconn.connect(host, port, (msg) => {
        if (msg["out"]) {
            pout(msg["out"]);
        }
        else {
            if (msg["err"]) {
                perr(msg["err"]);
            }
            else if (msg["value"]) {
                // pout(msg["value"]);
            }
        }
    }, (err, result) => {
        if (refreshOnLaunch) {
            rconn.refresh((err, result) => {
                if (err) {
                    console.error(err);
                }
                else {
                    rconn.eval("(use 'compliment.core)", (err, result) => {
                        console.log("Compliment namespace loaded");
                        replRunning = true;
                        sock.emit("connect-to-repl-complete", { id: reqId });
                        vscode_1.window.setStatusBarMessage("Attached to process");
                    });
                }
            });
        }
    });
}
// fill in the launch.json config that was chosen to start the REPL
function fillInConfig(config) {
    let extConfig = vscode_1.workspace.getConfiguration("clojure");
    if (!config["toolsJar"]) {
        config["toolsJar"] = extConfig["toolsJar"];
    }
    if (!config["leinPath"]) {
        config["leinPath"] = extConfig["leinPath"];
    }
    if (config["commandLine"]) {
        config["commandLine"] = config["commandLine"].map((entry) => {
            return entry.replace("$lein_path", extConfig["leinPath"]);
        });
    }
    if (config["refreshOnLaunch"] == null) {
        config["refreshOnLaunch"] = extConfig["refreshOnLaunch"];
    }
    if (!config["replPort"]) {
        config["replPort"] = extConfig["replPort"];
    }
    if (!config["debugReplPort"]) {
        config["debugReplPort"] = extConfig["debugReplPort"];
    }
    if (!config["debugPort"]) {
        config["debugPort"] = extConfig["debugPort"];
    }
    if (config["debug"] == null) {
        config["debug"] = true;
    }
    if (!config["sideChannelPort"]) {
        config["sideChannelPort"] = extConfig["sideChannelPort"];
    }
    if (!config["cwd"]) {
        config["cwd"] = vscode_1.workspace.rootPath;
    }
    config["version"] = getVersion();
    config["middlewareVersion"] = getMiddlewareVersion();
    // get the test dirs from the config
    if (config["sequentialTestDirs"]) {
        sequentialTestDirs = config["sequentialTestDirs"];
    }
    if (config["parallelTestDirs"]) {
        parallelTestDirs = config["parallelTestDirs"];
    }
    return config;
}
/**
 * The result type of the startSession command.
 */
class StartSessionResult {
}
;
function startSession(config) {
    let result = new StartSessionResult();
    pathResolution_1.PathResolution.clientSrcPaths = {};
    config = fillInConfig(config);
    const refresh = config["refreshOnLaunch"];
    if (refresh == false) {
        refreshOnLaunch = false;
    }
    else {
        refreshOnLaunch = true;
    }
    result.status = 'ok';
    result.content = config;
    let fixConfig = Promise.resolve();
    fixConfig.then(() => {
        if (config["debug"]) {
            vscode_1.window.setStatusBarMessage("Starting debugger");
        }
        else {
            vscode_1.window.setStatusBarMessage("Starting REPL");
        }
        vscode_1.commands.executeCommand('vscode.startDebug', config);
    });
    const sideChannelPort = config["sideChannelPort"];
    initSideChannel(sideChannelPort);
    return result;
}
function activate(context) {
    console.log("Starting Clojure extension...");
    let cfg = vscode_1.workspace.getConfiguration("clojure");
    vscode_1.window.setStatusBarMessage("Activating Extension");
    vscode_1.languages.setLanguageConfiguration("clojure", languageConfiguration);
    diagnostics = vscode_1.languages.createDiagnosticCollection("test results");
    // Keep track of the active file editor so we can execute code in the namespace currently
    // being edited. This is necessary because as of VS Code 1.5 the input to the debugger
    // gets returned by workspace.currentEditor when you type in it.
    activeEditor = vscode_1.window.activeTextEditor;
    vscode_1.window.onDidChangeActiveTextEditor((e) => {
        let doc = e.document;
        let fileName = doc.fileName;
        // don't count the debugger input as a text editor. this is used to get the namespace
        // in which to execute input code, so we only want to use actual file editors
        if (fileName != "input") {
            activeEditor = e;
        }
    });
    // Create the connection object but don't connect yet
    rconn = new replConnection_1.ReplConnection();
    setUpActions(context);
    setUpReplActions(context, rconn);
    // The server is implemented in node
    // let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
    // // The debug options for the server
    // let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };
    // // If the extension is launched in debug mode the debug server options are used.
    // // Otherwise the run options are used.
    // let serverOptions: ServerOptions = {
    // 	run : { module: serverModule, transport: TransportKind.ipc },
    // 	debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    // }
    // Options to control the language client
    // let clientOptions: LanguageClientOptions = {
    // 	// Register the server for plain text documents
    // 	documentSelector: ['clojure'],
    // 	synchronize: {
    // 		// Synchronize the setting section 'languageServerExample' to the server
    // 		configurationSection: 'languageServerExample',
    // 		// Notify the server about file changes to '.clientrc files contain in the workspace
    // 		fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
    // 	}
    // }
    // Create the language client and start the client.
    // let client = new LanguageClient('Language Server Example', serverOptions, clientOptions);
    // let disposable = client.start();
    // let promise = client.onReady();
    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    // context.subscriptions.push(disposable);
    console.log("Clojure extension active");
    vscode_1.window.setStatusBarMessage("Clojure extension active");
}
exports.activate = activate;
function deactivate(context) {
    context.subscriptions = [];
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map