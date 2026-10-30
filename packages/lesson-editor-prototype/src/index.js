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
import {
  findMissingRequirements,
  registerLessonAuthoringContextMenuOptions,
} from '@blockly/plugin-lesson-authoring';
import {
  buildArtifact,
  defaultArtifact,
  loadInitialState,
  save,
  load,
} from './serialization';
import './index.css';

window.Blockly = Blockly;

// Register the blocks and generator with Blockly
installColourBlocks({javascript: javascriptGenerator});
Blockly.common.defineBlocks(blocks);
Object.assign(javascriptGenerator.forBlock, forBlock);
// The generated code refers to the p5 instance as 'sketch'.
javascriptGenerator.addReservedWords('sketch');

// Context menu items are registered globally, so this happens once rather
// than for each lesson's workspace.
registerLessonAuthoringContextMenuOptions();

// Set up UI elements and inject Blockly
const codeDiv = document.getElementById('generatedCode').firstChild;
const outputDiv = document.getElementById('output');
const blocklyDiv = document.getElementById('blocklyDiv');
const titleInput = document.getElementById('titleInput');
const importInput = document.getElementById('importInput');
const statusText = document.getElementById('status');

// The workspace for the current lesson. Each lesson gets its own.
let ws = null;

// The lesson's toolbox. Blockly has no API to read a toolbox definition
// back out of a workspace, so the editor keeps its own copy.
let currentToolbox = null;

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

const currentArtifact = () =>
  buildArtifact(ws, titleInput.value, currentToolbox);

// Every time the workspace changes state, save the changes to storage.
const saveOnChange = (e) => {
  // UI events are things like scrolling, zooming, etc.
  // No need to save after one of these.
  if (e.isUiEvent) return;
  save(currentArtifact());
};

// Whenever the workspace changes meaningfully, run the code again.
const runOnChange = (e) => {
  // Don't run the code when the workspace finishes loading; we're
  // already running it once when a lesson is opened.
  // Don't run the code during drags; we might have invalid state.
  if (
    e.isUiEvent ||
    e.type == Blockly.Events.FINISHED_LOADING ||
    ws.isDragging()
  ) {
    return;
  }
  runCode();
};

// Loads an artifact into the editor, replacing the current lesson. The
// workspace is re-created rather than updated because Blockly can't switch
// an existing workspace between a categorized toolbox and a flyout.
const openArtifact = (artifact) => {
  ws?.dispose();
  // Cleared first so a failed inject doesn't leave a disposed workspace.
  ws = null;
  ws = Blockly.inject(blocklyDiv, {
    toolbox: artifact.toolbox,
    renderer: Math.random() > 0.5 ? 'zelos' : 'thrasos',
  });
  ws.addChangeListener(saveOnChange);
  ws.addChangeListener(runOnChange);
  loadInitialState(artifact, ws);
  currentToolbox = artifact.toolbox;
  titleInput.value = artifact.title ?? '';
};

// Load the saved lesson and run the code.
openArtifact(load());
runCode();

titleInput.addEventListener('input', () => save(currentArtifact()));

// Replaces the lesson with the default one, once the author confirms.
document.getElementById('newButton').addEventListener('click', () => {
  if (!confirm('Start a new lesson? The current lesson will be discarded.')) {
    return;
  }
  openArtifact(defaultArtifact);
  save(currentArtifact());
  runCode();
  statusText.textContent = 'Started a new lesson';
});

// Downloads the lesson as a JSON file named after its title.
document.getElementById('exportButton').addEventListener('click', () => {
  const json = JSON.stringify(currentArtifact(), null, 2);
  const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${titleInput.value.trim() || 'lesson'}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
});

document
  .getElementById('importButton')
  .addEventListener('click', () => importInput.click());

// Replaces the lesson with one from a JSON file, unless the file is invalid
// or needs blocks this app doesn't define.
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  // Reset so that choosing the same file again still fires `change`.
  importInput.value = '';
  if (!file) return;

  const previous = currentArtifact();
  try {
    const artifact = JSON.parse(await file.text());
    const missing = findMissingRequirements(artifact, {
      blockTypes: Object.keys(Blockly.Blocks),
    });
    if (missing.blockTypes.length) {
      statusText.textContent = `Can't import ${file.name}. Missing blocks: ${missing.blockTypes.join(', ')}`;
      return;
    }
    openArtifact(artifact);
    statusText.textContent = `Imported ${file.name}`;
  } catch (error) {
    // Loading can fail partway through, so put the previous lesson back.
    openArtifact(previous);
    statusText.textContent = `Can't import ${file.name}. ${error.message}`;
  }
  save(currentArtifact());
  runCode();
});
