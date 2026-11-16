/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pane 2: the toolbox being edited, drawn by core's own toolbox and category
 * classes. Selecting a category loads it into the flyout pane instead of
 * opening a flyout.
 */

import * as Blockly from 'blockly';
import {ContinuousCategory} from '@blockly/continuous-toolbox';
import {applyEditorDragStrategy} from './drag_strategy';

/** The toolbox being edited. Its flyout is the palette. */
export class EditorToolbox extends Blockly.Toolbox {
  /** @override */
  init() {
    super.init();
    const flyout = this.getFlyout();
    const editor = this.getEditor();
    editor.categoryChipWidth = undefined;
    flyout.show(editor.paletteContents());
    if (editor.mode !== 'flyout') {
      // Draw the categories again, all as wide as the widest.
      const widths = flyout
        .getContents()
        .filter((item) => item.getElement().item?.kind === 'category')
        .map((item) => item.getElement().getBoundingRectangle().getWidth());
      editor.categoryChipWidth = Math.max(0, ...widths);
      flyout.show(editor.paletteContents());
    }
    // So blocks dragged out of the palette report their moves to the pane.
    for (const block of flyout.getWorkspace().getTopBlocks(false)) {
      applyEditorDragStrategy(block);
    }
    // Clicking a palette block adds a copy. Core only does that for flyouts
    // that close themselves, and otherwise just reports the click.
    flyout.getWorkspace().addChangeListener((e) => {
      if (e.type !== Blockly.Events.CLICK || e.targetType !== 'block') return;
      const block = flyout.getWorkspace().getBlockById(e.blockId);
      if (block) editor.insertBlockFromPalette(block.getRootBlock());
    });
    this.enableEditing();
    this.enableRowDragging();
    this.position();
  }

  /** @returns {!Object} The editor that owns this toolbox. */
  getEditor() {
    return this.workspace_.spikeEditor;
  }

  /**
   * Loads the selected category into the flyout pane. The toolbox's own
   * flyout stays on the palette.
   * @override
   */
  updateFlyout_(_oldItem, newItem) {
    this.getEditor().onCategorySelected(newItem);
  }

  /** Clicking the selected category again keeps it selected. @override */
  shouldDeselectItem_(oldItem, newItem) {
    return !!(oldItem && oldItem !== newItem);
  }

  /** Core would show the selected category's contents in the flyout. @override */
  refreshSelection() {}

  /** Puts the toolbox to the right of the palette. @override */
  position() {
    super.position();
    if (!this.HtmlDiv) return;
    const flyout = this.getFlyout();
    this.HtmlDiv.style.left = `${flyout?.isVisible() ? flyout.getWidth() : 0}px`;
  }

  /**
   * A hidden toolbox takes no room. Core keeps the width it last measured,
   * so in flyout mode pane 3 would start that far past the palette.
   * @override
   */
  getWidth() {
    return this.isVisible_ ? super.getWidth() : 0;
  }

  /**
   * Only the toolbox itself is a drop target. Core's rect runs to the left
   * edge of the screen, which would cover the palette. @override
   */
  getClientRect() {
    if (!this.HtmlDiv || !this.isVisible_) return null;
    const r = this.HtmlDiv.getBoundingClientRect();
    return new Blockly.utils.Rect(r.top, r.bottom, r.left, r.right);
  }

  /**
   * Something new from the palette that the toolbox can't hold (a block,
   * label or button) is thrown away, so the drop does nothing. @override
   */
  wouldDelete(element) {
    const editor = this.getEditor();
    return (
      editor.isNewFromPalette(element) && !editor.canDropOnToolbox(element)
    );
  }

  /**
   * Anything already in the flyout pane goes back where it came from.
   * @override
   */
  shouldPreventMove(element) {
    return (
      !this.getEditor().canDropOnToolbox(element) && !this.wouldDelete(element)
    );
  }

  /** @override */
  onDragOver(element) {
    this.getEditor().showToolboxDropIndicator(element);
  }

  /** @override */
  onDragExit() {
    this.getEditor().hideToolboxDropIndicator();
  }

  /** @override */
  onDrop(element) {
    this.getEditor().dropOnToolbox(element);
  }

