/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pane 1: the palette. It's the toolbox's own flyout, kept open and moved to
 * the far left, so core already treats it as the workspace's flyout: blocks
 * drag out of it natively, and focus lookups find its items.
 */

import * as Blockly from 'blockly';
import {drawCategory, drawSeparatorChip} from './chips';
import {createInertFlyoutButton} from './surface_item';

/** The flyout item kind for palette entries that aren't blocks. */
export const PALETTE_ITEM = 'palette_item';

/** Space between a tiled entry and its tile's edge. */
const TILE_PADDING = 4;

/** A vertical flyout that sits at the far left, left of the toolbox. */
export class PaletteFlyout extends Blockly.VerticalFlyout {
  autoClose = false;

  /** @override */
  getX() {
    return 0;
  }

  /** Lets the keyboard reach the palette's own entries. @override */
  show(contents) {
    super.show(contents);
    const navigator = this.getWorkspace().getNavigator();
    if (
      !navigator.rules.some((r) => r instanceof PaletteEntryNavigationPolicy)
    ) {
      navigator.rules.push(new PaletteEntryNavigationPolicy());
    }
  }

  /** @returns {?Object} The editor's header, above the palette. */
  getHeader() {
    return this.targetWorkspace.getToolbox()?.header ?? null;
  }

  /** Below the header. @override */
  getY() {
    return this.getHeader()?.height ?? 0;
  }

  /**
   * Core fits the width to the widest item, as it does for the student's
   * flyout, so a block is as wide here as in pane 3. But the palette is
   * never wider than pane 3, so it takes at most half the room the toolbox
   * leaves. Wider items are cut off on the right, since a vertical flyout
   * doesn't scroll sideways.
   * @override
   */
  reflowInternal_() {
    this.reflowing = true;
    super.reflowInternal_();
    this.naturalWidth = this.width_;
    const width = Math.min(this.naturalWidth, this.getMaxWidth());
    if (width !== this.width_) {
      this.width_ = width;
      this.position();
    }
    this.reflowing = false;
    // Moves the toolbox and pane 3 to match.
    this.targetWorkspace.resize();
    this.targetWorkspace.recordDragTargets();
  }

  /**
   * Core sizes a flyout only when its contents change. This also sizes the
   * palette again when the window resizes, which moves the cap.
   * @override
   */
  position() {
    super.position();
    this.fitBelowHeader();
    if (this.reflowing || this.naturalWidth === undefined) return;
    if (Math.min(this.naturalWidth, this.getMaxWidth()) !== this.width_) {
      this.reflow();
    }
  }

  /**
   * Core sizes a vertical flyout to the workspace's view, which also starts
   * below the header but is offset from the toolbox, so this sets the
   * palette's height itself: from the header to the bottom.
   */
  fitBelowHeader() {
    if (!this.isVisible()) return;
    const height =
      this.targetWorkspace.getCachedParentSvgSize().height - this.getY();
    if (this.height_ === height) return;
    this.height_ = height;
    // Private in core; draws the background at the new height.
    this.setBackgroundPath(
      this.getWidth() - this.CORNER_RADIUS,
      height - 2 * this.CORNER_RADIUS,
    );
    this.positionAt_(this.getWidth(), height, this.getX(), this.getY());
  }

  /**
   * @returns {number} Half the room left after the toolbox, but always wide
   *     enough for the header's Toolbox Type toggle.
   */
  getMaxWidth() {
    const svgWidth = this.targetWorkspace.getCachedParentSvgSize().width;
    const toolboxWidth = this.targetWorkspace.getToolbox()?.getWidth() ?? 0;
    return Math.max(
      Math.floor((svgWidth - toolboxWidth) / 2),
      this.getHeader()?.minPaletteWidth ?? 0,
    );
  }
}

/**
 * A palette entry for something other than a block: a category, separator,
 * button or label, drawn like what it adds. Dragging one creates the real
 * item on the flyout pane, as dragging a flyout block creates a block.
 * Clicking one adds it straight away.
 */
class PaletteItem {
  /**
   * @param {!Blockly.IFlyout} flyout The palette.
   * @param {!object} item The toolbox JSON the entry adds.
   */
  constructor(flyout, item) {
    this.flyout = flyout;
    this.workspace = flyout.getWorkspace();
    this.item = item;
    this.id = Blockly.utils.idGenerator.getNextUniqueId();
    this.position = new Blockly.utils.Coordinate(0, 0);

    this.svgGroup = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.G,
      {id: this.id, class: 'spikePaletteItem'},
      this.workspace.getCanvas(),
    );
    this.size = this.drawTiled(item.kind.toLowerCase(), item);

