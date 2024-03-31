import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "insight" is now active!');

	let disposable = vscode.commands.registerCommand(
		'insight.previewPdf', () => { previewPdf(context.extensionUri); }
	);

	context.subscriptions.push(disposable);
}

export function deactivate() { }

async function previewPdf(extensionUri: vscode.Uri) {
	const panel = vscode.window.createWebviewPanel(
		'pdfPreview',
		'PDF Preview',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(extensionUri, 'pdfjs'),
			]
		}
	);
	const pdfjsUri = vscode.Uri.joinPath(extensionUri, 'pdfjs');
	const htmlData = await vscode.workspace.fs.readFile(
		vscode.Uri.joinPath(pdfjsUri, 'web', 'viewer.html')
	);
	let html = Buffer.from(htmlData).toString('utf8');
	const baseUri = panel.webview.asWebviewUri(pdfjsUri);
	html = html.replaceAll('{{baseUri}}', baseUri.toString());
	const docUri = vscode.Uri.joinPath(baseUri, 'web', 'compressed.tracemonkey-pldi-09.pdf');
	html = html.replaceAll('{{docUri}}', docUri.toString());
	panel.webview.html = html;
	console.log(html);
}