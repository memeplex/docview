import * as vscode from 'vscode';
import { build, disconnect } from './rules';
import { view, registerProvider as registerViewerProvider } from './viewer';
import { registerProviders as registerMathProviders } from './hover';

export let uri: vscode.Uri;

export function activate(context: vscode.ExtensionContext) {

  function registerCommand(
    name: string, action: (document: vscode.TextDocument) => any
  ) {
    return vscode.commands.registerCommand(name, () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document) action(document,);
    });
  }

  uri = context.extension.extensionUri;

  context.subscriptions.push(
    registerCommand('sidepeek.build', build),
    registerCommand('sidepeek.view', view),
    registerCommand('sidepeek.disconnect', disconnect),
    registerViewerProvider(),
    ...registerMathProviders(),
    vscode.workspace.onDidCloseTextDocument(disconnect),
  );
}

export function deactivate() { }