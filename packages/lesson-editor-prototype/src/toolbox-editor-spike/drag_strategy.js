/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's own block drag strategy. It tells the flyout pane about every
 * move, so the pane can show where the block will land, and whether the
 * block is about to connect to another instead.
 */

import * as Blockly from 'blockly';

/** Blocks a palette drag has created, until that drag ends. */
const newFromPalette = new WeakSet();

/**
 * @param {!Blockly.BlockSvg} block A block.
 * @returns {boolean} Whether the drag in progress created it from the palette.
 */
export function isNewFromPalette(block) {
  return newFromPalette.has(block);
}

/** Core's block drag strategy, plus reports to the flyout pane. */
export class EditorBlockDragStrategy
  extends Blockly.dragging.BlockDragStrategy
{
  /** @returns {!Object} The editor's flyout pane. */
  getPane() {
    // Palette blocks live on the palette's workspace, whose target is the
    // editor's. spikeEditor is reachable from either.
    return this.block.workspace.spikeEditor.pane;
  }

  /**
   * A palette block drags a new copy on the flyout pane. That copy gets this
   * strategy too, before its drag starts. @override
   */
  getTargetBlock() {
    const target = super.getTargetBlock();
    if (target !== this.block) {
      applyEditorDragStrategy(target);
      newFromPalette.add(target);
    }
    return target;
  }

  /**
   * Wraps the connection previewer, which is protected for subclasses, to
   * know whether the block is about to connect to another. @override
   */
  startDrag(e) {
    // Before core detaches it, so the pane can see where it started.
    this.getPane().onDragStart(this.block);
    const dragged = super.startDrag(e);
    if (dragged !== this.block) return dragged;
    const previewer = this.connectionPreviewer;
    this.connecting = false;
    this.connectionPreviewer = {
      previewReplacement: (...args) => {
        this.connecting = true;
        previewer.previewReplacement(...args);
      },
      previewConnection: (...args) => {
        this.connecting = true;
        previewer.previewConnection(...args);
      },
      hidePreview: () => {
        this.connecting = false;
        previewer.hidePreview();
      },
      dispose: () => previewer.dispose(),
    };
    return dragged;
  }

  /** @override */
  drag(newLoc, e) {
    super.drag(newLoc, e);
    this.getPane().onDragMove(this.block, e, this.connecting);
  }

  /** @override */
  endDrag(e, disposition) {
    const pane = this.getPane();
    if (
      disposition === Blockly.DragDisposition.COMMIT &&
      pane.takeRejection(this.block)
    ) {
      // Dropped on a dynamic category: undo the move, as core does for a
      // drop it refuses. A new block from the palette goes away again.
      super.revertDrag();
      super.endDrag(e, Blockly.DragDisposition.REVERT);
      pane.onDragEnd(this.block, Blockly.DragDisposition.REVERT);
      if (newFromPalette.has(this.block)) {
        // After the dragger has finished with it.
        setTimeout(() => this.block.dispose(false));
      }
      newFromPalette.delete(this.block);
      return;
    }
    super.endDrag(e, disposition);
    pane.onDragEnd(this.block, disposition);
    newFromPalette.delete(this.block);
  }

  /** @override */
  revertDrag() {
    super.revertDrag();
    this.getPane().onDragEnd(this.block, Blockly.DragDisposition.REVERT);
  }
}

/**
 * Gives a block, and every block inside it, the editor's drag strategy.
 * @param {!Blockly.BlockSvg} block The block.
 */
export function applyEditorDragStrategy(block) {
  for (const descendant of block.getDescendants(false)) {
    // Never replace one mid-drag, which would lose the drag's state.
    // getDragStrategy is @internal.
    if (!(descendant.getDragStrategy() instanceof EditorBlockDragStrategy)) {
      descendant.setDragStrategy(new EditorBlockDragStrategy(descendant));
    }
  }
}
