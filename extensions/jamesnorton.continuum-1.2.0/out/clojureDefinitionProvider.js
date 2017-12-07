/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const editorUtils_1 = require("./editorUtils");
const path = require("path");
const fs = require("fs");
const path_1 = require("path");
let chalk = require("chalk");
// get the subdirectories in the given directory
// (see http://stackoverflow.com/questions/18112204/get-all-directories-within-directory-nodejs)
function getSubDirectories(dirPath) {
    return fs.readdirSync(dirPath).filter(function (file) {
        return fs.statSync(path.join(dirPath, file)).isDirectory();
    });
}
// find the longest common path from the leaves up
function longestCommonPath(dmPath, dir) {
    let rval = null;
    const splitPath = dmPath.split(path_1.sep);
    for (let i = 1; i <= splitPath.length; i++) {
        let subPath = path_1.join.apply(null, splitPath.slice(splitPath.length - i));
        let searchPath = path_1.join(dir, subPath);
        if (fs.existsSync(searchPath)) {
            rval = searchPath;
        }
    }
    return rval;
}
// Make sure the returned path is either under the workspace or the tmp-jar directory.
// This was introduced to correct for the way the debug middleware deals with symlinks.
// That code uses .getResource using the Clojure ClassLoader, which returns the target
// path for symlinks instead of the link path. This was interfering with setting breakpoints
// in subprojects linked under the main project.
// path is expected to be absolute.
function normalizePath(dmPath) {
    let rval = dmPath;
    const projectPath = vscode_1.workspace.asRelativePath(dmPath);
    if (projectPath == dmPath) {
        // path is not contained in the project directory
        // look for it in the tmp-jars directory
        const homeDir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
        const tmpJarsDir = path_1.join(homeDir, ".lein", "tmp-vscode-jars");
        if (dmPath.substr(0, tmpJarsDir.length) != tmpJarsDir) {
            // the path is not in the tmp-vscode-jars directory so try to find a match under the
            // project directory by constructing subpaths from dmPath starting at the last element
            // and looking under the workspace for successively longer matches. For example:
            // dmPath: /homedir/my_project/namespace/file
            // Search for 'file' under the workspace root subdirectories, then 'namespace/file',
            // then 'my_project/namespace/file',
            // then /homedir/my_project/namespace/file, returning the longest match.
            const subDirs = getSubDirectories(vscode_1.workspace.rootPath);
            for (var subDir of subDirs) {
                const absSubDir = path_1.join(vscode_1.workspace.rootPath, subDir);
                let match = longestCommonPath(dmPath, absSubDir);
                if (match != null && (rval == dmPath || rval.length < match.length)) {
                    rval = match;
                }
            }
        }
    }
    return rval;
}
class ClojureDefinitionProvider {
    constructor(conn) {
        this.connection = conn;
    }
    provideDefinition(document, position, token) {
        let self = this;
        let ns = editorUtils_1.EditorUtils.findNSDeclaration(document.getText());
        let wordRange = document.getWordRangeAtPosition(position);
        let symbol = document.getText(wordRange);
        let rval = null;
        if (ns == null || symbol == "") {
            rval = Promise.reject(undefined);
        }
        else {
            rval = new Promise((resolve, reject) => {
                // Use the REPL to find the definition point
                if (self.connection.isConnected()) {
                    self.connection.findDefinition(ns, symbol, (err, result) => {
                        if (result && result.length > 0) {
                            var def = [];
                            let res = result[0];
                            if (res["message"]) {
                                // hack to get around false triggers, but keep warning about protocols
                                if (res["message"].match(/^Definition lookup for protocol methods.*$/)) {
                                    vscode_1.window.showInformationMessage(res["message"]);
                                }
                                reject(undefined);
                            }
                            else {
                                let uri = vscode_1.Uri.file(normalizePath(res["path"]));
                                let line = res["line"] - 1;
                                let pos = new vscode_1.Position(line, 0);
                                def = [new vscode_1.Location(uri, pos)];
                                resolve(def);
                            }
                        }
                        else {
                            reject(err);
                        }
                    });
                }
                else {
                    // The next line is commented out because it was triggering too often due to the
                    // many ways a definition can be asked for. Re-enable it if this changes.
                    //window.showErrorMessage("Please launch or attach to a REPL to enable definitions.")
                    reject(undefined);
                }
            });
        }
        return rval;
    }
}
exports.ClojureDefinitionProvider = ClojureDefinitionProvider;
//# sourceMappingURL=clojureDefinitionProvider.js.map