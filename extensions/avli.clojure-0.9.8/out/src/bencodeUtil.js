"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bencoder = require("bencoder");
const CONTINUATION_ERROR_MESSAGE = "Unexpected continuation: \"";
function encode(msg) {
    return bencoder.encode(msg);
}
exports.encode = encode;
/*
    receives a buffer and returns an array of decoded objects and the remaining unused buffer
*/
function decodeObjects(buffer) {
    const decodedResult = { decodedObjects: [], rest: buffer };
    return decode(decodedResult);
}
exports.decodeObjects = decodeObjects;
function decode(decodedResult) {
    if (decodedResult.rest.length === 0)
        return decodedResult;
    try {
        const decodedObj = bencoder.decode(decodedResult.rest);
        decodedResult.decodedObjects.push(decodedObj);
        decodedResult.rest = Buffer.from('');
        return decodedResult;
    }
    catch (error) {
        const errorMessage = error.message;
        if (!!errorMessage && errorMessage.startsWith(CONTINUATION_ERROR_MESSAGE)) {
            const unexpectedContinuation = errorMessage.slice(CONTINUATION_ERROR_MESSAGE.length, errorMessage.length - 1);
            const rest = decodedResult.rest;
            const encodedObj = rest.slice(0, rest.length - unexpectedContinuation.length);
            decodedResult.decodedObjects.push(bencoder.decode(encodedObj));
            decodedResult.rest = Buffer.from(unexpectedContinuation);
            return decode(decodedResult);
        }
        else {
            return decodedResult;
        }
    }
}
//# sourceMappingURL=bencodeUtil.js.map