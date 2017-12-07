"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const nreplClient_1 = require("./nreplClient");
const nreplController_1 = require("./nreplController");
const CONNECTION_STATE_KEY = 'CLJ_CONNECTION';
const DEFAULT_LOCAL_IP = '127.0.0.1';
const CLJS_SESSION_KEY = 'CLJS_SESSION';
const connectionIndicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
let cljContext;
const setCljContext = (context) => cljContext = context;
const getConnection = () => cljContext.workspaceState.get(CONNECTION_STATE_KEY);
const isConnected = () => !!getConnection();
const saveConnection = (connection) => {
    cljContext.workspaceState.update(CONNECTION_STATE_KEY, connection);
    connectionIndicator.text = `⚡nrepl://${connection.host}:${connection.port}`;
    connectionIndicator.show();
    vscode.window.showInformationMessage('Connected to nREPL.');
};
const saveDisconnection = (showMessage = true) => {
    cljContext.workspaceState.update(CONNECTION_STATE_KEY, undefined);
    cljContext.workspaceState.update(CLJS_SESSION_KEY, undefined);
    connectionIndicator.text = '';
    connectionIndicator.show();
    if (showMessage)
        vscode.window.showInformationMessage('Disconnected from nREPL.');
};
let loadingHandler;
const startLoadingAnimation = () => {
    if (loadingHandler)
        return;
    const maxAnimationDots = 3;
    let animationTime = 0;
    loadingHandler = setInterval(() => {
        connectionIndicator.text = '⚡Starting nREPL' + '.'.repeat(animationTime);
        connectionIndicator.show();
        animationTime += animationTime < maxAnimationDots ? 1 : -maxAnimationDots;
    }, 500);
};
const stopLoadingAnimation = () => {
    if (loadingHandler) {
        clearInterval(loadingHandler);
        loadingHandler = null;
        connectionIndicator.text = '';
        connectionIndicator.show();
    }
};
const manuallyConnect = () => {
    if (loadingHandler) {
        vscode.window.showWarningMessage('Already starting a nREPL. Disconnect first.');
        return;
    }
    if (isConnected()) {
        vscode.window.showWarningMessage('Already connected to nREPL. Disconnect first.');
        return;
    }
    let host;
    let port;
    vscode.window.showInputBox({ prompt: 'nREPL host', value: DEFAULT_LOCAL_IP })
        .then(hostFromUser => {
        if (!hostFromUser)
            return Promise.reject({ connectionError: 'Host must be informed.' });
        host = hostFromUser;
        const portNumberPromptOptions = { prompt: 'nREPL port number' };
        if (hostFromUser === DEFAULT_LOCAL_IP || hostFromUser.toLowerCase() === 'localhost') {
            const localPort = getLocalNReplPort();
            if (localPort)
                portNumberPromptOptions.value = String(localPort);
        }
        return vscode.window.showInputBox(portNumberPromptOptions); // cast needed to chain promises
    })
        .then(portFromUser => {
        if (!portFromUser)
            return Promise.reject({ connectionError: 'Port number must be informed.' });
        const intPort = Number.parseInt(portFromUser);
        if (!intPort)
            return Promise.reject({ connectionError: 'Port number must be an integer.' });
        port = intPort;
    })
        .then(() => nreplClient_1.nreplClient.test({ host, port }))
        .then(() => {
        saveConnection({ host, port });
    }, ({ connectionError }) => {
        if (!connectionError)
            connectionError = "Can't connect to the nREPL.";
        vscode.window.showErrorMessage(connectionError);
    });
};
const startNRepl = () => {
    if (isConnected()) {
        vscode.window.showWarningMessage('Already connected to nREPL. Disconnect first.');
        return;
    }
    startLoadingAnimation();
    let nreplConnection;
    nreplController_1.nreplController.start()
        .then(connectionInfo => nreplConnection = connectionInfo)
        .then(() => nreplClient_1.nreplClient.test(nreplConnection))
        .then(stopLoadingAnimation)
        .then(() => saveConnection(nreplConnection))
        .catch(({ nreplError }) => {
        stopLoadingAnimation();
        if (!nreplError)
            nreplError = "Can't start nREPL.";
        disconnect(false);
        vscode.window.showErrorMessage(nreplError);
    });
};
const disconnect = (showMessage = true) => {
    if (isConnected() || loadingHandler) {
        stopLoadingAnimation();
        nreplController_1.nreplController.stop();
        saveDisconnection(showMessage);
    }
    else if (showMessage)
        vscode.window.showWarningMessage('Not connected to any nREPL.');
};
const getLocalNReplPort = () => {
    const projectDir = vscode.workspace.rootPath;
    if (projectDir) {
        const projectPort = getPortFromFS(path.join(projectDir, '.nrepl-port'));
        if (projectPort)
            return projectPort;
    }
    const homeDir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
    return getPortFromFS(path.join(homeDir, '.lein', 'repl-port'));
};
const getPortFromFS = (path) => fs.existsSync(path) ? Number.parseInt(fs.readFileSync(path, 'utf-8')) : NaN;
const findClojureScriptSession = (sessions) => {
    if (sessions.length == 0)
        return Promise.reject(null);
    let base_session = sessions.shift();
    return nreplClient_1.nreplClient.evaluate('(js/parseInt "42")', base_session).then(results => {
        let { session, value } = results[0];
        nreplClient_1.nreplClient.close(session);
        if (value == 42) {
            return Promise.resolve(base_session);
        }
        return findClojureScriptSession(sessions);
    });
};
const discoverSessions = () => {
    return nreplClient_1.nreplClient.listSessions().then(sessions => {
        return findClojureScriptSession(sessions).then(cljs_session => {
            console.log("found ClojureScript session", cljs_session);
            cljContext.workspaceState.update(CLJS_SESSION_KEY, cljs_session);
            return cljs_session;
        }).catch(reason => {
            cljContext.workspaceState.update(CLJS_SESSION_KEY, undefined);
            throw reason;
        });
    });
};
const sessionForFilename = (filename) => {
    return new Promise((resolve, reject) => {
        const sessionType = filename.endsWith('.cljs') ? "ClojureScript" : "Clojure";
        if (sessionType == "Clojure") {
            // Assume that the default session is Clojure. This is always the case with cider.
            return resolve({ type: sessionType, id: undefined });
        }
        const session_id = cljContext.workspaceState.get(CLJS_SESSION_KEY);
        if (session_id)
            return resolve({ type: sessionType, id: session_id });
        return discoverSessions().then(session_id => {
            resolve({ type: sessionType, id: session_id });
        });
    });
};
exports.cljConnection = {
    setCljContext,
    getConnection,
    isConnected,
    manuallyConnect,
    startNRepl,
    disconnect,
    sessionForFilename
};
//# sourceMappingURL=cljConnection.js.map