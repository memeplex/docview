import vscode from 'vscode';

type Delimiter = { left: string, right: string, inline: boolean };
type Match = { position: vscode.Position, delimiter: Delimiter };

let MathJax: any;

export function* registerProviders() {
  const config = vscode.workspace.getConfiguration('sidepeek.hover');
  for (let language of config.languages) {
    yield vscode.languages.registerHoverProvider(
      { language }, new MathHoverProvider()
    );
  }
}

class MathHoverProvider implements vscode.HoverProvider {
  public async provideHover(
    document: vscode.TextDocument, position: vscode.Position
  ) {
    function search(delimiters: Delimiter[], dir: number): Match | undefined {
      const toN = position.line + dir * config.scanUpTo;
      for (let n = position.line; n !== toN; n += dir) {
        const j = n === position.line ? position.character : undefined;
        const text = document.lineAt(n).text;
        for (let delimiter of delimiters) {
          const [i, offset] = dir === -1 ?
            [text.lastIndexOf(delimiter.left, j), delimiter.left.length] :
            [text.indexOf(delimiter.right, j), 0];
          if (i === -1) continue;
          const position = new vscode.Position(n, i + offset);
          return { position, delimiter };
        }
      }
    }

    const config = vscode.workspace.getConfiguration(
      'sidepeek.math', { languageId: document.languageId }
    );
    const leftMatch = search(config.delimiters, -1);
    if (!leftMatch) return;
    const rightMatch = search([leftMatch.delimiter], 1);
    if (!rightMatch) return;
    const range = new vscode.Range(leftMatch.position, rightMatch.position);
    const tex = document.getText(range).trim();
    const svg = await tex2svg(tex, leftMatch.delimiter.inline);
    const contents = new vscode.MarkdownString(`![](${svg})`);
    return new vscode.Hover(contents, range);
  }
}

async function tex2svg(tex: string, inline: boolean) {
  if (!MathJax) {
    const options = { loader: { load: ['input/tex', 'output/svg'] } };
    MathJax = await require('mathjax').init(options);
  }
  const svg = MathJax.startup.adaptor.innerHTML(
    MathJax.tex2svg(tex, { display: !inline })
  );
  const base64 = Buffer.from(svg).toString('base64');
  return 'data:image/svg+xml;base64,' + base64;
}