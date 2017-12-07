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
    '[refactor-nrepl "2.3.0-SNAPSHOT"]',
    '--',
    'update-in',
    ':plugins',
    'conj',
    '[cider/cider-nrepl "0.15.0-SNAPSHOT"]',
    '--',
    'repl',
];
const R_NREPL_CONNECTION_INFO = /nrepl:\/\/(.*?:.*?(?=[\n\r]))/;
let nreplProcess;
const isStarted = () => !!nreplProcess;
const start = () => {
    if (isStarted())
        return Promise.reject({ nreplError: 'nREPL already started.' });
    nreplProcess = cross_spawn_1.spawn('lein', LEIN_ARGS, {
        cwd: vscode.workspace.rootPath,
        detached: !(os.platform() === 'win32')
    });
    return new Promise((resolve, reject) => {
        nreplProcess.stdout.addListener('data', data => {
            const nreplConnectionMatch = data.toString().match(R_NREPL_CONNECTION_INFO);
            if (nreplConnectionMatch && nreplConnectionMatch[1]) {
                const [host, port] = nreplConnectionMatch[1].split(':');
                return resolve({ host, port: Number.parseInt(port) });
            }
        });
        nreplProcess.stderr.on('data', data => {
            console.info('nrepl stderr =>', data.toString());
        });
        nreplProcess.on('exit', (code, signal) => {
            console.info(`nREPL exit => ${code} / Signal: ${signal}`);
            stop();
            return reject();
        });
        nreplProcess.on('close', (code, signal) => {
            console.info(`nREPL close => ${code} / Signal: ${signal}`);
            stop();
            return reject();
        });
    });
};
const stop = () => {
    if (nreplProcess) {
        // Workaround http://azimi.me/2014/12/31/kill-child_process-node-js.html
        nreplProcess.removeAllListeners();
        if (os.platform() === 'win32') {
            child_process_1.exec('taskkill /pid ' + nreplProcess.pid + ' /T /F');
        }
        else {
            process.kill(-nreplProcess.pid);
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