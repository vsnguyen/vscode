"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const path_1 = require("path");
let find = require('find');
// Functions based on editor utils in proto-repl https://github.com/jasongilman/proto-repl
var PathResolution;
(function (PathResolution) {
    PathResolution.clientSrcPaths = {};
    // Get the full path to a source file. Input paths are of the form repl_test/core.clj.
    // The path is usually not an absolute path, e.g., repl_test/core.clj, so this is
    // necessarily not perfect as there may be more than one match.
    function convertDebuggerPathToClientPath(debuggerPath, line) {
        let rval = null;
        if (debuggerPath.substr(0, 1) == "/") {
            rval = debuggerPath;
        }
        else {
            // check our cache
            if (PathResolution.clientSrcPaths[debuggerPath]) {
                rval = PathResolution.clientSrcPaths[debuggerPath];
            }
            if (rval == null) {
                // brute force search the workspace for matches and then the tmp jars directories
                let regex = new RegExp(".*?" + debuggerPath);
                let files = find.fileSync(regex, vscode_1.workspace.rootPath);
                rval = files[0];
                if (rval == null) {
                    // check the tmp jars directories
                    const home = process.env["HOME"];
                    files = find.fileSync(regex, home + path_1.sep + ".lein" + path_1.sep + "tmp-vscode-jars");
                    rval = files[0];
                }
            }
            if (rval == null) {
                rval = "";
            }
            PathResolution.clientSrcPaths[debuggerPath] = rval;
            return rval;
        }
    }
    PathResolution.convertDebuggerPathToClientPath = convertDebuggerPathToClientPath;
})(PathResolution = exports.PathResolution || (exports.PathResolution = {}));
//# sourceMappingURL=pathResolution.js.map