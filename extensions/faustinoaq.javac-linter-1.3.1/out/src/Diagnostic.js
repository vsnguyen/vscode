"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const child_process_1 = require("child_process");
const os_1 = require("os");
class Counter {
    static limit() {
        return 3;
    }
}
Counter.processes = 0;
exports.diagnosticCollection = vscode.languages.createDiagnosticCollection("java");
const config = vscode.workspace.getConfiguration("javac-linter");
let maxNumberOfProblems = config.maxNumberOfProblems || 20;
let classpath = config["classpath"];
let enable = config["enable"];
let javac = config["javac"];
function convertUriToPath(uri) {
    return decodeURI(uri.replace("file://", ""));
}
function getDiagnostic(document) {
    return __awaiter(this, void 0, void 0, function* () {
        if (Counter.processes < Counter.limit() && enable && document.languageId == "java") {
            Counter.processes += 1;
            try {
                let diagnostics = [];
                var cp = classpath.join(":");
                var filepath = convertUriToPath(document.uri.toString());
                if (os_1.platform() == 'win32') {
                    cp = classpath.join(";");
                    filepath = filepath.substr(1).replace(/%3A/g, ':').replace(/\//g, '\\');
                }
                var cmd = `"${javac}" -Xlint:unchecked -g -d "${classpath[0]}" -cp "${cp}" "${filepath}"`;
                console.log(cmd);
                yield child_process_1.exec(cmd, (err, stderr, stdout) => {
                    if (stdout) {
                        console.log(stdout);
                        let firstMsg = stdout.split(':')[1].trim();
                        if (firstMsg == "directory not found" ||
                            firstMsg == "invalid flag") {
                            console.error(firstMsg);
                            return;
                        }
                        let errors = stdout.split(filepath);
                        var lines = [];
                        var problemsCount = 0;
                        errors.forEach((element) => {
                            lines.push(element.split('\n'));
                        });
                        lines.every((element) => {
                            if (element.length > 2) {
                                problemsCount++;
                                if (problemsCount > maxNumberOfProblems) {
                                    return false;
                                }
                                let firstLine = element[0].split(':');
                                let line = parseInt(firstLine[1]) - 1;
                                let severity = firstLine[2].trim();
                                severity = severity == "error" ? vscode.DiagnosticSeverity.Error.valueOf : vscode.DiagnosticSeverity.Warning;
                                let column = element[2].length - 1;
                                let message = firstLine[3].trim();
                                let position = new vscode.Position(line, column);
                                diagnostics.push(new vscode.Diagnostic(new vscode.Range(position, position), message, severity));
                            }
                            return true;
                        });
                    }
                    Counter.processes -= 1;
                    exports.diagnosticCollection.set(document.uri, diagnostics);
                });
            }
            catch (e) {
                exports.diagnosticCollection.clear();
                Counter.processes -= 1;
                console.log(e);
            }
        }
    });
}
exports.getDiagnostic = getDiagnostic;
//# sourceMappingURL=Diagnostic.js.map