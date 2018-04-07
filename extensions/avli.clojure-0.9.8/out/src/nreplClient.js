"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const net = require("net");
const buffer_1 = require("buffer");
const bencodeUtil = require("./bencodeUtil");
const cljConnection_1 = require("./cljConnection");
const complete = (symbol, ns) => {
    const msg = { op: 'complete', symbol, ns };
    return send(msg).then(respObjs => respObjs[0]);
};
const info = (symbol, ns, session) => {
    const msg = { op: 'info', symbol, ns, session };
    return send(msg).then(respObjs => respObjs[0]);
};
const evaluate = (code, session) => clone(session).then((new_session) => {
    const session_id = new_session['new-session'];
    const msg = { op: 'eval', code: code, session: session_id };
    return send(msg);
});
const evaluateFile = (code, filepath, session) => clone(session).then((new_session) => {
    const session_id = new_session['new-session'];
    const msg = { op: 'load-file', file: code, 'file-path': filepath, session: session_id };
    return send(msg);
});
const stacktrace = (session) => send({ op: 'stacktrace', session: session });
const clone = (session) => send({ op: 'clone', session: session }).then(respObjs => respObjs[0]);
const test = (connectionInfo) => {
    return send({ op: 'clone' }, connectionInfo)
        .then(respObjs => respObjs[0])
        .then(response => {
        if (!('new-session' in response))
            return Promise.reject(false);
    });
};
const close = (session) => send({ op: 'close', session: session });
const listSessions = () => {
    return send({ op: 'ls-sessions' }).then(respObjs => {
        const response = respObjs[0];
        if (response.status[0] == "done") {
            return Promise.resolve(response.sessions);
        }
    });
};
const send = (msg, connection) => {
    return new Promise((resolve, reject) => {
        connection = connection || cljConnection_1.cljConnection.getConnection();
        if (!connection)
            return reject('No connection found.');
        const client = net.createConnection(connection.port, connection.host);
        Object.keys(msg).forEach(key => msg[key] === undefined && delete msg[key]);
        client.write(bencodeUtil.encode(msg), 'binary');
        client.on('error', error => {
            client.end();
            client.removeAllListeners();
            if (error['code'] == 'ECONNREFUSED') {
                vscode.window.showErrorMessage('Connection refused.');
                cljConnection_1.cljConnection.disconnect();
            }
            reject(error);
        });
        let nreplResp = buffer_1.Buffer.from('');
        const respObjects = [];
        client.on('data', data => {
            nreplResp = buffer_1.Buffer.concat([nreplResp, data]);
            const { decodedObjects, rest } = bencodeUtil.decodeObjects(nreplResp);
            nreplResp = rest;
            const validDecodedObjects = decodedObjects.reduce((objs, obj) => {
                if (!isLastNreplObject(objs))
                    objs.push(obj);
                return objs;
            }, []);
            respObjects.push(...validDecodedObjects);
            if (isLastNreplObject(respObjects)) {
                client.end();
                client.removeAllListeners();
                resolve(respObjects);
            }
        });
    });
};
const isLastNreplObject = (nreplObjects) => {
    const lastObj = [...nreplObjects].pop();
    return lastObj && lastObj.status && lastObj.status.indexOf('done') > -1;
};
exports.nreplClient = {
    complete,
    info,
    evaluate,
    evaluateFile,
    stacktrace,
    clone,
    test,
    close,
    listSessions
};
//# sourceMappingURL=nreplClient.js.map