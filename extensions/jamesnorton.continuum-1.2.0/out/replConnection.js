/* --------------------------------------------------------------------------------------------
 * Copyright (c) James Norton. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const nrepl_client = require("jg-nrepl-client");
function escapeClojureCodeInString(code) {
    let escaped = code.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    return "\"" + escaped + "\"";
}
function wrapCodeInReadEval(code) {
    let escapedCode = escapeClojureCodeInString(code);
    return "(eval (read-string {:read-cond :allow} " + escapedCode + "))";
}
/*
    Repl - data and methods related to communicating with a REPL process.
*/
class ReplConnection {
    // don't initialize anything in the constuctor - wait until connect is called
    constructor() {
    }
    doConnect(port, host, handler, callback) {
        let self = this;
        console.log("Connecting to port " + port + " on host " + host + "...");
        this.conn = nrepl_client.connect({ port: port, host: host, verbose: false });
        // keep trying until we connect to the REPL
        this.conn.on('error', (error) => {
            if (error.code == 'ECONNREFUSED') {
                setTimeout(() => {
                    self.doConnect(port, host, handler, callback);
                }, 1000);
            }
        });
        this.conn.messageStream.on('messageSequence', (id, messages) => {
            for (var msg of messages) {
                if (msg["session"] == self.session) {
                    handler(msg);
                }
            }
        });
        if (this.conn) {
            self.conn.clone((err, result) => {
                self.session = result[0]["new-session"];
                console.log("Eval session: " + self.session);
                self.conn.clone((err, result) => {
                    self.commandSession = result[0]["new-session"];
                    console.log("Command session: " + self.commandSession);
                    if (err) {
                        console.error(err);
                        callback(err, null);
                    }
                    else {
                        callback(null, result);
                    }
                });
            });
        }
    }
    // set up the internal connection to a REPL
    connect(replHost, replPort, handler, callback) {
        let self = this;
        if (this.conn) {
            this.conn.close((err, result) => {
                if (err) {
                    console.error(err);
                    callback(err, null);
                }
            });
        }
        // this.conn = nrepl_client.connect({port: replPort, host: replHost, verbose: false});
        this.doConnect(replPort, replHost, handler, callback);
    }
    isConnected() {
        return this.conn != null;
    }
    // attach this REPL to the debugged REPL
    attach(host, port, callback) {
        this.conn.send({ op: 'attach', host: host, port: port }, callback);
    }
    // kill the JVM
    exit(callback) {
        this.conn.send({ op: 'exit' }, callback);
    }
    // Get the process id for the debugged JVM
    pid(callback) {
        this.conn.send({ op: 'pid' }, callback);
    }
    // evaluate the given code (possibly in a given namespace)
    eval(code, callback, ns) {
        code = wrapCodeInReadEval(code);
        var command = { op: 'eval', code: code, session: this.session };
        if (ns) {
            command["ns"] = ns;
        }
        this.conn.send(command, callback);
    }
    // TODO change all these string keys to keyword: keys
    // evaluate code in the context of a given thread/frame
    reval(frameIndex, code, callback) {
        this.conn.send({ op: 'reval', 'frame-num': frameIndex, 'form': code }, callback);
    }
    // list all the running threads
    listThreads(callback) {
        this.conn.send({ op: 'list-threads', session: this.commandSession }, callback);
    }
    // list the stack frames for the given thread
    listFrames(threadName, callback) {
        this.conn.send({ op: 'list-frames', 'thread-name': threadName, session: this.commandSession }, callback);
    }
    // list the vars for the given thread / stack frame
    listVars(threadName, frameIndex, callback) {
        try {
            this.conn.send({ op: 'list-vars', 'thread-name': threadName, 'frame-index': frameIndex, session: this.commandSession }, callback);
        }
        catch (e) {
            // TODO - remove this when issue #70 is fixed.
            // This is a hack to handle weird values that come back on some exception stack frames - they aren't
            // handled by bencode correctly and cause exceptions.
            // Issue #70 has been filed to fix this.
            callback(null, "[[][]]");
        }
    }
    // get the source file paths for the given paths. if a source is in a jar file the
    // jar file will be extracted on the file system and the path to the extracted file
    // returned
    getSourcePaths(paths, callback) {
        this.conn.send({ op: 'get-source-paths', 'source-files': paths, session: this.commandSession }, callback);
    }
    // set a breakpoint at the given line in the given file
    setBreakpoint(path, line, callback) {
        this.conn.send({ op: 'set-breakpoint', line: line, path: path, session: this.commandSession }, callback);
    }
    // set a breakpoint for exceptions. type is one of 'all', 'uncaught', or 'none', indicating that exception breakpoints
    // should be cleared. exClass is the class of exception you want to catch, e.g., 'Throwable', 'ClassCastException', etc.
    setExceptionBreakpoint(type, exClass, callback) {
        this.conn.send({ op: 'set-exception-breakpoint', type: type, class: exClass }, callback);
    }
    // clear all breakpoints for the given file
    clearBreakpoints(path, callback) {
        this.conn.send({ op: 'clear-breakpoints', path: path, session: this.commandSession }, callback);
    }
    // find the file and line where a function is defined
    findDefinition(ns, symbol, callback) {
        this.conn.send({ op: 'find-definition', ns: ns, sym: symbol, session: this.commandSession }, callback);
    }
    // find the completions for the prefix using Compliment
    findCompletions(ns, prefix, src, offset, callback) {
        this.conn.send({ op: 'get-completions', ns: ns, prefix: prefix, src: src, pos: offset, session: this.commandSession }, callback);
    }
    // get the docstring for the given var
    doc(ns, variable, callback) {
        this.conn.send({ op: 'doc', ns: ns, var: variable, session: this.commandSession }, callback);
    }
    // get the args for the given function
    args(ns, fun, callback) {
        this.conn.send({ op: 'args', ns: ns, var: fun, session: this.commandSession }, callback);
    }
    // get the signatures for the given function
    sigs(ns, fun, callback) {
        this.conn.send({ op: 'signatures', ns: ns, var: fun, sessin: this.commandSession }, callback);
    }
    // reformat code
    reformat(code, callback) {
        this.conn.send({ op: 'reformat', code: code, session: this.commandSession }, callback);
    }
    // run all the tests in the project
    runAllTests(parallelTestDirs, sequentialTestDirs, callback) {
        this.conn.send({ op: 'run-all-tests', session: this.commandSession, 'par-dirs': parallelTestDirs, 'seq-dirs': sequentialTestDirs }, callback);
    }
    // run all the tests in a single namespace
    runTestsInNS(ns, callback) {
        this.conn.send({ op: 'run-tests-in-namespace', ns: ns, session: this.commandSession }, callback);
    }
    // run a single tests
    runTest(ns, testName, callback) {
        this.conn.send({ op: 'run-test', 'test-name': testName, ns: ns, session: this.commandSession }, callback);
    }
    // continue after a breakpoint
    continue(callback) {
        this.conn.send({ op: 'continue', session: this.commandSession }, callback);
    }
    // step over code after a breakpoint
    stepOver(threadName, callback) {
        this.conn.send({ op: 'step-over', 'thread-name': threadName }, callback);
    }
    // step into code after a breakpoint
    stepInto(threadName, callback) {
        this.conn.send({ op: 'step-into', 'thread-name': threadName }, callback);
    }
    // step out of code after a breakpoint
    stepOut(threadName, callback) {
        this.conn.send({ op: 'step-out', 'thread-name': threadName }, callback);
    }
    // get and process a single event using the given callback
    getEvent(callback) {
        this.conn.send({ op: 'get-event', session: this.commandSession }, callback);
    }
    // load the clojure source file at the given path
    loadFile(path, callback) {
        this.conn.send({ op: 'load-src-file', path: path, session: this.commandSession }, callback);
    }
    // reload any changed namespaces
    refresh(callback) {
        this.conn.send({ op: 'refresh', session: this.commandSession }, callback);
    }
    // reload all namespaces
    superRefresh(callback) {
        this.conn.send({ op: 'super-refresh', session: this.commandSession }, callback);
    }
    // fix namespace declaration
    fixNamespace(path, callback) {
        this.conn.send({ op: 'fix-ns', path: path, session: this.commandSession }, callback);
    }
    setIgnore(callback) {
        this.conn.eval("(alter-var-root #'*compiler-options* assoc :disable-locals-clearing true)", null, this.commandSession, (err, result) => {
            if (err) {
                console.error("Error setting compiler options on debugged process.");
            }
        });
    }
    close(callback) {
        this.conn.close(callback);
        this.conn = null;
        this.session = null;
        this.commandSession = null;
    }
}
exports.ReplConnection = ReplConnection;
//# sourceMappingURL=replConnection.js.map