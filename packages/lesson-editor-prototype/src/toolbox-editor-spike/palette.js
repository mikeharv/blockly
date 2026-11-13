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

/** The palette's widest, in pixels. */
const MAX_WIDTH = 300;

/** A vertical flyout that sits at the far left, left of the toolbox. */
export class PaletteFlyout extends Blockly.VerticalFlyout {
  autoClose = false;

  /** @override */
  getX() {
    return 0;
  }

  /**
   * Caps core's width, which fits the widest item. Wider items are cut off
   * on the right, since a vertical flyout doesn't scroll sideways.
   * @override
   */
  reflowInternal_() {
    super.reflowInternal_();
    if (this.width_ <= MAX_WIDTH) return;
    this.width_ = MAX_WIDTH;
    this.position();
    this.targetWorkspace.resizeContents();
    this.targetWorkspace.recordDragTargets();
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
    const kind = item.kind.toLowerCase();
    if (kind === 'category') {
      this.size = drawCategory(this.svgGroup, item, this.workspace);
    } else {
      this.size = this.drawTiled(kind, item);
    }

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
   * Draws a separator, label or button on a dashed tile, so it reads as
   * something to drag rather than part of the palette. Category chips
   * already look like cards.
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
    if (kind === 'sep') {
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
