/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Non-block items in the flyout pane: buttons, labels and separators, drawn
 * as the flyout draws them, plus the item a palette category drags as.
 */

import * as Blockly from 'blockly';
import {drawCategory} from './chips';

/** Width of a separator's outline, in workspace units. */
const SEPARATOR_WIDTH = 160;

/**
 * Creates a FlyoutButton with its own pointer handling switched off. Its
 * handlers send gestures to the workspace's flyout and run button callbacks,
 * neither of which the editor wants. FlyoutButton has no option for this, so
 * the spike unbinds its private listeners.
 * @param {!Blockly.WorkspaceSvg} workspace The workspace to draw on.
 * @param {!Object} info The button or label JSON.
 * @param {boolean} isLabel Whether it's a label.
 * @returns {!Blockly.FlyoutButton} The button.
 */
export function createInertFlyoutButton(workspace, info, isLabel) {
  const button = new Blockly.FlyoutButton(workspace, workspace, info, isLabel);
  // Unbinding copies leaves the originals for FlyoutButton.dispose, which
  // unbinds them again and fails on an emptied list.
  Blockly.browserEvents.unbind([...button.onMouseDownWrapper]);
  Blockly.browserEvents.unbind([...button.onMouseUpWrapper]);
  button.show();
  return button;
}

/**
 * Something in the flyout pane that isn't a block. It can be dragged,
 * focused, edited and deleted like a block.
 */
export class SurfaceItem {
  /**
   * @param {!Blockly.WorkspaceSvg} workspace The flyout pane's workspace.
   * @param {!Object} info The toolbox JSON for the item. Its kind is
   *     'button', 'label', 'sep', 'category' or 'heading'.
   * @param {!Object} handlers onDrop, onDispose and onEdit callbacks.
   */
  constructor(workspace, info, handlers) {
    this.workspace = workspace;
    this.handlers = handlers;
    this.id = Blockly.utils.idGenerator.getNextUniqueId();
    this.x = 0;
    this.y = 0;
    this.dragging = false;
    this.readOnly = false;

    this.svgGroup = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.G,
      {id: this.id, class: 'spikeSurfaceItem'},
      workspace.getLayerManager().getBlockLayer(),
    );
    this.setInfo(info);

    this.svgGroup.addEventListener('pointerdown', (e) => {
      // As a block does, so the workspace doesn't start its own gesture.
      e.stopPropagation();
      this.onPointerDown(e);
    });
    this.svgGroup.addEventListener('dblclick', () => {
      if (this.isMovable()) this.handlers.onEdit(this);
    });

