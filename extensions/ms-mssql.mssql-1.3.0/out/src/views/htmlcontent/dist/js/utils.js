"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function formatString(str, ...args) {
    // This is based on code originally from https://github.com/Microsoft/vscode/blob/master/src/vs/nls.js
    // License: https://github.com/Microsoft/vscode/blob/master/LICENSE.txt
    let result;
    if (args.length === 0) {
        result = str;
    }
    else {
        result = str.replace(/\{(\d+)\}/g, (match, rest) => {
            let index = rest[0];
            return typeof args[index] !== 'undefined' ? args[index] : match;
        });
    }
    return result;
}
exports.formatString = formatString;
function isNumber(val) {
    return typeof (val) === 'number';
}
exports.isNumber = isNumber;
/**
 * Converts <, >, &, ", ', and any characters that are outside \u00A0 to numeric HTML entity values
 * like &#123;
 * (Adapted from http://stackoverflow.com/a/18750001)
 * @param str String to convert
 * @return String with characters replaced.
 */
function htmlEntities(str) {
    return typeof (str) === 'string'
        ? str.replace(/[\u00A0-\u9999<>\&"']/gim, (i) => { return `&#${i.charCodeAt(0)};`; })
        : undefined;
}
exports.htmlEntities = htmlEntities;
/**
 * Determines if an object is a DbCellValue based on the properties it exposes
 * @param object The object to check
 * @returns True if the object is a DbCellValue, false otherwise
 */
function isDbCellValue(object) {
    return object !== undefined
        && object.displayValue !== undefined
        && object.isNull !== undefined;
}
exports.isDbCellValue = isDbCellValue;

//# sourceMappingURL=utils.js.map
