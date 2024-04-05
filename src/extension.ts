import * as vscode from 'vscode';
import { build, disconnect } from './rules';
import { view, registerProvider } from './viewer';

export function activate(context: vscode.ExtensionContext) {
  function registerCommand(
    name: string, action: (document: vscode.TextDocument) => any
  ) {
    context.subscriptions.push(
      vscode.commands.registerCommand(name, () => {
        const document = vscode.window.activeTextEditor?.document;
        if (document) action(document);
      })
    );
  }
  registerCommand('sidepeek.build', build);
  registerCommand('sidepeek.view', (path) => {
    view(path, context.extension.extensionUri);
  });
  registerCommand('sidepeek.disconnect', disconnect);

  context.subscriptions.push(
    registerProvider(context.extension.extensionUri)
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(disconnect)
  );
}

export function deactivate() { }