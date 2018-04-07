"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("process");
const os = require("os");
const vscode = require("vscode");
const cross_spawn_1 = require("cross-spawn");
const child_process_1 = require("child_process");
const LEIN_ARGS = [
    'update-in',
    ':dependencies',
    'conj',
    '[org.clojure/tools.nrepl "0.2.12" :exclusions [org.clojure/clojure]]',
    '--',
    'update-in',
    ':dependencies',
    'conj',
    '[cljfmt "0.5.7"]',
    '--',
    'update-in',
    ':plugins',
    'conj',
    '[cider/cider-nrepl "0.15.1"]',
    '--',
    'repl',
    ':headless'
];
const R_NREPL_CONNECTION_INFO = /nrepl:\/\/(.*?:.*?(?=[\n\r]))/;
let nreplProcess;
const isStarted = () => !!nreplProcess;
// Create a channel in the Output window so that the user
// can view output from the nREPL session.
const nreplChannel = vscode.window.createOutputChannel('nREPL');
const start = () => {
    if (isStarted())
        return Promise.reject({ nreplError: 'nREPL already started.' });
    nreplProcess = cross_spawn_1.spawn('lein', LEIN_ARGS, {
        cwd: vscode.workspace.rootPath,
        detached: !(os.platform() === 'win32')
    });
    // Clear any output from previous nREPL sessions to help users focus
    // on the current session only.
    nreplChannel.clear();
    return new Promise((resolve, reject) => {
        nreplProcess.stdout.addListener('data', data => {
            const nreplConnectionMatch = data.toString().match(R_NREPL_CONNECTION_INFO);
            // Send any stdout messages to the output channel
            nreplChannel.append(data.toString());
            if (nreplConnectionMatch && nreplConnectionMatch[1]) {
                const [host, port] = nreplConnectionMatch[1].split(':');
                return resolve({ host, port: Number.parseInt(port) });
            }
        });
        nreplProcess.stderr.on('data', data => {
            // Send any stderr messages to the output channel
            nreplChannel.append(data.toString());
        });
        nreplProcess.on('exit', (code) => {
            // nREPL process has exited before we were able to read a host / port.
            const message = `nREPL exited with code ${code}`;
            nreplChannel.appendLine(message);
            // Bring the output channel to the foreground so that the user can
            // use the output to debug the problem.
            nreplChannel.show();
            return reject({ nreplError: message });
        });
    });
};
const stop = () => {
    if (nreplProcess) {
        // Workaround http://azimi.me/2014/12/31/kill-child_process-node-js.html
        nreplProcess.removeAllListeners();
        try {
            // Killing the process will throw an error `kill ESRCH` this method
            // is invoked after the nREPL process has exited. This happens when
            // we try to gracefully  clean up after spawning the nREPL fails.
            // We wrap the killing code in `try/catch` to handle this.
            if (os.platform() === 'win32') {
                child_process_1.exec('taskkill /pid ' + nreplProcess.pid + ' /T /F');
            }
            else {
                process.kill(-nreplProcess.pid);
            }
        }
        catch (exception) {
            console.error("Error cleaning up nREPL process", exception);
        }
        nreplProcess = null;
    }
};
const dispose = stop;
exports.nreplController = {
    start,
    stop,
    isStarted,
    dispose,
};
//# sourceMappingURL=nreplController.js.map