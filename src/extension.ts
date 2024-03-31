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
	const resolveUri = (path: string) => panel.webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'pdfjs', path)
	);
	//const pdfUrl = resolveUri('web/compressed.tracemonkey-pldi-09.pdf');
	const pdfUrl = resolveUri('web/r.pdf');
	const customHtml = `
<link rel="resource" type="application/l10n" href="${resolveUri('web/locale/locale.json')}">
<link rel="stylesheet" href="${resolveUri('web/viewer.css')}">
<script src="${resolveUri('build/pdf.mjs')}" type="module"></script>
<script src="${resolveUri('web/viewer.mjs')}" type="module"></script>
<script> var pdfUrl = "${pdfUrl}"; </script>
`;
	const htmlData = await vscode.workspace.fs.readFile(
		vscode.Uri.joinPath(extensionUri, 'assets/pdf-viewer.html')
	);
	const html = Buffer.from(htmlData).toString('utf8');
	panel.webview.html = html.replace('@@@custom@@@', customHtml);
	console.log(resolveUri('web/compressed.tracemonkey-pldi-09.pdf').toString());
}