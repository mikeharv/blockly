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
const MAX_WIDTH = 320;

/** The flyout item kind for the switch between categories and a flyout. */
export const PALETTE_TOGGLE = 'palette_toggle';

/** Matches Flyout.CORNER_RADIUS, which the flyout uses as its margin. */
const MARGIN = 8;

/** A vertical flyout that sits at the far left, left of the toolbox. */
export class PaletteFlyout extends Blockly.VerticalFlyout {
  autoClose = false;

  /** @override */
  getX() {
    return 0;
  }

  /** Keeps the toggle at the top after showing new contents. @override */
  show(contents) {
    super.show(contents);
    const navigator = this.getWorkspace().getNavigator();
    if (
      !navigator.rules.some((r) => r instanceof PaletteEntryNavigationPolicy)
    ) {
      navigator.rules.push(new PaletteEntryNavigationPolicy());
    }
    this.getToggle()?.raise();
    this.pinToggle();
  }

  /** Keeps the toggle at the top as the palette scrolls. @override */
  setMetrics_(xyRatio) {
    super.setMetrics_(xyRatio);
    this.pinToggle();
  }

  /** @returns {?PaletteToggle} The toggle, if the palette has one. */
  getToggle() {
    return (
      this.getContents()
        .map((item) => item.getElement())
        .find((element) => element instanceof PaletteToggle) ?? null
    );
  }

  /** Draws the toggle at the top of the palette's visible area. */
  pinToggle() {
    const top = this.getWorkspace()
      .getMetricsManager()
      .getViewMetrics(true).top;
    this.getToggle()?.pin(top, this.getWidth());
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
 * The switch between a category toolbox and a flyout one, as the palette's
 * first item. It's two of core's flyout buttons side by side, the chosen
 * one drawn as a normal button and the other as an outline. It stays at the
 * top of the palette however far it scrolls, over a strip of the palette's
 * background, so the items scroll under it.
 */
class PaletteToggle {
  /**
   * @param {!Blockly.IFlyout} flyout The palette.
   * @param {boolean} categories Whether the toolbox has categories.
   */
  constructor(flyout, categories) {
    this.flyout = flyout;
    this.workspace = flyout.getWorkspace();
    this.categories = categories;
    this.id = Blockly.utils.idGenerator.getNextUniqueId();
    this.position = new Blockly.utils.Coordinate(0, 0);
    this.top = 0;

    this.svgGroup = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.G,
      {class: 'spikePaletteToggle'},
      this.workspace.getCanvas(),
    );
    // Covers whatever has scrolled up under the toggle. The palette's
    // background can be translucent, so it goes over an opaque base, and
    // takes the theme's colours as the flyout's own background does.
    this.strips = ['spikePaletteToggleBase', 'blocklyFlyoutBackground'].map(
      (className) =>
        Blockly.utils.dom.createSvgElement(
          Blockly.utils.Svg.RECT,
          {class: className},
          this.svgGroup,
        ),
    );
    const themeManager = this.workspace.getThemeManager();
    themeManager.subscribe(this.strips[1], 'flyoutBackgroundColour', 'fill');
    themeManager.subscribe(this.strips[1], 'flyoutOpacity', 'fill-opacity');

    // A flyout label naming the choice, left of the buttons.
    this.label = createInertFlyoutButton(
      this.workspace,
      {kind: 'label', text: 'Toolbox Type'},
      true,
    );
    const labelRoot = this.label.getSvgRoot();
    this.svgGroup.appendChild(labelRoot);
    Blockly.utils.aria.setRole(labelRoot, Blockly.utils.aria.Role.NONE);
    Blockly.utils.aria.clearState(labelRoot, Blockly.utils.aria.State.LABEL);
    const labelRect = this.label.getBoundingRectangle();
    const controlX = labelRect.getWidth() + MARGIN;

    // What takes focus: the two buttons and core's focus ring around them,
    // without the strip.
    this.control = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.G,
      {id: this.id, transform: `translate(${controlX},0)`},
      this.svgGroup,
    );
    const {aria} = Blockly.utils;
    aria.setRole(this.control, aria.Role.CHECKBOX);
    aria.setState(this.control, aria.State.LABEL, 'Categories');
    aria.setState(this.control, aria.State.CHECKED, categories);
    const focusRing = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT,
      {class: 'blocklyFocusRing', rx: 4},
      this.control,
    );

