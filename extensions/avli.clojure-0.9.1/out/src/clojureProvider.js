'use strinct';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const nreplClient_1 = require("./nreplClient");
/**
 * Base class for Clojure providers.
 */
class ClojureProvider {
    /**
     * @param context Extention context
     */
    constructor(context) {
        this.context = context;
    }
    /**
     * Returns nREPL client instance.
     */
    getNREPL() {
        let port;
        let host;
        port = this.context.workspaceState.get('port');
        host = this.context.workspaceState.get('host');
        return new nreplClient_1.nREPLClient(port, host);
    }
    /**
     * Returns current namespace.
     *
     * @param text Clojure code snippet
     */
    getNamespace(text) {
        return getNamespace(text);
    }
}
exports.ClojureProvider = ClojureProvider;
function getNamespace(text) {
    const m = text.match(/^[\s\t]*\((?:[\s\t\n]*(?:in-){0,1}ns)[\s\t\n]+'?([\w\-.]+)[\s\S]*\)[\s\S]*/);
    return m ? m[1] : 'user';
}
exports.getNamespace = getNamespace;
//# sourceMappingURL=clojureProvider.js.map