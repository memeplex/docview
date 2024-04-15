import * as vscode from 'vscode';
import { basename } from 'path';
import { uri as extensionUri } from './extension';
import { getRule } from './rules';
import { error, readFile, substitute } from './util';

const registry: { [path: string]: vscode.WebviewPanel } = {};

class ViewerProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private extensionUri: vscode.Uri) { }

  openCustomDocument(uri: vscode.Uri) {
    return { uri, dispose: () => { } };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument, viewer: vscode.WebviewPanel
  ) {
    // https://github.com/microsoft/vscode/issues/209576
    viewer.webview.options = { enableScripts: true };
    initViewer(viewer, document.uri.fsPath);
  }
}

export function registerProvider() {
  return vscode.window.registerCustomEditorProvider(
    'sidepeek.view',
    new ViewerProvider(extensionUri),
    { webviewOptions: { retainContextWhenHidden: true } }
  );
}

export async function view(document: vscode.TextDocument) {
  const rule = await getRule(document.fileName);
  if (!rule) return;
  const viewer = registry[rule.output];
  if (viewer) {
    viewer.reveal();
  } else {
    await document.save();
    const disposable = vscode.tasks.onDidEndTask(event => {
      if (event.execution.task === rule.task) {
        disposable.dispose();
        createViewer(rule.output);
      }
    });
    vscode.tasks.executeTask(rule.task);
  }
}

function createViewer(path: string) {
  if (!path.endsWith('.pdf') && !path.endsWith('.html')) {
    error('Viewer support html and pdf formats only');
    return;
  }
  const viewer = registry[path] = vscode.window.createWebviewPanel(
    'sidepeekViewer',
    `Preview ${basename(path)}`,
    vscode.ViewColumn.Beside,
    { retainContextWhenHidden: true, enableScripts: true }
  );
  viewer.onDidDispose(() => delete registry[path]);
  initViewer(viewer, path);
  return viewer;
}

async function initViewer(viewer: vscode.WebviewPanel, path: string) {
  const webview = viewer.webview;
  const uri = vscode.Uri.file(path);
  const render = async () => {
    if (path.endsWith('.html')) {
      webview.html = await readFile(uri);
    } else {
      renderPdf(webview, uri);
    }
  };
  const watcher = vscode.workspace.createFileSystemWatcher(path);
  watcher.onDidChange(render);
  watcher.onDidDelete(() => viewer.dispose());
  viewer.onDidDispose(() => watcher.dispose());
  render();
}

async function renderPdf(webview: vscode.Webview, uri: vscode.Uri) {
  if (!webview.html) {
    const pdfjsUri = vscode.Uri.joinPath(extensionUri, 'pdfjs');
    const viewerUri = vscode.Uri.joinPath(pdfjsUri, 'web/viewer.html');
    const html = await readFile(viewerUri);
    webview.html = substitute(html, {
      pdfjsUri: webview.asWebviewUri(pdfjsUri).toString(),
      documentUri: webview.asWebviewUri(uri).toString(),
      cspSource: webview.cspSource
    });
  } else {
    webview.postMessage('reload-document');
  }
}
