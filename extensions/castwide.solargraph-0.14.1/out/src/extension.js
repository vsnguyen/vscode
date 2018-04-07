'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const solargraph = require("solargraph-utils");
const SolargraphDocumentProvider_1 = require("./SolargraphDocumentProvider");
const language_client_1 = require("./language-client");
let socketProvider;
function activate(context) {
    let applyConfiguration = function (config) {
        let vsconfig = vscode.workspace.getConfiguration('solargraph');
        config.commandPath = vsconfig.commandPath || 'solargraph';
        config.useBundler = vsconfig.useBundler || false;
        config.bundlerPath = vsconfig.bundlerPath || 'bundle';
        config.viewsPath = vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views';
        config.withSnippets = vsconfig.withSnippets || false;
        config.workspace = vscode.workspace.rootPath || null;
    };
    let solargraphConfiguration = new solargraph.Configuration();
    applyConfiguration(solargraphConfiguration);
    socketProvider = new solargraph.SocketProvider(solargraphConfiguration);
    let solargraphDocumentProvider = new SolargraphDocumentProvider_1.default();
    let languageClient;
    let disposableClient;
    var startLanguageServer = function () {
        socketProvider.start().then(() => {
            languageClient = language_client_1.makeLanguageClient(socketProvider);
            solargraphDocumentProvider.setLanguageClient(languageClient);
            disposableClient = languageClient.start();
            context.subscriptions.push(disposableClient);
        }).catch((err) => {
            console.log('Failed to start language server: ' + err);
        });
    };
    var checkGemVersion = function () {
        console.log('Checking gem version');
        solargraph.verifyGemIsCurrent(solargraphConfiguration).then((result) => {
            if (result) {
                console.log('Solargraph gem version is current');
            }
            else {
                notifyGemUpdate();
            }
        }).catch(() => {
            console.log('An error occurred checking the Solargraph gem version.');
        });
    };
    // https://css-tricks.com/snippets/javascript/get-url-variables/
    var getQueryVariable = function (query, variable) {
        var vars = query.split("&");
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split("=");
            if (pair[0] == variable) {
                return pair[1];
            }
        }
    };
    var restartLanguageServer = function () {
        return new Promise((resolve) => {
            if (languageClient) {
                languageClient.stop().then(() => {
                    disposableClient.dispose();
                    socketProvider.restart().then(() => {
                        languageClient = language_client_1.makeLanguageClient(socketProvider);
                        solargraphDocumentProvider.setLanguageClient(languageClient);
                        disposableClient = languageClient.start();
                        context.subscriptions.push(disposableClient);
                        resolve();
                    });
                });
            }
            else {
                startLanguageServer();
                resolve();
            }
        });
    };
    function notifyGemUpdate() {
        if (vscode.workspace.getConfiguration('solargraph').useBundler && vscode.workspace.rootPath) {
            vscode.window.showInformationMessage('A new version of the Solargraph gem is available. Update your Gemfile to install it.');
        }
        else {
            vscode.window.showInformationMessage('A new version of the Solargraph gem is available. Run `gem update solargraph` to install it.', 'Update Now').then((item) => {
                if (item == 'Update Now') {
                    solargraph.updateGem(solargraphConfiguration).then(() => {
                        restartLanguageServer().then(() => {
                            vscode.window.showInformationMessage('Successfully updated the Solargraph gem.');
                        });
                    }).catch(() => {
                        vscode.window.showErrorMessage('Failed to update the Solargraph gem.');
                    });
                }
            });
        }
    }
    /**
     * If the rebornix.Ruby extension is installed, check if Solargraph is the
     * selected method for code completion.
     */
    function isCodeCompletionEnabled() {
        var rubyExt = vscode.extensions.getExtension('rebornix.Ruby');
        if (rubyExt && rubyExt.isActive) {
            var codeCompletion = vscode.workspace.getConfiguration('ruby').get('codeCompletion');
            if (codeCompletion && codeCompletion != 'solargraph') {
                return false;
            }
            return (false);
        }
    }
    // Open command (used internally for browsing documentation pages)
    var disposableOpen = vscode.commands.registerCommand('solargraph._openDocument', (uriString) => {
        var uri = vscode.Uri.parse(uriString);
        var label = (uri.path == '/search' ? 'Search for ' : '') + getQueryVariable(uri.query, "query");
        vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
    });
    context.subscriptions.push(disposableOpen);
    // Open URL command (used internally for browsing documentation pages)
    var disposableOpenUrl = vscode.commands.registerCommand('solargraph._openDocumentUrl', (uriString) => {
        var uri = vscode.Uri.parse(uriString);
        var label = (uri.path == '/search' ? 'Search for ' : '') + getQueryVariable(uri.query, "query");
        vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
    });
    context.subscriptions.push(disposableOpenUrl);
    // Restart command
    var disposableRestart = vscode.commands.registerCommand('solargraph.restart', () => {
        restartLanguageServer().then(() => {
            vscode.window.showInformationMessage('Solargraph server restarted.');
        });
    });
    context.subscriptions.push(disposableRestart);
    // Search command
    var disposableSearch = vscode.commands.registerCommand('solargraph.search', () => {
        vscode.window.showInputBox({ prompt: 'Search Ruby documentation:' }).then(val => {
            if (val) {
                var uri = 'solargraph:/search?query=' + encodeURIComponent(val);
                vscode.commands.executeCommand('solargraph._openDocument', uri);
            }
        });
    });
    context.subscriptions.push(disposableSearch);
    // Check gem version command
    var disposableCheckGemVersion = vscode.commands.registerCommand('solargraph.checkGemVersion', () => {
        solargraph.verifyGemIsCurrent(solargraphConfiguration).then((result) => {
            if (result) {
                vscode.window.showInformationMessage('Solargraph gem is up to date.');
            }
            else {
                notifyGemUpdate();
            }
        }).catch(() => {
            console.log('An error occurred checking the Solargraph gem version.');
        });
    });
    context.subscriptions.push(disposableSearch);
    solargraph.verifyGemIsInstalled(solargraphConfiguration).then((result) => {
        // TODO: Check for enablement from the rebornix.Ruby extension until this
        // extension is no longer one of its dependencies.
        /**
         * If the rebornix.Ruby extension is installed, check if Solargraph is the
         * selected method for code completion.
         */
        var isCodeCompletionEnabled = function () {
            var rubyExt = vscode.extensions.getExtension('rebornix.Ruby');
            if (rubyExt && rubyExt.isActive) {
                if (rubyExt.packageJSON.version != '0.17.0')
                    return true;
                var codeCompletion = vscode.workspace.getConfiguration('ruby').get('codeCompletion');
                if (codeCompletion && codeCompletion != 'solargraph') {
                    return false;
                }
            }
            return true;
        };
        /**
         * If the rebornix.Ruby extension is installed, check if Solargraph is the
         * selected method for intellisense.
         */
        var isIntellisenseEnabled = function () {
            var rubyExt = vscode.extensions.getExtension('rebornix.Ruby');
            if (rubyExt && rubyExt.isActive) {
                if (rubyExt.packageJSON.version != '0.17.0')
                    return true;
                var intellisense = vscode.workspace.getConfiguration('ruby').get('intellisense');
                if (intellisense && intellisense != 'solargraph') {
                    return false;
                }
            }
            return true;
        };
        if (result) {
            console.log('The Solargraph gem is installed and working.');
            // TODO: Check rebornix.Ruby settings while it depends on this extension
            if (vscode.workspace.getConfiguration('solargraph').checkGemVersion && (isCodeCompletionEnabled() || isIntellisenseEnabled())) {
                checkGemVersion();
            }
            if (isCodeCompletionEnabled()) {
                startLanguageServer();
            }
        }
        else {
            console.log('The Solargraph gem is not available.');
            // TODO: Disable this error message while rebornix.Ruby depends on this extension
            // vscode.window.showErrorMessage('Solargraph gem not found. Run `gem install solargraph` or update your Gemfile.', 'Install Now').then((item) => {
            // 	if (item == 'Install Now') {
            // 		solargraph.installGem(solargraphConfiguration).then(() => {
            // 			vscode.window.showInformationMessage('Successfully installed the Solargraph gem.')
            // 			startLanguageServer();
            // 		}).catch(() => {
            // 			vscode.window.showErrorMessage('Failed to install the Solargraph gem.')
            // 		});
            // 	}
            // });
        }
    });
    vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}
exports.activate = activate;
function deactivate() {
    socketProvider.stop();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map