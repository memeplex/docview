import * as vscode from 'vscode';
import { build, disconnect } from './rules';
import { view, registerProvider as registerViewerProvider } from './viewer';
import { registerProviders as registerMathProviders } from './hover';

export function activate(context: vscode.ExtensionContext) {
  function withDocument(action: (document: vscode.TextDocument) => any) {
    const document = vscode.window.activeTextEditor?.document;
    if (document) action(document);
  }

  const registerCommand = vscode.commands.registerCommand;

  context.subscriptions.push(
    registerCommand('sidepeek.build', () => withDocument(build)),
    registerCommand('sidepeek.view', () => withDocument(
      (document) => view(document, context.extension.extensionUri)
    )),
    registerCommand('sidepeek.disconnect', () => withDocument(disconnect)),
    registerViewerProvider(context.extension.extensionUri),
    ...registerMathProviders(),
    vscode.workspace.onDidCloseTextDocument(disconnect),
  );
}

export function deactivate() { }