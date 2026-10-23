/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Blockly from 'blockly';
import {installAllBlocks as installColourBlocks} from '@blockly/field-colour';
import p5 from 'p5';
import {blocks} from './blocks/p5';
import {forBlock} from './generators/javascript';
import {javascriptGenerator} from 'blockly/javascript';
import {save, load} from './serialization';
import {toolbox} from './toolbox';
import './index.css';

// Register the blocks and generator with Blockly
installColourBlocks({javascript: javascriptGenerator});
Blockly.common.defineBlocks(blocks);
Object.assign(javascriptGenerator.forBlock, forBlock);
// The generated code refers to the p5 instance as 'sketch'.
javascriptGenerator.addReservedWords('sketch');

// Set up UI elements and inject Blockly
const codeDiv = document.getElementById('generatedCode').firstChild;
const outputDiv = document.getElementById('output');
const blocklyDiv = document.getElementById('blocklyDiv');
const ws = Blockly.inject(blocklyDiv, {toolbox});

// The running p5 sketch, if any.
let currentSketch = null;

// This function shows the generated code from the workspace and runs
// it as a new p5 sketch in the output div, replacing the previous one.
// In a real application, you probably shouldn't run arbitrary code.
const runCode = () => {
  const code = javascriptGenerator.workspaceToCode(ws);
  codeDiv.innerText = code;

  // remove() stops the old sketch's draw loop and deletes its canvas.
  currentSketch?.remove();

  // Wrap the sketch in a `try/catch` so that any errors are logged
  // to the console, instead of failing quietly.
  try {
    // Run p5 in instance mode, passing the instance in as `sketch`.
    const sketchFn = new Function('sketch', code);
    currentSketch = new p5(sketchFn, outputDiv);
  } catch (error) {
    console.log(error);
  }
};

// Load the initial state from storage and run the code.
load(ws);
runCode();

// Every time the workspace changes state, save the changes to storage.
ws.addChangeListener((e) => {
  // UI events are things like scrolling, zooming, etc.
  // No need to save after one of these.
  if (e.isUiEvent) return;
  save(ws);
});

// Whenever the workspace changes meaningfully, run the code again.
ws.addChangeListener((e) => {
  // Don't run the code when the workspace finishes loading; we're
  // already running it once when the application starts.
  // Don't run the code during drags; we might have invalid state.
  if (
    e.isUiEvent ||
    e.type == Blockly.Events.FINISHED_LOADING ||
    ws.isDragging()
  ) {
    return;
  }
  runCode();
});
