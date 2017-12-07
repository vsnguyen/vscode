// Compiled by ClojureScript 1.9.293 {:target :nodejs}
goog.provide('vscode_parinfer.core');
goog.require('cljs.core');
vscode_parinfer.core.vscode = require("vscode");
vscode_parinfer.core.activate = (function vscode_parinfer$core$activate(){
return console.log("Hello World");
});
vscode_parinfer.core.deactivate = (function vscode_parinfer$core$deactivate(){
return console.log("Goodbye World");
});
module.exports = ({"activate": vscode_parinfer.core.activate, "deactivate": vscode_parinfer.core.deactivate});
cljs.core._STAR_main_cli_fn_STAR_ = (function (){
return null;
});
