/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Blockly from 'blockly/core';
import {starterState} from './starter';
import {toolbox} from './toolbox';

const storageKey = 'lessonArtifact';

/** The lesson a new user starts with. */
export const defaultArtifact = {
  title: '',
  toolbox,
  initialWorkspaceState: starterState,
};

/**
 * Builds a lesson artifact from the current state of the editor.
 * @param {Blockly.Workspace} workspace The workspace holding the initial state.
 * @param {string} title The lesson title.
 * @param {Blockly.utils.toolbox.ToolboxInfo} toolbox The lesson's toolbox.
 * @returns {object} The lesson artifact.
 */
export const buildArtifact = function (workspace, title, toolbox) {
  return {
    title,
    toolbox,
    initialWorkspaceState: Blockly.serialization.workspaces.save(workspace),
  };
};

/**
 * Loads a lesson artifact's initial state into the workspace.
 * @param {object} artifact The lesson artifact to load.
 * @param {Blockly.Workspace} workspace Blockly workspace to load into.
 */
export const loadInitialState = function (artifact, workspace) {
  // Don't emit events during loading.
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load(
      artifact.initialWorkspaceState,
      workspace,
    );
  } finally {
    Blockly.Events.enable();
  }
};

/**
 * Saves a lesson artifact to the browser's local storage.
 * @param {object} artifact The lesson artifact to save.
 */
export const save = function (artifact) {
  window.localStorage?.setItem(storageKey, JSON.stringify(artifact));
};

/**
 * Returns the lesson artifact saved in local storage, or the default lesson
 * if nothing has been saved yet.
 * @returns {object} The lesson artifact.
 */
export const load = function () {
  const data = window.localStorage?.getItem(storageKey);
  return data ? JSON.parse(data) : defaultArtifact;
};
