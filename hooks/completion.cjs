#!/usr/bin/env node
'use strict';
const store = require('./gate-store.cjs');
try {
  const [command, contextFile, inputFile] = process.argv.slice(2);
  const context = store.loadContext(contextFile);
  if (command === 'init') store.initialize(context, store.read(inputFile));
  else if (command === 'finding') store.addFinding(context, store.read(inputFile));
  else if (command === 'result') store.saveResult(context, store.read(inputFile));
  else if (command !== 'check') throw new Error('Usage: completion.cjs init|finding|result|check context.json [input.json]');
  process.stdout.write(JSON.stringify(command === 'check' ? store.check(context) : { written: command, context: context.contextPath }) + '\n');
} catch (error) {
  process.stderr.write('namuk-process completion: ' + error.message + '\n');
  process.exitCode = 1;
}