    this.buttons = [];
    let x = 0;
    for (const [text, value] of [
      ['Categories', true],
      ['Flyout', false],
    ]) {
      const button = createInertFlyoutButton(
        this.workspace,
        {kind: 'button', text},
        false,
      );
      const root = button.getSvgRoot();
      this.control.appendChild(root);
      root.setAttribute('transform', `translate(${x},0)`);
      root.classList.toggle('spikeToggleOff', value !== categories);
      aria.setRole(root, aria.Role.NONE);
      aria.clearState(root, aria.State.LABEL);
      root.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        Blockly.getFocusManager().focusNode(this);
      });
      root.addEventListener('click', () => this.choose(value));
      const rect = button.getBoundingRectangle();
      x += rect.getWidth() + MARGIN / 2;
      this.height = rect.getHeight();
      this.buttons.push(button);
    }
    this.size = {width: controlX + x - MARGIN / 2, height: this.height};
    labelRoot.setAttribute(
      'transform',
      `translate(0,${(this.height - labelRect.getHeight()) / 2})`,
    );
    const ringPadding = 3;
    focusRing.setAttribute('x', String(-ringPadding));
    focusRing.setAttribute('y', String(-ringPadding));
    focusRing.setAttribute('width', String(x - MARGIN / 2 + 2 * ringPadding));
    focusRing.setAttribute(
      'height',
      String(this.size.height + 2 * ringPadding),
    );
  }

  /**
   * Switches the toolbox between categories and a flyout.
   * @param {boolean} categories Whether it should have categories.
   */
  choose(categories) {
    if (categories === this.categories) return;
    this.flyout.targetWorkspace.spikeEditor.setCategories(categories);
  }

  /** Enter or Space switches to the other choice. */
  performAction() {
    this.choose(!this.categories);
  }

  /** Draws the toggle over the items after it. */
  raise() {
    this.svgGroup.parentNode.appendChild(this.svgGroup);
  }

  /**
   * Draws the toggle at the top of the visible area.
   * @param {number} top The visible area's top, in workspace units.
   * @param {number} width The palette's width.
   */
  pin(top, width) {
    this.top = Math.max(0, top);
    this.svgGroup.setAttribute(
      'transform',
      `translate(${this.position.x},${this.position.y + this.top})`,
    );
    for (const strip of this.strips) {
      strip.setAttribute('x', String(-this.position.x));
      strip.setAttribute('y', String(-this.position.y));
      strip.setAttribute('width', String(width));
      strip.setAttribute(
        'height',
        String(this.position.y + this.height + MARGIN),
      );
    }
  }

  getBoundingRectangle() {
    const y = this.position.y + this.top;
    return new Blockly.utils.Rect(
      y,
      y + this.size.height,
      this.position.x,
      this.position.x + this.size.width,
    );
  }

  moveBy(dx, dy) {
    this.position = new Blockly.utils.Coordinate(
      this.position.x + dx,
      this.position.y + dy,
    );
    this.pin(this.top, MAX_WIDTH);
  }

  getSvgRoot() {
    return this.svgGroup;
  }

  getRelativeToSurfaceXY() {
    return this.position;
  }

  getFocusableElement() {
    return this.control;
  }

  getFocusableTree() {
    return this.workspace;
  }

  onNodeFocus() {}

  onNodeBlur() {}

  canBeFocused() {
    return true;
  }

  dispose() {
    this.label.dispose();
    for (const button of this.buttons) button.dispose();
    this.svgGroup.remove();
  }
}

/** Creates the toggle from a `palette_toggle` entry. */
class PaletteToggleInflater {
  load(state, flyout) {
    return new Blockly.FlyoutItem(
      new PaletteToggle(flyout, state.categories),
      PALETTE_TOGGLE,
    );
  }

  gapForItem(_state, defaultGap) {
    return defaultGap;
  }

  disposeItem(item) {
    item.getElement().dispose();
  }

  getType() {
    return PALETTE_TOGGLE;
  }
}

Blockly.registry.register(
  Blockly.registry.Type.FLYOUT_INFLATER,
  PALETTE_TOGGLE,
  PaletteToggleInflater,
);

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
 * Lets the keyboard reach palette entries and the toggle, as core's policy
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
    return current instanceof PaletteItem || current instanceof PaletteToggle;
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
  .spikePaletteToggleBase {
    fill: #fff;
  }
  /* The choice that isn't selected, drawn as an outlined button. */
  .spikeToggleOff .blocklyFlyoutButtonBackground {
    fill: transparent;
    stroke: #888;
  }
  /* Beats the renderer's text colour, which includes its own two classes. */
  .blocklyFlyout .spikePaletteToggle .spikeToggleOff .blocklyText {
    fill: #575e75;
  }
  .spikeToggleOff .blocklyFlyoutButtonShadow {
    display: none;
  }
  .spikePaletteToggle .blocklyFocusRing {
    fill: none;
  }
  .spikePaletteToggle :focus {
    outline: none;
  }
  .spikePaletteToggle .blocklyFlyoutButton {
    cursor: pointer;
  }
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
