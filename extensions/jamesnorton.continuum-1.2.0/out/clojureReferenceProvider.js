"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const editorUtils_1 = require("./editorUtils");
class ClojureReferenceProvider {
    referencesCode(document, position) {
        let fileContents = document.getText();
        var regex = /\(ns\s+?(.*?)(\s|\))/;
        var ns = regex.exec(fileContents.toString())[1];
        let prefixRange = document.getWordRangeAtPosition(position);
        var prefix = document.getText(prefixRange);
        let offset = document.offsetAt(position) - 1;
        var src = fileContents.substring(0, offset) + "__prefix__" + fileContents.substring(offset + prefix.length);
        src = editorUtils_1.EditorUtils.escapeClojureCodeInString(src);
        let rval = `(do (require '[clojure.tools.namespace.dir :as dir])
     (require '[clojure.tools.namespace.track :as track])
     (let [])
     (defn make-proxy
      [reader count-atom]
      (proxy [java.io.PushbackReader clojure.lang.IDeref] [reader]
       (deref [] @count-atom)
       (read [] (do (swap! count-atom inc) (proxy-super read)))
       (unread [c] (do (swap! count-atom dec) (proxy-super unread c)))))
       
     (defn find-high-level-form
      [src position]
      (let[rdr (make-proxy (java.io.StringReader. src) (atom 0))]
       (loop [form (binding [*read-eval* false] (read rdr)) pos @rdr]
        (if (> pos position)
         form
         (recur (binding [*read-eval* false] (read rdr)) @rdr)))))
       
     (let [src ${src}
           pos ${offset}
           ctx (str (find-high-level-form src pos))]
      (let [completions (compliment.core/completions
                         \"${prefix}\"
                         {:tag-candidates true
                          :ns '${ns}
                          :ctx ctx})]
        (->> completions
             (take 3050)
             (mapv #(assoc % :docs (compliment.core/documentation
                                    (:candidate %) '${ns})))))))`;
        return [rval, prefix];
    }
    provideReferences(document, position, context) {
        let self = this;
        return new Promise((resolve, reject) => {
            let wordRange = document.getWordRangeAtPosition(position);
            let symbol = document.getText(wordRange);
        });
    }
}
exports.ClojureReferenceProvider = ClojureReferenceProvider;
//# sourceMappingURL=clojureReferenceProvider.js.map