    // Lets core find this item by its ID when it takes focus, as it finds
    // blocks. WorkspaceSvg.lookUpFocusableNode checks focusable components
    // after its own items. The ID is the SVG group's, which is what it
    // matches.
    workspace.getComponentManager().addComponent({
      component: this,
      weight: 0,
      capabilities: [Blockly.ComponentManager.Capability.FOCUSABLE],
    });
  }

  /**
   * Replaces the item's JSON and redraws it.
   * @param {!Object} info The new JSON.
   */
  setInfo(info) {
    this.info = info;
    this.kind = info.kind.toLowerCase();
    this.button?.dispose();
    this.button = null;
    while (this.svgGroup.firstChild) this.svgGroup.firstChild.remove();
    this.svgGroup.setAttribute(
      'class',
      `spikeSurfaceItem spikeSurface-${this.kind}`,
    );

    if (['button', 'label', 'heading'].includes(this.kind)) {
      // Core's own class, so it looks exactly as it will in the flyout.
      this.button = createInertFlyoutButton(
        this.workspace,
        {...info, kind: this.kind === 'button' ? 'button' : 'label'},
        this.kind !== 'button',
      );
      this.svgGroup.appendChild(this.button.getSvgRoot());
      const rect = this.button.getBoundingRectangle();
      this.width = rect.getWidth();
      this.height = rect.getHeight();
    } else if (this.kind === 'sep') {
      // A separator is only space. The editor outlines it faintly so it can
      // be found and grabbed, and more strongly on hover and focus.
      this.width = SEPARATOR_WIDTH;
      this.height = this.getGap();
      this.outline = Blockly.utils.dom.createSvgElement(
        Blockly.utils.Svg.RECT,
        {class: 'spikeSeparatorOutline', width: this.width, rx: 4},
        this.svgGroup,
      );
      this.updateSeparatorHeight();
    } else {
      // A category on its way to the toolbox pane, drawn like its row.
      ({width: this.width, height: this.height} = drawCategory(
        this.svgGroup,
        info,
        this.workspace,
      ));
    }
    this.updateTransform();
  }

  /** @returns {number} The separator's gap, as core's flyout reads it. */
  getGap() {
    // A separator without a gap collapses the space to nothing in a real
    // flyout (SeparatorFlyoutInflater.gapForItem returns NaN, so no implicit
    // separator is added and the zero-height one wins).
    const gap = parseInt(String(this.info.gap));
    return isNaN(gap) ? 0 : gap;
  }

  /** Keeps the outline grabbable even for a small gap. */
  updateSeparatorHeight() {
    const height = Math.max(this.height, 8);
    this.outline.setAttribute('height', String(height));
    this.outline.setAttribute('y', String((this.height - height) / 2));
  }

  /**
   * Starts a gesture, as a block's pointerdown does.
   * @param {!PointerEvent} e The event.
   */
  onPointerDown(e) {
    const gesture = this.workspace.getGesture(e);
    if (!gesture) return;
    gesture.handleWsStart(e, this.workspace);
    // handleWsStart focuses the workspace, so this comes after it. Core has
    // no gesture hook for custom draggables, so a click would otherwise leave
    // the workspace focused.
    Blockly.getFocusManager().focusNode(this);
  }

  /**
   * Moves the item to workspace coordinates.
   * @param {number} x The x coordinate.
   * @param {number} y The y coordinate.
   */
  moveTo(x, y) {
    this.x = x;
    this.y = y;
    this.updateTransform();
  }

  /**
   * IBoundedElement.
   * @param {number} dx Horizontal offset.
   * @param {number} dy Vertical offset.
   */
  moveBy(dx, dy) {
    this.moveTo(this.x + dx, this.y + dy);
  }

  updateTransform() {
    this.svgGroup.setAttribute('transform', `translate(${this.x},${this.y})`);
  }

  getBoundingRectangle() {
    return new Blockly.utils.Rect(
      this.y,
      this.y + this.height,
      this.x,
      this.x + this.width,
    );
  }

  getRelativeToSurfaceXY() {
    return new Blockly.utils.Coordinate(this.x, this.y);
  }

  getSvgRoot() {
    return this.svgGroup;
  }

  getFocusableElement() {
    return this.svgGroup;
  }

  getFocusableTree() {
    return this.workspace;
  }

  onNodeFocus() {
    this.select();
  }

  onNodeBlur() {
    this.unselect();
  }

  canBeFocused() {
    return true;
  }

  select() {
    this.svgGroup.classList.add('blocklySelected');
  }

  unselect() {
    this.svgGroup.classList.remove('blocklySelected');
  }

  /** Headings, and items from a dynamic category, can't be moved. */
  isMovable() {
    return this.kind !== 'heading' && !this.readOnly;
  }

  startDrag() {
    this.handlers.onDragStart(this);
    this.dragging = true;
    this.startXY = this.getRelativeToSurfaceXY();
    this.workspace.getLayerManager().moveToDragLayer(this);
    return this;
  }

  drag(newLoc, e) {
    this.moveTo(newLoc.x, newLoc.y);
    this.handlers.onDragMove(this, e);
  }

  endDrag(_e, disposition) {
    this.dragging = false;
    // Dropping on the toolbox pane can reload the flyout pane, which disposes
    // of this item mid-drop.
    if (this.disposed || disposition === Blockly.DragDisposition.DELETE) {
      this.handlers.onDragEnd(this, disposition);
      return;
    }
    this.workspace
      .getLayerManager()
      .moveOffDragLayer(this, Blockly.layers.BLOCK);
    if (
      disposition === Blockly.DragDisposition.COMMIT &&
      this.handlers.takeRejection(this)
    ) {
      // Dropped on a dynamic category: go back, or away if it's new.
      this.handlers.onDragEnd(this, Blockly.DragDisposition.REVERT);
      if (this.fromPalette) {
        setTimeout(() => this.dispose());
      } else {
        this.revertDrag();
      }
      return;
    }
    this.handlers.onDragEnd(this, disposition);
    this.handlers.onDrop(this);
  }

  revertDrag() {
    this.moveTo(this.startXY.x, this.startXY.y);
  }

  isDeletable() {
    return this.isMovable();
  }

  setDeleteStyle(wouldDelete) {
    this.svgGroup.classList.toggle('blocklyDraggingDelete', wouldDelete);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.workspace.getComponentManager().removeComponent(this.id);
    this.button?.dispose();
    this.svgGroup.remove();
    this.handlers.onDispose(this);
  }

  /** @returns {!Object} The toolbox JSON this item saves as. */
  toJson() {
    const {kind: _kind, ...rest} = this.info;
    return {kind: this.kind, ...rest};
  }
}

Blockly.Css.register(`
  /* Dark enough to see on the flyout background. */
  .spikeSeparatorOutline {
    fill: transparent;
    stroke: #888;
    stroke-dasharray: 4 3;
  }
  .spikeSurface-sep:hover .spikeSeparatorOutline,
  .spikeSurface-sep.blocklySelected .spikeSeparatorOutline {
    stroke: #444;
    fill: rgba(0, 0, 0, 0.06);
  }
  .spikeSurfaceItem.blocklySelected .blocklyFlyoutButton,
  .spikeSurfaceItem.blocklySelected .blocklyFlyoutLabel {
    outline: 2px solid #fc3;
  }
  .spikeSurfaceItem {
    cursor: grab;
  }
  .spikeSurface-heading {
    cursor: default;
  }
  /* Buttons, labels and separators have no paths for core's styles, so
     they fade as well as taking the delete cursor. */
  .spikeSurfaceItem.blocklyDraggingDelete,
  .spikeSurfaceItem.spikeWontLand {
    opacity: 0.5;
  }
  .spikeSurfaceItem.blocklyDraggingDelete,
  .spikeSurfaceItem.blocklyDraggingDelete * {
    cursor: url("<<<PATH>>>/handdelete.cur"), auto;
  }
`);
