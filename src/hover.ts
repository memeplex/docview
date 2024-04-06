import vscode from 'vscode';

type Delimiter = { left: string, right: string, inline: boolean };
type Match = { position: vscode.Position, delimiter: Delimiter };

let MathJax: any;

export function* registerProviders() {
  const config = vscode.workspace.getConfiguration('sidepeek.hover');
  for (const language of config.languages) {
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
        for (const delimiter of delimiters) {
          const { left, right } = delimiter;
          const [i, offset] = dir === -1 ?
            [text.lastIndexOf(left, j && j - 1), left.length] :
            [text.indexOf(right, j), 0];
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
    const md = await tex2md(tex, leftMatch.delimiter.inline);
    return new vscode.Hover(new vscode.MarkdownString(md), range);
  }
}

async function tex2md(tex: string, inline: boolean) {
  if (!MathJax) {
    const options = { loader: { load: ['input/tex', 'output/svg'] } };
    MathJax = await require('mathjax').init(options);
  }
  const dark = [
    vscode.ColorThemeKind.Dark, vscode.ColorThemeKind.HighContrast
  ].includes(vscode.window.activeColorTheme.kind);
  let css = `* { font-size: 110%; color: ${dark ? 'white' : 'black'}; }`;
  let svg = MathJax.tex2svg(tex, { display: !inline });
  svg = MathJax.startup.adaptor.innerHTML(svg);
  svg = svg.replace(/<defs>/, `<defs><style>${css}</style>`);
  const base64 = Buffer.from(svg).toString('base64');
  return `![](data:image/svg+xml;base64,${base64})`;
}