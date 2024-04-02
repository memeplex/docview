import * as vscode from 'vscode';
import { basename, parse } from 'path';

export function activate(context: vscode.ExtensionContext) {
	function registerCommand(
		name: string, action: (document: vscode.TextDocument) => any
	) {
		context.subscriptions.push(
			vscode.commands.registerCommand(name, () => {
				const document = vscode.window.activeTextEditor?.document;
				if (document) { action(document); }
			})
		);
	}
	registerCommand('insight.build', buildCommand);
	registerCommand('insight.view', (path) => {
		viewCommand(path, context.extension.extensionUri);
	});
	registerCommand('insight.disconnect', disconnectCommand);
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			delete ruleRegistry[document.uri.fsPath];
		})
	);
}

export function deactivate() { }

type Rule = {
	label: string;
	task: vscode.Task;
	output: string;
};

// https://github.com/microsoft/vscode/issues/209304
const defaultInput = '\\.md$';
const defaultOutput = '{{dir}}/{{name}}.{{format}}';
const ruleRegistry: { [path: string]: Rule } = {};
const viewerRegistry: { [path: string]: vscode.WebviewPanel } = {};
const error = vscode.window.showErrorMessage;

function buildCommand(document: vscode.TextDocument) {
	build(document);
}

function viewCommand(document: vscode.TextDocument, extensionUri: vscode.Uri) {
	build(document, (rule) => view(rule.output, extensionUri));
}

function disconnectCommand(document: vscode.TextDocument) {
	delete ruleRegistry[document.fileName];
}

async function build(document: vscode.TextDocument, onBuilt?: (rule: Rule) => any) {
	const rule = await getRule(document.fileName);
	if (!rule) { return; }
	await document.save();
	const execution = await vscode.tasks.executeTask(rule.task);
	if (!onBuilt) { return; }
	const disposable = vscode.tasks.onDidEndTask(event => {
		if (event.execution.task === execution.task) {
			disposable.dispose();
			onBuilt(rule);
		}
	});
}

async function view(path: string, extensionUri: vscode.Uri) {
	const viewer = getViewer(path);
	if (!viewer) { return; }
	const webview = viewer.webview;
	const uri = vscode.Uri.file(path);
	if (webview.html) {
		if (path.endsWith(".pdf")) {
			webview.postMessage("reload-document");
		} else {
			webview.html = await readFile(uri);
		}
		viewer.reveal();
	} else {
		if (path.endsWith(".pdf")) {
			const viewerUri = vscode.Uri.joinPath(extensionUri, 'assets', 'viewer.html');
			webview.html = ((await readFile(viewerUri))
				.replaceAll('{{extensionUri}}', webview.asWebviewUri(extensionUri).toString())
				.replaceAll('{{documentUri}}', webview.asWebviewUri(uri).toString())
			);
		} else {
			webview.html = await readFile(uri);
		}
	}
}

async function getRule(path: string) {
	let rule: Rule | undefined = ruleRegistry[path];
	if (!rule) {
		const rules = getRules(path);
		if (!rules) {
			error(`No rule matches ${path}`);
			return;
		}
		rule = await vscode.window.showQuickPick(rules, {
			title: "Select preview rule",
		});
		if (!rule) { return; }
		ruleRegistry[path] = rule;
	}
	return rule;
}

export async function getRules(path: string) {
	const config = vscode.workspace.getConfiguration('insight.rules');
	if (!config) { return []; }
	let rules: Rule[] = [];
	for (const [name, rule] of Object.entries(config)) {
		const match = path.match(rule.input || defaultInput);
		if (!match) { continue; }
		const task = await getTask(rule.task);
		if (!task) { continue; }
		const substitutions = { ...match.groups, ...parse(path), input: path };
		const execution = task.execution as vscode.ShellExecution;
		const command = substitute(execution.commandLine!, substitutions);
		const output = substitute(rule.output || defaultOutput, substitutions);
		for (const [variant, format] of Object.entries(rule.variants)) {
			const substitutions = { variant, format } as { [key: string]: string };
			const variantOutput = substitute(output, substitutions);
			const variantCommand = substitute(
				command, { output: variantOutput, ...substitutions }
			);
			rules.push({
				label: `${name}: ${variant}`,
				task: new vscode.Task(
					task.definition,
					task.scope!,
					task.name,
					task.source,
					new vscode.ShellExecution(variantCommand, execution.options),
					task.problemMatchers
				),
				output: variantOutput
			});
		}
	}
	return rules;
}

async function getTask(name: string) {
	const tasks = await vscode.tasks.fetchTasks();
	for (const task of tasks) {
		if (task.name !== name) { continue; }
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

function getViewer(path: string) {
	let viewer = viewerRegistry[path];
	if (!viewer) {
		if (!path.endsWith(".pdf") && !path.endsWith(".html")) {
			error("Viewer support html and pdf formats only");
			return;
		}
		viewer = vscode.window.createWebviewPanel(
			'insightViewer',
			`Preview ${basename(path)}`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);
		viewer.onDidDispose(() => delete viewerRegistry[path]);
		viewerRegistry[path] = viewer;
	}
	return viewer;
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
