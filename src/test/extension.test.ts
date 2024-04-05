import * as assert from 'assert';
import * as vscode from 'vscode';
import { matchRules } from '../extension';


suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Labels', async () => {
		assert.deepEqual(
			(await matchRules("test.md")).map(rule => rule.label),
			[
				'pandoc: html',
				'pandoc: revealjs',
				'pandoc: pdf',
				'pandoc: beamer',
				'myst: html'
			]
		);
		assert.deepEqual(
			(await matchRules("test.typ")).map(rule => rule.label),
			['typst: pdf']
		);
	});
});
