"use strict";
exports.noop = () => undefined;
function atom(val) {
    let watchers = [];
    const notify = () => watchers.forEach((f) => f(val));
    return {
        update: (fn) => {
            val = fn(val);
            notify();
        },
        addWatch: (fn) => {
            watchers.push(fn);
        },
        removeWatch: (fn) => {
            watchers = watchers.filter((f) => f !== fn);
        },
        deref: () => val
    };
}
exports.atom = atom;
function map(fn, ...xs) {
    let result = [];
    let idx = 0;
    const ln = xs[0].length;
    while (idx < ln) {
        result.push(fn(...xs.map((item) => item[idx])));
        idx++;
    }
    return result;
}
exports.map = map;
function splitLines(text) {
    return text.split(/\n/);
}
exports.splitLines = splitLines;
function debounce(f, interval) {
    let tid;
    return (...args) => {
        clearTimeout(tid);
        tid = setTimeout(() => f(...args), interval);
    };
}
exports.debounce = debounce;
function isParentExprLine(line) {
    return typeof line === "string" && line.match(/^\([a-zA-Z]/) !== null;
}
function findStartRow(lines, idx) {
    if (idx === 0) {
        return 0;
    }
    else {
        let cidx = idx - 1;
        let cango = true;
        while (cango) {
            if (cidx === 0 || isParentExprLine(lines[cidx] || false)) {
                cango = false;
            }
            else {
                cidx = cidx - 1;
            }
        }
        return cidx;
    }
}
exports.findStartRow = findStartRow;
function findEndRow(lines, idx) {
    const cp1 = idx + 1;
    const cp2 = cp1 + 1;
    const midx = lines.length - 1;
    if (midx === idx ||
        midx === cp1 ||
        midx === cp2) {
        return midx;
    }
    else {
        let cidx = cp2;
        let cango = true;
        while (cango) {
            if (cidx === midx || isParentExprLine(lines[cidx] || false)) {
                cango = false;
            }
            else {
                cidx = cidx + 1;
            }
        }
        return cidx;
    }
}
exports.findEndRow = findEndRow;
function linesDiff(textA, textB) {
    const splitA = splitLines(textA);
    const splitB = splitLines(textB);
    const splitBoth = map((...splits) => splits, splitA, splitB);
    const initialCount = { diff: 0, same: 0 };
    return splitBoth.reduce((count, [lineA, lineB]) => {
        if (lineA === lineB) {
            count.same = count.same + 1;
        }
        else {
            count.diff = count.diff + 1;
        }
        return count;
    }, initialCount);
}
exports.linesDiff = linesDiff;
//# sourceMappingURL=utils.js.map