  /**
   * Double-clicking a category, or pressing Enter on it, edits its name and
   * colour. Core binds Enter to a focused node's performAction, which
   * categories don't have, so it's free here.
   */
  enableEditing() {
    const edit = (e) => {
      const item = this.getToolboxItems().find((item) =>
        item.getDiv()?.contains(e.target),
      );
      if (!(item instanceof Blockly.ToolboxCategory)) return;
      e.preventDefault();
      e.stopPropagation();
      this.getEditor().editToolboxItem(item, 'edit');
    };
    this.HtmlDiv.addEventListener('dblclick', edit);
    this.HtmlDiv.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.repeat) edit(e);
    });
  }

  /**
   * Lets the author drag category and separator rows to reorder them. A row
   * copy follows the pointer and the drop line shows where it will go. A
   * press that doesn't move is still a click, which selects the row.
   * Letting go over the palette deletes the row, and anywhere else outside
   * the toolbox does nothing.
   */
  enableRowDragging() {
    this.HtmlDiv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const items = this.getToolboxItems();
      const from = items.findIndex((item) => item.getDiv()?.contains(e.target));
      if (from === -1) return;
      const row = items[from].getDiv();
      const rowRect = row.getBoundingClientRect();
      const offset = {x: e.clientX - rowRect.left, y: e.clientY - rowRect.top};
      const editor = this.getEditor();
      let copy = null;
      const isInside = (ev) => {
        const r = this.HtmlDiv.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right;
      };
      // Dropping on the palette deletes, as dropping anything on a flyout
      // does. Its delete area is the one core uses for that.
      const isOverPalette = (ev) =>
        !!this.getFlyout()?.getClientRect()?.contains(ev.clientX, ev.clientY);

      const move = (ev) => {
        if (!copy) {
          const distance = Math.hypot(
            ev.clientX - e.clientX,
            ev.clientY - e.clientY,
          );
          if (distance < Blockly.config.dragRadius) return;
          copy = row.cloneNode(true);
          for (const el of [copy, ...copy.querySelectorAll('[id]')]) {
            el.removeAttribute('id');
          }
          copy.classList.add('spikeRowCopy');
          copy.style.width = `${rowRect.width}px`;
          document.body.append(copy);
          row.classList.add('spikeRowDragging');
        }
        copy.style.left = `${ev.clientX - offset.x}px`;
        copy.style.top = `${ev.clientY - offset.y}px`;
        if (isInside(ev)) {
          editor.showToolboxDropLineAt(editor.toolboxIndexAt(ev.clientY));
        } else {
          editor.hideToolboxDropIndicator();
        }
        copy.classList.toggle('blocklyDraggingDelete', isOverPalette(ev));
      };

      const up = (ev) => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (!copy) return;
        copy.remove();
        row.classList.remove('spikeRowDragging');
        editor.hideToolboxDropIndicator();
        // A drag that ends over the row it started on would also click it.
        const swallow = (c) => c.stopPropagation();
        window.addEventListener('click', swallow, true);
        setTimeout(() => window.removeEventListener('click', swallow, true));
        if (isInside(ev)) {
          editor.moveToolboxItem(from, editor.toolboxIndexAt(ev.clientY));
        } else if (isOverPalette(ev)) {
          editor.editToolboxItem(items[from], 'delete');
        } else {
          editor.reject(
            'Drop it on the toolbox to move it, or on the palette to delete it.',
          );
        }
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }
}

/**
 * Registers the category row class for a toolbox type. Toolbox items are
 * looked up globally by kind, so this affects every toolbox on the page.
 * @param {boolean} continuous Whether to use continuous-toolbox rows.
 */
export function registerCategoryClass(continuous) {
  Blockly.registry.register(
    Blockly.registry.Type.TOOLBOX_ITEM,
    Blockly.ToolboxCategory.registrationName,
    continuous ? ContinuousCategory : Blockly.ToolboxCategory,
    true,
  );
}

Blockly.Css.register(`
  .spikeRowCopy {
    position: fixed;
    z-index: 90;
    pointer-events: none;
    opacity: 0.85;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    background: #ddd;
  }
  .spikeRowDragging {
    opacity: 0.35;
  }
  .blocklyToolboxCategory,
  .blocklyTreeSeparator {
    cursor: grab;
  }
  .spikeToolboxDropLine {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 3px solid #fc3;
    pointer-events: none;
    z-index: 100;
  }
`);

// The continuous toolbox's row styles, from registerContinuousToolbox. That
// function also replaces core's toolbox, flyout and block inflater globally,
// so only the CSS is copied here.
Blockly.Css.register(`
  .spikeContinuous .categoryBubble {
    margin: 0 auto 0.125rem;
    border-radius: 100%;
    border: 1px solid;
    width: 1.25rem;
    height: 1.25rem;
  }
  .spikeContinuous .blocklyToolboxCategory {
    height: initial;
    padding: 3px 0;
  }
  .spikeContinuous .blocklyTreeRowContentContainer {
    display: flex;
    flex-direction: column;
  }
  .spikeContinuous .blocklyToolboxCategoryLabel {
    margin: auto;
    text-align: center;
  }
`);
