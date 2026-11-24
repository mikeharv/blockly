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
import {setWontLand} from './flyout_pane';
import {EditorHeader} from './header';

/** Material's "edit" icon. */
const PENCIL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

/** Material's "delete" icon. */
const DELETE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

/** Material's "drag indicator" icon. */
const GRIP_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';

/**
 * @param {string} className The icon's own class.
 * @param {string} title Its tooltip.
 * @param {string} svg Its SVG markup.
 * @param {function()=} onClick What clicking it does, if anything.
 * @returns {!HTMLElement} An icon for a toolbox row.
 */
function createIcon(className, title, svg, onClick) {
  const icon = document.createElement('span');
  icon.className = `spikeRowIcon ${className}`;
  icon.title = title;
  icon.innerHTML = svg;
  if (onClick) {
    icon.classList.add('spikeRowButton');
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return icon;
}

/** The toolbox being edited. Its flyout is the palette. */
export class EditorToolbox extends Blockly.Toolbox {
  /** @override */
  init() {
    // Before the palette is positioned, since it starts below the header.
    const editor = this.getEditor();
    this.header = new EditorHeader(this.workspace_, editor.categories, (on) =>
      editor.setCategories(on),
    );
    super.init();
    // Core puts the toolbox first in the editor, which makes it the first
    // tab stop. After the palette, it follows the layout: header, palette,
    // toolbox, flyout pane.
    this.workspace_.getParentSvg().before(this.HtmlDiv);
    const flyout = this.getFlyout();
    editor.categoryChipWidth = undefined;
    flyout.show(editor.paletteContents());
    if (editor.mode !== 'flyout') {
      // Draw the categories again, all as wide as the widest.
      const widths = flyout
        .getContents()
        .filter((item) => item.getElement().item?.kind === 'category')
        .map((item) => item.getElement().chipWidth);
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

  /** @returns {number} The header's height. */
  getHeaderHeight() {
    return this.header?.height ?? 0;
  }

  /** @override */
  dispose() {
    this.header?.dispose();
    super.dispose();
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

  /**
   * Puts the toolbox to the right of the palette, below the header, and
   * sizes the header's sections to match. @override
   */
  position() {
    super.position();
    if (!this.HtmlDiv) return;
    const flyout = this.getFlyout();
    const left = flyout?.isVisible() ? flyout.getWidth() : 0;
    const headerHeight = this.getHeaderHeight();
    this.HtmlDiv.style.left = `${left}px`;
    this.HtmlDiv.style.top = `${headerHeight}px`;
    this.HtmlDiv.style.height = `calc(100% - ${headerHeight}px)`;
    this.header?.layout(left, this.workspace_.getCachedParentSvgSize().width);
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

  /**
   * Something that would go back where it came from shows core's
   * would-delete look, as something this deletes does. @override
   */
  onDragOver(element) {
    this.getEditor().showToolboxDropIndicator(element);
    setWontLand(element, this.shouldPreventMove(element));
  }

  /** @override */
  onDragExit(element) {
    this.getEditor().hideToolboxDropIndicator();
    setWontLand(element, false);
  }

  /** @override */
  onDrop(element) {
    setWontLand(element, false);
    this.getEditor().dropOnToolbox(element);
  }

  /**
   * Adds the editing icons to each row, before the toolbox measures its
   * width. @override
   */
  renderContents_(contents) {
    super.renderContents_(contents);
    for (const item of this.getToolboxItems()) {
      if (item instanceof Blockly.ToolboxCategory) {
        // Core's row element, which it doesn't expose.
        this.addRowIcons(item, item.rowDiv_, true);
      } else if (item instanceof Blockly.ToolboxSeparator) {
        const row = item.getDiv();
        row?.classList.add('spikeEditableSeparator');
        this.addRowIcons(item, row, false);
      }
    }
  }

  /**
   * Shows, on a toolbox row, what a toolbox normally can't do: rename a
   * category (the pencil, as double-click or Enter), delete the row, and
   * reorder it (the grip, a cue only: the whole row drags). Separators get
   * an empty slot where the pencil goes, so every grip and delete button
   * lines up. The icons are hidden from screen readers, since Enter edits
   * the focused row; deleting and reordering by keyboard are still to do.
   * @param {!Blockly.IToolboxItem} item The category or separator.
   * @param {?HTMLElement} row The element to add them to.
   * @param {boolean} renamable Whether it's a category.
   */
  addRowIcons(item, row, renamable) {
    if (!row) return;
    row.classList.add('spikeEditableRow');
    const editor = this.getEditor();
    const icons = document.createElement('div');
    icons.className = 'spikeRowIcons';
    const pencil = renamable
      ? createIcon('spikeRowEdit', 'Rename and recolour', PENCIL_ICON, () =>
          editor.editToolboxItem(item, 'edit'),
        )
      : createIcon('spikeRowPlaceholder', '', PENCIL_ICON);
    icons.append(
      pencil,
      createIcon('spikeRowDelete', 'Delete', DELETE_ICON, () =>
        editor.editToolboxItem(item, 'delete'),
      ),
      createIcon('spikeRowGrip', 'Drag to reorder', GRIP_ICON),
    );
    row.append(icons);
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
  /* Room on the right for three 16px icons, which the toolbox's width
     includes. Qualified to beat core's and the continuous rows' padding. */
  .spikeEditableRow {
    position: relative;
  }
  .blocklyToolboxCategory.spikeEditableRow {
    padding-right: 60px;
  }
  .spikeRowIcons {
    position: absolute;
    top: 50%;
    right: 4px;
    transform: translateY(-50%);
    display: flex;
    gap: 2px;
  }
  .spikeRowIcon {
    display: flex;
    padding: 2px;
    border-radius: 3px;
    opacity: 0.6;
  }
  .spikeRowIcon svg {
    width: 12px;
    height: 12px;
    fill: currentColor;
  }
  .spikeRowGrip {
    cursor: grab;
  }
  .spikeRowButton {
    cursor: pointer;
  }
  .spikeRowButton:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }
  .spikeRowDelete:hover {
    color: #c62828;
  }
  .spikeRowPlaceholder {
    visibility: hidden;
  }
  /* A separator between categories is a row as tall as its icons, with its
     line drawn across the middle up to them, instead of core's 1px border
     with nothing to grab. Darker than core's line, so it reads as an item. */
  .blocklyTreeSeparator.spikeEditableSeparator {
    height: 20px;
    margin: 2px 0;
    border-bottom: none;
  }
  .spikeEditableSeparator::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 8px;
    right: 60px;
    border-top: 1px solid #999;
  }
  /* Continuous rows keep the icons in a row too, like separators and
     category-mode rows. The bubble and name centre in the space left of
     them. Qualified to beat the continuous rows' own padding. */
  .spikeContinuous .blocklyToolboxCategory.spikeEditableRow {
    padding-left: 4px;
    padding-right: 60px;
  }
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
