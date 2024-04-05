import * as vscode from 'vscode';

export const error = vscode.window.showErrorMessage;

export function substitute(
  text: string, substitutions: { [key: string]: string }
) {
  for (const [from, to] of Object.entries(substitutions)) {
    text = text.replaceAll(`{{${from}}}`, to);
  }
  return text;
}

export async function readFile(uri: vscode.Uri) {
  const data = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(data).toString('utf8');
}
