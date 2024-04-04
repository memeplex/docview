import * as vscode from 'vscode';
import { basename, parse } from 'path';

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
  registerCommand('sidepeek.build', buildCommand);
  registerCommand('sidepeek.view', (path) => {
    viewCommand(path, context.extension.extensionUri);
  });
  registerCommand('sidepeek.disconnect', disconnectCommand);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "sidepeek.view",
      new ViewerProvider(context.extension.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(disconnectCommand)
  );
}

export function deactivate() { }

type Rule = {
  label: string;
  task: vscode.Task;
  output: string;
};

export class ViewerProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private extensionUri: vscode.Uri) { }

  openCustomDocument(uri: vscode.Uri) {
    return { uri, dispose: () => { } };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument, viewer: vscode.WebviewPanel
  ) {
    // https://github.com/microsoft/vscode/issues/209576
    viewer.webview.options = { enableScripts: true };
    initViewer(viewer, document.uri.fsPath, this.extensionUri);
  }
}

// https://github.com/microsoft/vscode/issues/209304
const defaultInput = '\\.md$';
const defaultOutput = '{{dir}}/{{name}}.{{format}}';
const ruleRegistry: { [path: string]: Rule } = {};
const viewerRegistry: { [path: string]: vscode.WebviewPanel } = {};
const error = vscode.window.showErrorMessage;

async function buildCommand(document: vscode.TextDocument) {
  const rule = await getRule(document.fileName);
  if (!rule) return;
  await document.save();
  vscode.tasks.executeTask(rule.task);
}

async function viewCommand(
  document: vscode.TextDocument, extensionUri: vscode.Uri
) {
  const rule = await getRule(document.fileName);
  if (!rule) return;
  const viewer = viewerRegistry[rule.output];
  if (viewer) {
    viewer.reveal();
  } else {
    await document.save();
    const disposable = vscode.tasks.onDidEndTask(event => {
      if (event.execution.task === rule.task) {
        disposable.dispose();
        createViewer(rule.output, extensionUri);
      }
    });
    vscode.tasks.executeTask(rule.task);
  }
}

function disconnectCommand(document: vscode.TextDocument) {
  delete ruleRegistry[document.fileName];
}

async function getRule(path: string) {
  let rule: Rule | undefined = ruleRegistry[path];
  if (!rule) {
    const rules = await matchRules(path);
    if (rules.length === 0) {
      error(`No rule matches ${path}`);
    } else if (rules.length === 1) {
      rule = rules[0];
    } else {
      rule = await vscode.window.showQuickPick(rules, {
        title: "Select preview rule",
      });
    }
    if (!rule) return;
    ruleRegistry[path] = rule;
  }
  return rule;
}

export async function matchRules(path: string) {
  const config = vscode.workspace.getConfiguration('sidepeek.rules');
  if (!config) return [];
  let rules: Rule[] = [];
  for (const [name, rule] of Object.entries(config)) {
    const match = path.match(rule.input ?? defaultInput);
    if (!match) continue;
    const task = await getTask(rule.task);
    if (!task) continue;
    const substitutions = { ...match.groups, ...parse(path), input: path };
    const execution = task.execution as vscode.ShellExecution;
    const command = substitute(execution.commandLine!, substitutions);
    const output = substitute(rule.output ?? defaultOutput, substitutions);
    for (const [variant, format] of Object.entries(rule.variants)) {
      const substitutions = { variant, format } as { [key: string]: string };
      const variantOutput = substitute(output, substitutions);
      const variantCommand = substitute(
        command, { output: variantOutput, ...substitutions }
      );
      const variantTask = new vscode.Task(
        task.definition,
        task.scope!,
        task.name,
        task.source,
        new vscode.ShellExecution(variantCommand, execution.options),
        task.problemMatchers
      );
      variantTask.presentationOptions = task.presentationOptions;
      rules.push({
        label: `${name}: ${variant}`,
        task: variantTask,
        output: variantOutput
      });
    }
  }
  return rules;
}

async function getTask(name: string) {
  const tasks = await vscode.tasks.fetchTasks();
  for (const task of tasks) {
    if (task.name !== name) continue;
    if (!(task.execution instanceof vscode.ShellExecution)) {
      error(`Task '${name}' must be of type shell`);
      continue;
    }
    if (!task.execution.commandLine) {
      error(`Task '${name}' must specify a command line`);
      continue;
    }
    return task;
  }
  error(`No valid task for '${name}'`);
}

function createViewer(path: string, extensionUri: vscode.Uri) {
  if (!path.endsWith(".pdf") && !path.endsWith(".html")) {
    error("Viewer support html and pdf formats only");
    return;
  }
  const viewer = viewerRegistry[path] = vscode.window.createWebviewPanel(
    'sidepeekViewer',
    `Preview ${basename(path)}`,
    vscode.ViewColumn.Beside,
    { retainContextWhenHidden: true, enableScripts: true }
  );
  viewer.onDidDispose(() => delete viewerRegistry[path]);
  initViewer(viewer, path, extensionUri);
  return viewer;
}

async function initViewer(
  viewer: vscode.WebviewPanel, path: string, extensionUri: vscode.Uri
) {
  const webview = viewer.webview;
  const uri = vscode.Uri.file(path);
  const render = async () => {
    if (path.endsWith(".pdf")) {
      if (!webview.html) {
        const html = await readFile(
          vscode.Uri.joinPath(extensionUri, 'assets/viewer.html')
        );
        webview.html = substitute(html, {
          extensionUri: webview.asWebviewUri(extensionUri).toString(),
          documentUri: webview.asWebviewUri(uri).toString(),
          cspSource: webview.cspSource
        });
      } else {
        webview.postMessage("reload-document");
      }
    } else {
      webview.html = await readFile(uri);
    }
    console.log(webview.html);
  };
  const watcher = vscode.workspace.createFileSystemWatcher(path);
  watcher.onDidChange(render);
  watcher.onDidDelete(() => viewer.dispose());
  viewer.onDidDispose(() => watcher.dispose());
  render();
}

function substitute(text: string, substitutions: { [key: string]: string }) {
  for (const [from, to] of Object.entries(substitutions)) {
    text = text.replaceAll(`{{${from}}}`, to);
  }
  return text;
}

async function readFile(uri: vscode.Uri) {
  const data = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(data).toString('utf8');
}
