import * as vscode from 'vscode';
import { parse } from 'path';
import { error, substitute } from './util';

// https://github.com/microsoft/vscode/issues/209304
const defaultInput = '\\.md$';
const defaultOutput = '{{dir}}/{{name}}.{{format}}';
const registry: { [path: string]: Rule } = {};

type Rule = { label: string, task: vscode.Task, output: string };

export async function build(document: vscode.TextDocument) {
  const rule = await getRule(document.fileName);
  if (!rule) return;
  await document.save();
  vscode.tasks.executeTask(rule.task);
}

export function disconnect(document: vscode.TextDocument) {
  delete registry[document.fileName];
}

export async function getRule(path: string) {
  let rule: Rule | undefined = registry[path];
  if (!rule) {
    const rules = await matchRules(path);
    if (rules.length === 0) {
      error(`No rule matches ${path}`);
    } else if (rules.length === 1) {
      rule = rules[0];
    } else {
      rule = await vscode.window.showQuickPick(rules, {
        title: 'Select preview rule',
      });
    }
    if (!rule) return;
    registry[path] = rule;
  }
  return rule;
}

async function matchRules(path: string) {
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
