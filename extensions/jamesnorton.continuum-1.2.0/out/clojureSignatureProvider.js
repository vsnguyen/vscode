"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const editorUtils_1 = require("./editorUtils");
function isVariadic(sig) {
    let rval = false;
    if (sig) {
        for (let param of sig) {
            if (param == "&") {
                rval = true;
                break;
            }
        }
    }
    return rval;
}
// handles variadic signature
function sigLength(sig) {
    let nonVariadicSig = sig.filter((val) => {
        return val != "&";
    });
    return nonVariadicSig.length;
}
class ClojureSignatureProvider {
    constructor(conn) {
        this.connection = conn;
    }
    provideSignatureHelp(document, position, token) {
        let self = this;
        let ns = editorUtils_1.EditorUtils.findNSDeclaration(document.getText());
        let pSig = editorUtils_1.EditorUtils.getArgumentSignature(document, position);
        // ignore things outside of a namespace
        if (ns == null || pSig == null || pSig[0] == null || pSig[0] == "") {
            return Promise.reject("");
        }
        try {
            return new Promise((resolve, reject) => {
                if (this.connection.isConnected()) {
                    this.connection.sigs(ns, pSig[0], (err, msg) => {
                        if (!token.isCancellationRequested) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                var sigs = msg[0]["sigs"];
                                if (!sigs) {
                                    resolve(undefined);
                                }
                                else {
                                    let sigInfos = sigs.map((sig) => {
                                        const sigLabel = "(" + pSig[0] + " " + sig.join(" ") + ")";
                                        let sigInfo = new vscode_1.SignatureInformation(sigLabel);
                                        let nonVariadicSig = sig.filter((val) => {
                                            return val != "&";
                                        });
                                        sigInfo.parameters = nonVariadicSig.map((arg) => {
                                            return new vscode_1.ParameterInformation(arg);
                                        });
                                        return sigInfo;
                                    });
                                    let sigHelp = new vscode_1.SignatureHelp();
                                    sigHelp.signatures = sigInfos;
                                    sigHelp.activeParameter = pSig[1];
                                    sigHelp.activeSignature = -1;
                                    let index = 0;
                                    for (let sig of sigs) {
                                        const sigLen = sigLength(sig);
                                        if (sigLen > 0 && sigLen > sigHelp.activeParameter) {
                                            sigHelp.activeSignature = index;
                                            break;
                                        }
                                        index += 1;
                                    }
                                    // handle variadic signatures
                                    if (sigHelp.activeSignature == -1 && isVariadic(sigs[sigs.length - 1])) {
                                        sigHelp.activeSignature = sigs.length - 1;
                                        sigHelp.activeParameter = sigLength(sigs[sigs.length - 1]) - 1;
                                    }
                                    resolve(sigHelp);
                                }
                            }
                        }
                    });
                }
                else {
                    reject();
                }
            });
        }
        catch (Error) {
            return Promise.reject([]);
        }
    }
}
exports.ClojureSignatureProvider = ClojureSignatureProvider;
//# sourceMappingURL=clojureSignatureProvider.js.map