    this.svgGroup.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPointerDown(e);
    });
    // A click (no drag) adds the item without dragging. When the pointer is
    // released somewhere else after a drag, the click goes to an ancestor.
    this.svgGroup.addEventListener('click', () => {
      this.flyout.targetWorkspace.spikeEditor.insertFromPalette(this.item);
    });
  }

  /**
   * Draws the entry on a dashed tile, so it reads as something to drag or
   * click to add, rather than part of the palette. For a category, that
   * also sets it apart from a toolbox row, which would select it.
   * @param {string} kind The item's kind.
   * @param {!object} item Its toolbox JSON.
   * @returns {{width: number, height: number}} The tile's size.
   */
  drawTiled(kind, item) {
    const tile = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT,
      {class: 'spikePaletteTile', rx: 4},
      this.svgGroup,
    );
    const content = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.G,
      {transform: `translate(${TILE_PADDING},${TILE_PADDING})`},
      this.svgGroup,
    );
    let size;
    if (kind === 'category') {
      size = drawCategory(content, item, this.workspace);
      // The toolbox makes every chip as wide as the widest, untiled.
      this.chipWidth = size.width;
    } else if (kind === 'sep') {
      size = drawSeparatorChip(content);
    } else {
      this.button = createInertFlyoutButton(
        this.workspace,
        item,
        kind === 'label',
      );
      content.appendChild(this.button.getSvgRoot());
      const rect = this.button.getBoundingRectangle();
      size = {width: rect.getWidth(), height: rect.getHeight()};
    }
    const width = size.width + 2 * TILE_PADDING;
    const height = size.height + 2 * TILE_PADDING;
    tile.setAttribute('width', String(width));
    tile.setAttribute('height', String(height));
    return {width, height};
  }

  onPointerDown(e) {
    const gesture = this.flyout.targetWorkspace.getGesture(e);
    if (!gesture) return;
    gesture.handleFlyoutStart(e, this.flyout);
    // handleFlyoutStart focuses the flyout's workspace, so this comes after.
    Blockly.getFocusManager().focusNode(this);
  }

  getBoundingRectangle() {
    return new Blockly.utils.Rect(
      this.position.y,
      this.position.y + this.size.height,
      this.position.x,
      this.position.x + this.size.width,
    );
  }

  moveBy(dx, dy) {
    this.position = new Blockly.utils.Coordinate(
      this.position.x + dx,
      this.position.y + dy,
    );
    this.svgGroup.setAttribute(
      'transform',
      `translate(${this.position.x},${this.position.y})`,
    );
  }

  getSvgRoot() {
    return this.svgGroup;
  }

  getRelativeToSurfaceXY() {
    return this.position;
  }

  getFocusableElement() {
    return this.svgGroup;
  }

  getFocusableTree() {
    return this.workspace;
  }

  onNodeFocus() {}

  onNodeBlur() {}

  canBeFocused() {
    return true;
  }

  /** Enter or Space adds the item, as a click does. */
  performAction() {
    this.flyout.targetWorkspace.spikeEditor.insertFromPalette(this.item);
  }

  select() {}

  unselect() {}

  isMovable() {
    return true;
  }

  /**
   * Creates the real item on the flyout pane, under this entry, and drags
   * that instead.
   * @param {!PointerEvent=} e The event.
   * @returns {!object} The item being dragged.
   */
  startDrag(e) {
    const target = this.flyout.targetWorkspace;
    const item = target.spikeEditor.createDragItem(this.item);
    const screenXY = Blockly.utils.svgMath.wsToScreenCoordinates(
      this.workspace,
      this.getRelativeToSurfaceXY(),
    );
    const xy = Blockly.utils.svgMath.screenToWsCoordinates(target, screenXY);
    item.moveTo(xy.x, xy.y);
    return item.startDrag(e);
  }

  drag() {}

  endDrag() {}

  revertDrag() {}

  dispose() {
    this.button?.dispose();
    this.svgGroup.remove();
  }
}

/**
 * Lets the keyboard reach palette entries, as core's policy
 * for flyout buttons does for buttons. Core's flyout navigator works out
 * their order from the flyout's contents.
 */
class PaletteEntryNavigationPolicy {
  getFirstChild() {
    return null;
  }

  getParent(current) {
    return current.workspace;
  }

  getNextSibling() {
    return null;
  }

  getPreviousSibling() {
    return null;
  }

  getRowId(current) {
    return current.id;
  }

  isNavigable(current) {
    return current.canBeFocused();
  }

  isApplicable(current) {
    return current instanceof PaletteItem;
  }
}

/** Creates PaletteItems from `palette_item` entries in the palette. */
class PaletteItemInflater {
  load(state, flyout) {
    return new Blockly.FlyoutItem(
      new PaletteItem(flyout, state.item),
      PALETTE_ITEM,
    );
  }

  gapForItem(_state, defaultGap) {
    return defaultGap / 2;
  }

  disposeItem(item) {
    item.getElement().dispose();
  }

  getType() {
    return PALETTE_ITEM;
  }
}

Blockly.registry.register(
  Blockly.registry.Type.FLYOUT_INFLATER,
  PALETTE_ITEM,
  PaletteItemInflater,
);

Blockly.Css.register(`
  .spikePaletteItem {
    cursor: grab;
  }
  .spikePaletteTile {
    fill: rgba(255, 255, 255, 0.5);
    stroke: #999;
    stroke-dasharray: 4 3;
  }
  .spikePaletteItem:hover .spikePaletteTile {
    fill: #fff;
    stroke: #555;
  }
  /* Beats the renderer's label font, which includes its own two classes. */
  .blocklyFlyout .blocklyFlyoutLabel.spikePaletteHeading .blocklyFlyoutLabelText {
    font-size: 11px;
    opacity: 0.6;
  }
`);
