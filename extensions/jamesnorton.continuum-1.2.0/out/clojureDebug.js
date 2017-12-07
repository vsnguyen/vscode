/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
///<reference path="node.d.ts"/>
/// <reference path="tmp/index.d.ts" />
const vscode_debugadapter_1 = require("vscode-debugadapter");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const child_process_1 = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const s = require("socket.io-client");
const tmp = require("tmp");
const replConnection_1 = require("./replConnection");
const jsedn_1 = require("jsedn");
let stripAnsi = require('strip-ansi');
let chalk = require("chalk");
let find = require('find');
let core = require('core-js/library');
let EXIT_CMD = "(System/exit 0)";
let projectClj = `(defproject repl_connect "0.1.0-SNAPSHOT"
  :description "Embedded project for Debug REPL."
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :profiles {:dev {:dependencies [[debug-middleware #=(eval (System/getenv \"DEBUG_MIDDLEWARE_VERSION\"))]]
                   :repl-options {:nrepl-middleware [debug-middleware.core/debug-middleware]}}}
  :resource-paths []
  :dependencies [[org.clojure/clojure "1.8.0"]])`;
// Constants to represent the various states of the debugger
class DebuggerState {
    static get PRE_LAUNCH() { return "PRE_LAUNCH"; }
    static get DEBUGGED_REPL_STARTED() { return "DEBUGGED_REPL_STARTED"; }
    static get REPL_STARTED() { return "REPL_STARTED"; }
    static get REPL_ATTACHED() { return "REPL_ATTACHED"; }
    static get DEBUGGER_ATTACHED() { return "DEBUGGER_ATTACHED"; }
    static get REPL_READY() { return "REPL_READY"; }
    static get LAUNCH_COMPLETE() { return "LAUNCH_COMPLETE"; }
}
class DebuggerSubState {
    static get NOOP() { return "NOOP"; }
    static get EVENT_IN_PROGRESS() { return "EVENT_IN_PROGRESS"; }
    static get BREAKPOINT_HIT() { return "BREAKPOINT_HIT"; }
}
// needed because Array.includes was not available on Windows or more likely I just don't know
// what I'm doing with the different versions of TypeScript
function includes(arry, val) {
    for (var v of arry) {
        if (v == val) {
            return true;
        }
    }
    return false;
}
// get the subdirectories in the given directory
// (see http://stackoverflow.com/questions/18112204/get-all-directories-within-directory-nodejs)
function getSubDirectories(dirPath) {
    return fs.readdirSync(dirPath).filter(function (file) {
        return fs.statSync(path.join(dirPath, file)).isDirectory();
    });
}
// find the longest common path from the leaves up
function longestCommonPath(dPath, dir) {
    let rval = null;
    const splitPath = dPath.split(path_1.sep);
    for (let i = 1; i <= splitPath.length; i++) {
        let subPath = path_1.join.apply(null, splitPath.slice(splitPath.length - i));
        let searchPath = path_1.join(dir, subPath);
        if (fs.existsSync(searchPath)) {
            rval = searchPath;
        }
    }
    return rval;
}
function normalizePath(dPath, cwd) {
    let rval = dPath;
    const subDirs = getSubDirectories(cwd);
    for (var subDir of subDirs) {
        const absSubDir = path_1.join(cwd, subDir);
        let match = longestCommonPath(dPath, absSubDir);
        if (match != null && (rval == dPath || rval.length < match.length)) {
            rval = match;
        }
    }
    return rval;
}
// remove comand markers from output stream
function cleanOutput(output) {
    let rval = output.replace(/(\d+\/\d+)[\s\S]*?ETA[\s\S]*?(..:..)/g, "");
    // rval = rval.replace(/# ERROR-START [\s\S]*?#+/, "").replace(/# ERROR-END [\s\S]*?#+/, "")
    return rval;
}
class ClojureDebugSession extends vscode_debugadapter_1.DebugSession {
    constructor(_debuggerLinesStartAt1 = true, isServer = false) {
        // We always use debuggerLinesStartAt1 = true for Clojure
        super(true, isServer);
        // map of side channel request ids to debug request data
        this.requestData = {};
        // side channel request id seqeunce
        this.requestId = 0;
        // cache of src paths to facillitate efficient lookup at breakpoints, etc.
        this.debuggerSrcPaths = {};
        // cache of actual src paths to facillitate efficient lookup when setting breakpoints
        this.clientSrcPaths = {};
        // string buffer used to build up output until an event is detected in the output
        // via regex
        this.outputBuffer = "";
        this.threadIndex = 0;
        this.threads = [];
        // which tests if any, are running (parallel or sequential)
        this.testingStatus = "none";
        this.isLaunched = false;
        this._breakPoints = {};
        this.variableHandles = new vscode_debugadapter_1.Handles();
        this._debuggerState = DebuggerState.PRE_LAUNCH;
        this._debuggerSubState = DebuggerSubState.NOOP;
        this.evalResults = {};
        this.frames = [];
    }
    // get and increment the requestId for side channel requests
    getNextRequestId() {
        const rval = this.requestId;
        this.requestId = this.requestId + 1;
        return rval;
    }
    // Get the path wrt the current working directory (cwd) for the given
    // path. The debugger expects the source path to be under the cwd, but
    // this is not always the case. Used for setting breakpoints.
    convertClientPathToDebuggerPath(clientPath) {
        // check our cache
        let rval = this.debuggerSrcPaths[clientPath];
        if (rval == null) {
            // brute force search the current working directory for matches and then the tmp jars directories
            rval = normalizePath(clientPath, this.cwd);
            if (rval == null) {
                const home = process.env["HOME"];
                rval = normalizePath(clientPath, home + path_1.sep + ".lein" + path_1.sep + "tmp-vscode-jars");
            }
        }
        if (rval == null) {
            rval = "";
        }
        this.debuggerSrcPaths[clientPath] = rval;
        return rval;
    }
    // Get the full path to a source file. Input paths are of the form repl_test/core.clj.
    // The path is usually not an absolute path, e.g., repl_test/core.clj, so this is
    // necessarily not perfect as there may be more than one match. Used for returning
    // paths from breakpoint events.
    convertDebuggerPathToClientPath(debuggerPath, line) {
        let rval = null;
        if (debuggerPath.substr(0, 1) == "/") {
            rval = debuggerPath;
        }
        else {
            // check our cache
            if (this.clientSrcPaths[debuggerPath]) {
                rval = this.clientSrcPaths[debuggerPath];
            }
            else {
                // check for perfect match by path and line number matching a set breakpoint
                for (let srcPath in this._breakPoints) {
                    const lines = this._breakPoints[srcPath];
                    if (core.String.endsWith(srcPath, debuggerPath) && includes(lines, line)) {
                        rval = srcPath;
                        break;
                    }
                }
            }
            if (rval == null) {
                // brute force search the workspace for matches and then the tmp jars directories
                let regex = new RegExp(".*?" + debuggerPath);
                let files = find.fileSync(regex, this.workspaceRoot);
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
            this.clientSrcPaths[debuggerPath] = rval;
            return rval;
        }
    }
    // Get test failure data from output
    getTestFailtureData(output) {
        let rval = {};
        let match = output.match(/# FAIL-START (\d+) #############################################[\s\S]*FAIL in \(.*?\) \((.*?):(.*?)\)[\s\S]*(expected: [\s\S]*actual:[\s\S]*)# FAIL-END \1 ###############################################/);
        if (match) {
            rval["file"] = this.convertDebuggerPathToClientPath(match[2], Number(match[3]));
            rval["line"] = match[3];
            rval["message"] = match[4];
        }
        return rval;
    }
    // Get test error data from output
    getTestErrorData(output) {
        let rval = {};
        let match = output.match(/# ERROR-START (\d+) #############################################[\s\S]*ERROR in \(.*?\) \((.*?):(.*?)\)[\s\S]*(expected: [\s\S]*actual:[\s\S]*)# ERROR-END \1 ###############################################/);
        if (match) {
            rval["file"] = this.convertDebuggerPathToClientPath(match[2], Number(match[3]));
            rval["line"] = match[3];
            rval["message"] = match[4];
        }
        return rval;
    }
    // update the list of Threads with the given list of thread names
    updateThreads(thds) {
        // add in new threads
        for (let t of thds) {
            // TypeScript arrays don't have a `find` method
            let index = -1;
            for (let i = 0; i < this.threads.length; i++) {
                const thread = this.threads[i];
                if (thread.name == t) {
                    index = i;
                    break;
                }
            }
            if (index == -1) {
                const newThread = new vscode_debugadapter_1.Thread(this.threadIndex, t);
                this.threadIndex = this.threadIndex + 1;
                this.threads.push(newThread);
            }
        }
        // remove threads that aren't on the new list
        this.threads = this.threads.filter((value) => {
            if (thds.indexOf(value.name) != -1) {
                return true;
            }
            else {
                return false;
            }
        });
    }
    // Returns the Thread with the given name.
    threadWithName(name) {
        // TypeScript arrays don't have a `find` method
        let index = -1;
        for (let i = 0; i < this.threads.length; i++) {
            const thread = this.threads[i];
            if (thread.name == name) {
                index = i;
                break;
            }
        }
        let rval = null;
        if (index != -1) {
            rval = this.threads[index];
        }
        return rval;
    }
    // Returns the Thread with the given id
    threadWithID(id) {
        let rval = null;
        for (let i = 0; i < this.threads.length; i++) {
            const t = this.threads[i];
            if (t.id == id) {
                rval = t;
                break;
            }
        }
        return rval;
    }
    // send data form the REPL's stdout to be displayed in the debugger
    output(text, category) {
        const outputEvent = new vscode_debugadapter_1.OutputEvent(text, category);
        this.sendEvent(outputEvent);
        console.log(text);
    }
    pout(text) {
        this.output(text, "stdout");
    }
    perr(text) {
        this.output(text, "stderr");
    }
    // parse the output from the debugged process to look for events like test results
    parseOutput(output, response, args) {
        let totalOutput = this.outputBuffer + "\n" + output;
        // strip non-ascii chars
        const stripped = stripAnsi(totalOutput);
        let progressMatch = stripped.match(/(\d+\/\d+).*?ETA.*?(..:..)/g);
        if (progressMatch) {
            const reqId = this.getNextRequestId();
            const status = this.testingStatus + " Tests " + progressMatch[progressMatch.length - 1];
            this.sideChannel.emit('set-status', { id: reqId, status: status });
            this.outputBuffer = "";
        }
        else {
            if (stripped.match(/Running parallel tests/g)) {
                this.testingStatus = "Parallel";
            }
            else if (stripped.match(/Running tests in namespace \[\s(.*?)\s\]/)) {
                const namespace = stripped.match(/Running tests in namespace \[\s(.*?)\s\]/)[1];
                const segments = namespace.split(".");
                this.testingStatus = segments[segments.length - 1];
            }
            else if (stripped.match(/Running sequential tests/g)) {
                this.testingStatus = "Sequential";
            }
            else if ((totalOutput.search(/nREPL server started/) != -1)) {
                this.setUpDebugREPL(response, args);
                this.outputBuffer = "";
            }
            else {
                this.outputBuffer = this.outputBuffer + "\n" + output;
            }
        }
        if (this._debuggerState == DebuggerState.REPL_STARTED && stripped.search(/user=>/) != -1) {
            // tell the extension to connect
            const reqId = this.getNextRequestId();
            let primaryReplPort = 5555;
            if (args.replPort) {
                primaryReplPort = args.replPort;
            }
            let replHost = "127.0.0.1";
            if (args["replHost"]) {
                replHost = args["replHost"];
            }
            this.requestData[reqId] = { response: response };
            this.sideChannel.emit("connect-to-repl", { id: reqId, hostPort: replHost + ":" + primaryReplPort });
            this._debuggerState = DebuggerState.REPL_ATTACHED;
        }
        this.pout(cleanOutput(output));
    }
    setUpSideChannel() {
        const self = this;
        this.sideChannel = s("http://localhost:" + this.sideChannelPort);
        this.sideChannel.on('connect-to-repl-complete', (resp) => {
            const respId = resp["id"];
            let reqData = self.requestData[respId];
            let response = reqData["response"];
            delete self.requestData[respId];
            // we just start to run until we hit a breakpoint or an exception
            response.body = {
                /** If true, the continue request has ignored the specified thread and continued all threads instead. If this attribute is missing a value of 'true' is assumed for backward compatibility. */
                allThreadsContinued: true
            };
            self.continueRequest(response, { threadId: ClojureDebugSession.THREAD_ID });
            // announce that we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
            self.sendEvent(new vscode_debugadapter_1.InitializedEvent());
        });
        // These two handlers let the extension print to the debug console
        this.sideChannel.on('pout', (data) => {
            this.pout(data);
        });
        this.sideChannel.on('perr', (data) => {
            this.perr(data);
        });
        this.sideChannel.on('set-status-result', (result) => {
            const respId = result["id"];
            delete self.requestData[respId];
        });
        this.sideChannel.on('create-diag-result', (result) => {
            const respId = result["id"];
            delete self.requestData[respId];
        });
        // used by set breakpoint requests
        this.sideChannel.on('load-namespace-result', (result) => {
            const respId = result["id"];
            const reqData = self.requestData[respId];
            const response = reqData["response"];
            const args = reqData["args"];
            const pth = reqData["path"];
            delete self.requestData[respId];
            self.finishBreakPointsRequest(response, args, pth);
        });
        // used to set the workspace root on debugger initialization
        this.sideChannel.on('get-workspace-root-result', (result) => {
            self.workspaceRoot = result["result"];
        });
        ;
        // handle exception breakpoint requests
        this.sideChannel.on('get-breakpoint-exception-class-result', (result) => {
            const respId = result["id"];
            const reqData = self.requestData[respId];
            const args = reqData["args"];
            const response = reqData["response"];
            delete self.requestData[respId];
            let type = "none";
            if (args.filters.indexOf("all-exceptions") != -1) {
                type = "all";
            }
            let exClass = "Throwable";
            if (result["class"] && result["class"] != "") {
                exClass = result["class"];
                self.replConnection.setExceptionBreakpoint(type, exClass, (err, result) => {
                    if (err) {
                        response.success = false;
                    }
                    else {
                        response.success = true;
                    }
                    this.sendResponse(response);
                });
            }
        });
        // eval requests
        this.sideChannel.on('eval-code-result', (result) => {
            const respId = result["id"];
            const reqData = self.requestData[respId];
            const response = reqData["response"];
            for (let res of result["result"]) {
                if (res["status"] && res["status"] == ["done"]) {
                    delete self.requestData[respId];
                }
                // TODO prevent this from attempting to send more than one response - gather up the results
                // and send them when "status" is "done".
                self.handleResult(response, res);
            }
        });
        this.sideChannel.emit('get-workspace-root', { id: this.getNextRequestId() });
    }
    initializeRequest(response, args) {
        //this.configuration = workspace.getConfiguration("clojure-debug");
        this.supportRunInTerminal = (args.supportsRunInTerminalRequest == true);
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsRestartRequest = true;
        // We want to have VS Code call evaulate when hovering over source (Not yet. if there is a way to expand to a full
        // form then we will want to do this.)
        response.body.supportsEvaluateForHovers = false;
        // SOME DAY!!!
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsSetVariable = false;
        let exceptionBreakpointFilter = { filter: "all-exceptions", label: "Exceptions" };
        response.body.exceptionBreakpointFilters = [exceptionBreakpointFilter];
        this.sendResponse(response);
        //super.initializeRequest(response, args);
    }
    // Handle events from the REPL (breakpoints, exceptions). We make a single request here to get an event,
    // which effectivley creates a channel that the middleware can send event info back to us on.
    // TODO - test to see if there is a timeout issue here since we will be listening on the socket waiting
    // for a response until an event happens.
    handleEvent(err, result) {
        if (result != null) {
            let event = result[0]["event"];
            const eventMap = JSON.parse(event);
            const threadName = eventMap["thread"];
            let eventType = eventMap["event-type"];
            const thread = this.threadWithName(threadName);
            let threadId = -1;
            if (thread == null) {
                threadId = this.threadIndex;
                this.threads.push(new vscode_debugadapter_1.Thread(threadId, threadName));
                this.threadIndex = this.threadIndex + 1;
            }
            else {
                threadId = thread.id;
            }
            switch (eventType) {
                case "breakpoint":
                    this._debuggerSubState = DebuggerSubState.BREAKPOINT_HIT;
                    console.log("Sending breakpoint event to debugger for thread " + threadId);
                    this.sendEvent(new vscode_debugadapter_1.StoppedEvent("breakpoint", threadId));
                    break;
                case "step":
                    //let src = eventMap["src"];
                    //line = eventMap["line"];
                    this.sendEvent(new vscode_debugadapter_1.StoppedEvent("step", threadId));
                    break;
                case "exception":
                    this.sendEvent(new vscode_debugadapter_1.StoppedEvent("exception", threadId));
                    break;
                default:
            }
        }
        // start listening for events again
        let debug = this;
        this.replConnection.getEvent((err, result) => {
            // TODO handle errors here
            if (err) {
                console.error(err);
            }
            else {
                debug.handleEvent(err, result);
            }
        });
    }
    // Handle output from the REPL after launch is complete
    handleReplOutput(output) {
        if ((this._debuggerState == DebuggerState.REPL_STARTED) && (output.search(/Attached to process/) != -1)) {
            this._debuggerState = DebuggerState.DEBUGGER_ATTACHED;
            console.log("DEBUGGER_ATTACHED");
        }
        if (this._debuggerSubState == DebuggerSubState.EVENT_IN_PROGRESS) {
            this._debuggerSubState = DebuggerSubState.NOOP;
            const eventMap = JSON.parse(output);
            const event = eventMap["event"];
            const threadName = eventMap["thread"];
            const thread = this.threadWithName(threadName);
            let threadId = -1;
            if (thread == null) {
                threadId = this.threadIndex;
                this.threads.push(new vscode_debugadapter_1.Thread(threadId, threadName));
                this.threadIndex = this.threadIndex + 1;
            }
            if (event == "breakpoint") {
                this._debuggerSubState = DebuggerSubState.BREAKPOINT_HIT;
                const src = eventMap["src"];
                const line = eventMap["line"];
                this.sendEvent(new vscode_debugadapter_1.StoppedEvent("breakpoint", threadId));
            }
        }
        if (output.search(/CDB MIDDLEWARE EVENT/) != -1) {
            this._debuggerSubState = DebuggerSubState.EVENT_IN_PROGRESS;
        }
    }
    connectToDebugREPL(response, args, primaryReplPort, replPort, debugged_port) {
        let self = this;
        this.debuggerRepl.stdout.on('data', (data) => {
            const output = '' + data;
            if ((output.search(/nREPL server started/) != -1)) {
                self._debuggerState = DebuggerState.REPL_READY;
                self.replConnection = new replConnection_1.ReplConnection();
                self.replConnection.connect("127.0.0.1", replPort, (msg) => {
                    // we only care about values and errors, not stdout
                    if (msg["err"]) {
                        self.perr(msg["err"]);
                    }
                    else if (msg["value"]) {
                        self.pout(msg["value"]);
                    }
                }, (err, result) => {
                    if (err) {
                        console.log(err);
                    }
                });
                console.log("CONNECTED TO REPL");
                if (self.isLaunched) {
                    self._debuggerState = DebuggerState.LAUNCH_COMPLETE;
                }
                let debuggedHost = "localhost";
                if (args["replHost"]) {
                    debuggedHost = args["replHost"];
                }
                self.replConnection.attach(debuggedHost, debugged_port, (err, result) => {
                    if (err) {
                        console.error(err);
                    }
                    else {
                        console.log("Debugger REPL attached to Debugged REPL");
                        const reqId = self.getNextRequestId();
                        if (response.command != "restart") {
                            // tell the extension to connect
                            let replHost = "127.0.0.1";
                            if (args["replHost"]) {
                                replHost = args["replHost"];
                            }
                            self.requestData[reqId] = { response: response };
                            self.sideChannel.emit("connect-to-repl", { id: reqId, hostPort: replHost + ":" + primaryReplPort });
                        }
                        else {
                            // tell the extension to reapply breakpoints
                            self.sideChannel.emit("reapply-breakpoints", { id: reqId });
                        }
                        // start listening for events
                        self.handleEvent(null, null);
                        response.success = true;
                        self.sendResponse(response);
                    }
                });
            }
            self.handleReplOutput(output);
            self.pout(output);
        });
        this.debuggerRepl.stderr.on('data', (data) => {
            const output = '' + data;
            this.perr(output);
            console.log(`stderr: ${output}`);
        });
    }
    setUpDebugREPL(response, args) {
        let primaryReplPort = 5555;
        if (args.replPort) {
            primaryReplPort = args.replPort;
        }
        if (args.debug) {
            this.baseArgs = args;
            const env = { "HOME": process.env["HOME"], "DEBUG_MIDDLEWARE_VERSION": args.middlewareVersion, "PATH_TO_TOOLS_JAR": args.toolsJar };
            let debugReplPort = 5556;
            if (args.debugReplPort) {
                debugReplPort = args.debugReplPort;
            }
            let debugPort = 8030;
            if (args.debugPort) {
                debugPort = args.debugPort;
            }
            let leinPath = "/usr/local/bin/lein";
            if (args.leinPath) {
                leinPath = args.leinPath;
            }
            this.debuggerRepl = child_process_1.spawn(leinPath, ["repl", ":headless", ":port", "" + debugReplPort], { cwd: this.tmpProjectDir, env: env });
            this._debuggerState = DebuggerState.REPL_STARTED;
            console.log("DEBUGGER REPL STARTED");
            this.connectToDebugREPL(response, args, primaryReplPort, debugReplPort, debugPort);
        }
        // else {
        // 	response.success = true;
        // 	this.sendResponse(response);
        // }
    }
    // Create a lein project to run as our debugger REPL
    createDebuggerProject(toolsJar) {
        // create a tempory lein proejct
        const tmpobj = tmp.dirSync({ mode: 0o750, prefix: 'repl_connnect_' });
        this.tmpProjectDir = tmpobj.name;
        let projectPath = path_1.join(tmpobj.name, "project.clj");
        if (os.platform() == "win32") {
            toolsJar = toolsJar.replace(/\\/g, "\\\\");
        }
        let projCljWithTools = projectClj.replace(":resource-paths []", ":resource-paths [\"" + toolsJar + "\"]");
        fs_extra_1.writeFileSync(projectPath, projCljWithTools);
    }
    attachRequest(response, args) {
        console.log("ATTACH REQUEST");
        this.cwd = args.cwd;
        this.sideChannelPort = 3030;
        if (args.sideChannelPort) {
            this.sideChannelPort = args.sideChannelPort;
        }
        this.setUpSideChannel();
        this.createDebuggerProject(args.toolsJar);
        this.setUpDebugREPL(response, args);
    }
    launchRequest(response, args) {
        console.log("LAUNCH REQUEST");
        this.pout("Launch request");
        this.isLaunched = true;
        const self = this;
        this.createDebuggerProject(args.toolsJar);
        this.cwd = args.cwd;
        console.log("CWD: " + this.cwd);
        let replPort = 5555;
        if (args.replPort) {
            replPort = args.replPort;
        }
        let debugPort = 8030;
        if (args.debugPort) {
            debugPort = args.debugPort;
        }
        this.sideChannelPort = 3030;
        if (args.sideChannelPort) {
            this.sideChannelPort = args.sideChannelPort;
        }
        this.setUpSideChannel();
        let leinPath = "/usr/local/bin/lein";
        if (args.leinPath) {
            leinPath = args.leinPath;
        }
        let argEnv = {};
        if (args.env) {
            argEnv = args.env;
        }
        const home = process.env["HOME"];
        let jvmOpts = "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=" + debugPort;
        if (args.env && args.env["JVM_OPTS"]) {
            jvmOpts = jvmOpts + " " + args.env["JVM_OPTS"];
        }
        let env = { "HOME": home };
        if (args.debug) {
            env["CLOJURE_DEBUG_JDWP_PORT"] = "" + debugPort;
            env["JVM_OPTS"] = jvmOpts;
            env["PATH_TO_TOOLS_JAR"] = args.toolsJar;
        }
        else {
            if (args.env && args.env["JVM_OPTS"]) {
                env["JVM_OPTS"] = args.env["JVM_OPTS"];
            }
            env["PATH_TO_TOOLS_JAR"] = args.toolsJar;
        }
        for (let attrname in args.env) {
            if (attrname != "JVM_OPTS") {
                env[attrname] = args.env[attrname];
            }
        }
        env["DEBUG_MIDDLEWARE_VERSION"] = args.middlewareVersion;
        const runArgs = {
            kind: 'integrated',
            title: "Clojure REPL",
            args: args.commandLine,
            cwd: args.cwd,
            env: env
        };
        if (this.supportRunInTerminal && args.console == "integratedTerminal") {
            this.pout("Running in terminal");
            this.runInTerminalRequest(runArgs, 600000, runResponse => {
                if (runResponse.success) {
                    console.log("PRIMARY REPL STARTED");
                    this.pout("PRIMARY REPL STARTED");
                    this.setUpDebugREPL(response, args);
                }
                else {
                    this.sendErrorResponse(response, -1, "Cannot launch debug target in terminal.");
                }
            });
        }
        else if (this.supportRunInTerminal && args.console == "externalTerminal") {
            runArgs["kind"] = "external";
            this.runInTerminalRequest(runArgs, 600000, runResponse => {
                if (runResponse.success) {
                    console.log("PRIMARY REPL STARTED");
                    this.setUpDebugREPL(response, args);
                }
                else {
                    this.sendErrorResponse(response, -1, "Cannot launch debug target in terminal.");
                }
            });
        }
        else {
            // debug console launch
            let cmd = args.commandLine[0];
            let cmdArgs = args.commandLine.slice(1, args.commandLine.length);
            this.primaryRepl = child_process_1.spawn(cmd, cmdArgs, { cwd: args.cwd, env: env });
            this._debuggerState = DebuggerState.REPL_STARTED;
            this.primaryRepl.stdout.on('data', (data) => {
                const output = '' + data;
                self.parseOutput(output, response, args);
            });
            this.primaryRepl.stderr.on('data', (data) => {
                const output = '' + data;
                self.perr(output);
                console.log(`stderr: ${output}`);
            });
            this.primaryRepl.on('close', (code) => {
                if (code !== 0) {
                    console.log(`REPL process exited with code ${code}`);
                }
                console.log("REPL closed");
            });
        }
    }
    disconnectRequest(response, args) {
        console.log("Diconnect requested");
        if (this.isLaunched) {
            const self = this;
            // tell the debugger REPL to tell the debugged REPL to exit
            this.replConnection.exit((err, result) => {
                // exit the debugger REPL
                self.replConnection.eval(EXIT_CMD, (err, result) => {
                    // This is never called, apparently.
                });
                // close the connection to the deugger REPL
                self.replConnection.close((err, result) => {
                    // do nothing
                });
            });
            // this.sideChannel.emit(terminate-and-exit");
        }
        else {
            // exit the debugger REPL
            this.replConnection.eval(EXIT_CMD, (err, result) => {
                // This is never called, apparently.
            });
            // close the connection to the debugger REPL
            this.replConnection.close((err, result) => {
                // do nothing
            });
            // this.sideChannel.emit("exit");
        }
        this.sideChannel.emit("exit");
        this.sideChannel.close();
        this.sendResponse(response);
        this.shutdown();
    }
    // Repurposing this callback to let users reconnect the debug session if it gets messed up (as
    // opposed to restarting the debugged process).
    restartRequest(response, args) {
        // kill off the old debug REPL and reconnect
        // exit the debugger REPL
        this.replConnection.eval(EXIT_CMD, (err, result) => {
            // This is never called, apparently.
        });
        // close the connection to the deugger REPL
        this.replConnection.close((err, result) => {
            // do nothing
        });
        this.setUpDebugREPL(response, this.baseArgs);
    }
    sourceRequest(response, args) {
    }
    // TODO Fix the check for successful breakpoints and return the correct list
    finishBreakPointsRequest(response, args, path) {
        const clientLines = args.lines;
        let cdtPath = this.convertClientPathToDebuggerPath(path);
        // make exploded jar file paths amenable to cdt
        cdtPath = cdtPath.replace(".jar/", ".jar:");
        const debugLines = JSON.stringify(clientLines, null, 4);
        console.log(debugLines);
        const newPositions = [clientLines.length];
        const breakpoints = [];
        let processedCount = 0;
        delete this._breakPoints[path];
        const self = this;
        for (let i = 0; i < clientLines.length; i++) {
            const index = i;
            const l = self.convertClientLineToDebugger(clientLines[i]);
            self.replConnection.setBreakpoint(cdtPath, l, (err, result) => {
                console.log(result);
                processedCount = processedCount + 1;
                let verified = false;
                const rval = result[0]["msg"];
                if (rval.indexOf("No breakpoints found ") == -1) {
                    verified = true;
                }
                newPositions[index] = l;
                if (verified) {
                    breakpoints.push({ verified: verified, line: self.convertDebuggerLineToClient(l) });
                }
                if (processedCount == clientLines.length) {
                    self._breakPoints[path] = newPositions;
                    // send back the actual breakpoints
                    response.body = {
                        breakpoints: breakpoints
                    };
                    const debug = JSON.stringify(response, null, 4);
                    console.log(debug);
                    self.sendResponse(response);
                }
            });
        }
    }
    setBreakPointsRequest(response, args) {
        if (this.replConnection) {
            const clientLines = args.lines;
            const debugLines = JSON.stringify(clientLines, null, 4);
            console.log(debugLines);
            const srcPath = args.source.path;
            // make exploded jar file paths amenable to cdt
            const cdtPath = srcPath.replace(".jar/", ".jar:/");
            const reqId = this.getNextRequestId();
            this.requestData[reqId] = { response: response, args: args, path: srcPath };
            const self = this;
            if (this._debuggerSubState == DebuggerSubState.BREAKPOINT_HIT) {
                self.replConnection.clearBreakpoints(cdtPath, (err, result) => {
                    if (err) {
                        // TODO figure out what to do here
                        console.error(err);
                    }
                    else {
                        // don't try to load the namespace first if we are already
                        // at a breakpoint
                        self.finishBreakPointsRequest(response, args, srcPath);
                    }
                });
            }
            else {
                this.replConnection.clearBreakpoints(cdtPath, (err, result) => {
                    if (err) {
                        // TODO figure out what to do here
                        console.error(err);
                    }
                    else {
                        const fileContents = fs_extra_1.readFileSync(srcPath);
                        //const regex = /\(ns\s+?(.*?)(\s|\))/;
                        const regex = /\(ns(\s+\^\{[\s\S]*?\})?\s+([\w\.\-_\d\*\+!\?]+)/;
                        const ns = regex.exec(fileContents.toString())[2];
                        // Load the associated namespace into the REPL.
                        // We have to use the extension connection to load the namespace
                        // We must wait for the response before replying with the SetBreakpointResponse.
                        self.sideChannel.emit("load-namespace", { id: reqId, ns: ns });
                    }
                });
            }
        }
        else {
            // Not a debug session, so just return
            response.body = {
                breakpoints: []
            };
            response.success = false;
            this.sendResponse(response);
        }
        // TODO reject breakpoint requests outside of a namespace
    }
    setExceptionBreakPointsRequest(response, args) {
        if (this.replConnection) {
            // get the class type for the exceptions from the extension (response handler will do the rest)
            const reqId = this.getNextRequestId();
            this.requestData[reqId] = { response: response, args: args };
            this.sideChannel.emit('get-breakpoint-exception-class', { id: reqId });
        }
        else {
            response.success = false;
            this.sendResponse(response);
        }
    }
    threadsRequest(response) {
        if (this.replConnection) {
            const debug = this;
            this.replConnection.listThreads((err, result) => {
                console.log(result);
                debug.updateThreads(result[0]["threads"]);
                console.log("Sending threads to debugger:\n");
                for (let i = 0; i < debug.threads.length; i++) {
                    let th = debug.threads[i];
                    console.log("id: " + th.id + " name: " + th.name);
                }
                response.body = {
                    threads: debug.threads
                };
                debug.sendResponse(response);
            });
        }
        else {
            response.body = {
                threads: []
            };
            response.success = false;
            this.sendResponse(response);
        }
    }
    stackTraceRequest(response, args) {
        const levels = args.levels;
        const threadId = args.threadId;
        console.log("LEVELS: " + levels);
        console.log("THREAD_ID: " + threadId);
        const th = this.threadWithID(threadId);
        const debug = this;
        this.replConnection.listFrames(th.name, (err, result) => {
            console.log(result);
            const resFrames = result[0]["frames"];
            console.log(resFrames);
            // make all source files available (unzipping jars as needed)
            const sourcePaths = resFrames.map((frame, index) => {
                return frame["srcPath"];
            });
            const frames = resFrames.map((frame, index) => {
                // let sourcePath = result[i];
                let sourcePath = sourcePaths[index];
                let line = frame["line"];
                const f = new vscode_debugadapter_1.StackFrame(index, `${frame["srcName"]}(${index})`, new vscode_debugadapter_1.Source(frame["srcName"], debug.convertDebuggerPathToClientPath(sourcePath, line)), debug.convertDebuggerLineToClient(line), 0);
                f["threadName"] = th.name;
                return f;
            });
            debug.frames = frames;
            response.body = {
                stackFrames: frames
            };
            debug.sendResponse(response);
        });
    }
    // Store a variable so it can be inspected by the user in the debugger pane. Structured values
    // are stored recursively to allow for expansion during inspection.
    storeValue(name, val) {
        if (val == null) {
            return { name: name, value: null, variablesReference: 0 };
        }
        else if (val._keys) {
            let vals = val._keys.map((key) => {
                return this.storeValue(key, val[key]);
            });
            let ref = this.variableHandles.create(vals);
            return { name: name, value: "" + val, variablesReference: ref };
        }
        else if (val instanceof Array) {
            let index = 0;
            let vals = val.map((v) => {
                return this.storeValue("" + index++, v);
            });
            let ref = this.variableHandles.create(vals);
            return { name: name, value: "" + val, variablesReference: ref };
        }
        else if (val instanceof Object) {
            let vals = Object.getOwnPropertyNames(val).map((key) => {
                return this.storeValue(key, val[key]);
            });
            let ref = this.variableHandles.create(vals);
            return { name: name, value: "" + val, variablesReference: ref };
        }
        else {
            return { name: name, value: "" + val, variablesReference: 0 };
        }
    }
    // TODO Write a function to take a complex variable and convert it to a nested structure (possibly with sub variable references)
    scopesRequest(response, args) {
        console.log("SCOPES REQUEST");
        const frameReference = args.frameId;
        const frame = this.frames[frameReference];
        const threadName = frame["threadName"];
        const debug = this;
        // get the variables for the given stack frame
        this.replConnection.listVars(threadName, frame.id, (err, result) => {
            console.log("GOT VARIABLES");
            console.log(result);
            let variables = result[0]["vars"];
            variables = jsedn_1.parse(variables);
            let jsVars = jsedn_1.toJS(variables);
            let jv = JSON.stringify(jsVars);
            let frameVars = JSON.parse(jv);
            let frameArgs = frameVars[0];
            let frameLocals = frameVars[1];
            // console.log("VARS: " + jsVars);
            // const frameArgs = variables[0];
            // const frameLocals = variables[1];
            const argScope = frameArgs.map((v) => {
                let name = Object.getOwnPropertyNames(v)[0];
                let value = v[name];
                let val = debug.storeValue(name, value);
                return val;
            });
            const localScope = frameLocals.map((v) => {
                let name = Object.getOwnPropertyNames(v)[0];
                let value = v[name];
                let val = debug.storeValue(name, value);
                return val;
            });
            const scopes = new Array();
            scopes.push(new vscode_debugadapter_1.Scope("Local", debug.variableHandles.create(localScope), false));
            scopes.push(new vscode_debugadapter_1.Scope("Argument", debug.variableHandles.create(argScope), false));
            // scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));
            response.body = {
                scopes: scopes
            };
            debug.sendResponse(response);
        });
    }
    variablesRequest(response, args) {
        let variables = [];
        const vars = this.variableHandles.get(args.variablesReference);
        if (vars != null) {
            variables = vars;
        }
        response.body = {
            variables: variables
        };
        this.sendResponse(response);
    }
    continueRequest(response, args) {
        const debug = this;
        if (this.replConnection) {
            this.replConnection.continue((err, result) => {
                // TODO handle errors here
                debug._debuggerSubState = DebuggerSubState.NOOP;
                debug.sendResponse(response);
                console.log(result);
            });
        }
        else {
            debug._debuggerSubState = DebuggerSubState.NOOP;
            debug.sendResponse(response);
        }
    }
    nextRequest(response, args) {
        const threadId = args.threadId;
        const th = this.threadWithID(threadId);
        const debug = this;
        this.replConnection.stepOver(th.name, (err, result) => {
            // TODO handle errors
            debug.sendResponse(response);
        });
    }
    stepInRequest(response, args) {
        const threadId = args.threadId;
        const th = this.threadWithID(threadId);
        const debug = this;
        this.replConnection.stepInto(th.name, (err, result) => {
            // TODO handle errors
            debug.sendResponse(response);
        });
    }
    stepOutRequest(response, args) {
        const threadId = args.threadId;
        const th = this.threadWithID(threadId);
        const debug = this;
        this.replConnection.stepOut(th.name, (err, result) => {
            // TODO handle errors
            debug.sendResponse(response);
        });
    }
    isErrorStatus(status) {
        return (status.indexOf("error") != -1);
    }
    getErrorMessage(status) {
        for (let msg of status) {
            if (msg != "done" && msg != "error") {
                return msg;
            }
        }
        return "UNKNOWN ERROR";
    }
    // Handle the result from an eval NOT at a breakpoint. Results sometimes come in more than one response,
    // so we have to gather them until complete (indicated by the presense of the "status" in the
    // response). We use the session-id of the nrepl request to group respones together.
    handleResult(response, replResult) {
        // forward stdout from the REPL to the debugger
        const out = replResult["out"];
        if (out && out != "") {
            this.pout(out);
        }
        // forwared stderr from the REPL to the debugger
        const err = replResult["err"];
        if (err && err != "") {
            this.perr(err);
        }
        // TODO there might be a race condition here. Maybe better to use request id instead
        // of session
        const session = replResult["session"];
        const result = this.evalResults[session] || {};
        let status = replResult["status"];
        if (status) {
            if (this.isErrorStatus(status)) {
                let errorMessage = this.getErrorMessage(status);
                response.success = false;
                response.message = errorMessage;
                this.sendResponse(response);
                this.evalResults[session] = null;
            }
            else if (replResult["status"][0] == "done") {
                response.body = {
                    result: result["value"],
                    // TODO implement this for complex results
                    variablesReference: 0
                };
                const err = result["error"];
                if (err && err != "") {
                    response.success = false;
                    response.message = err;
                }
                this.sendResponse(response);
                delete this.evalResults[session];
            }
            else if (status[0] == "eval-error") {
                const ex = replResult["ex"];
                if (ex && ex != "") {
                    const err = result["error"] || "";
                    result["error"] = err + "\n" + ex;
                }
            }
        }
        else {
            if (replResult["value"]) {
                const value = result["value"] || "";
                result["value"] = value + replResult["value"];
            }
            this.evalResults[session] = result;
        }
    }
    // Handle the result from an evaluation done in the context of a stack frame (breakpoint eval)
    handleFrameResult(response, replResult) {
        // forward stdout form the REPL to the debugger
        const out = replResult["out"];
        if (out && out != "") {
            this.pout(out);
        }
        // forwared stderr from the REPL to the debugger
        const err = replResult["err"];
        if (err && err != "") {
            this.perr(err);
        }
        const session = replResult["session"];
        // const result = this._evalResults[session] || {};
        const result = replResult["value"];
        if (replResult["status"] && replResult["status"][0] == "done") {
            response.body = {
                // result: result["value"],
                result: result,
                // TODO implement this for complex results
                variablesReference: 0
            };
            const err = result["error"];
            if (err && err != "") {
                response.success = false;
                response.message = err;
            }
            this.sendResponse(response);
            this.evalResults[session] = null;
        }
        else {
            if (replResult["value"]) {
                const value = result["value"] || "";
                result["value"] = value + replResult["value"];
            }
            const ex = replResult["ex"];
            if (ex && ex != "") {
                const err = result["error"] || "";
                result["error"] = err + "\n" + ex;
            }
            this.evalResults[session] = result;
        }
    }
    evaluateRequest(response, args) {
        const expr = args.expression;
        const self = this;
        const ns = 'user';
        if (args.context == 'repl' || args.context == 'watch') {
            if (args.frameId != null) {
                // evaluate in the context of the given thread/frame
                this.replConnection.reval(args.frameId, expr, (err, result) => {
                    for (let res of result) {
                        self.handleFrameResult(response, res);
                    }
                });
            }
            else {
                // use extesion to eval code
                const reqId = self.getNextRequestId();
                self.requestData[reqId] = { response: response, args: args };
                this.sideChannel.emit('eval-code', { id: reqId, expression: expr });
            }
        }
    }
}
// just use the first thread as the default thread
ClojureDebugSession.THREAD_ID = 0;
vscode_debugadapter_1.DebugSession.run(ClojureDebugSession);
//# sourceMappingURL=clojureDebug.js.map