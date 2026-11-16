/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pane 3: a normal workspace that holds one flyout's contents and keeps them
 * laid out exactly as a vertical flyout would.
 */

import * as Blockly from 'blockly';
import {ContinuousMetrics} from '@blockly/continuous-toolbox';
import {applyEditorDragStrategy, isNewFromPalette} from './drag_strategy';
import {SurfaceItem} from './surface_item';

/** Matches Flyout.CORNER_RADIUS, which the flyout uses as its margin. */
const MARGIN = 8;
/** Shown when something is dropped into a dynamic category. */
const READ_ONLY_MESSAGE =
  'Dynamic categories fill themselves when the lesson runs.';

/** Matches Flyout.GAP_Y. */
const GAP_Y = MARGIN * 3;

/**
 * Pane 3's metrics. A real flyout can't scroll above its contents, so
 * neither can pane 3: its scroll area starts at the top of the canvas,
 * where the layout starts, leaving the margin above the first item to drop
 * into. Below the contents, core's padding stays, so continuous mode can
 * scroll its last section to the top.
 */
export class FlyoutPaneMetrics extends ContinuousMetrics {
  /** @returns {number} The preview header's height, above pane 3. */
  getHeaderHeight() {
    return this.workspace_.getToolbox()?.getHeaderHeight?.() ?? 0;
  }

  /** Pane 3 starts below the preview header. @override */
  getAbsoluteMetrics() {
    const metrics = super.getAbsoluteMetrics();
    return {...metrics, top: metrics.top + this.getHeaderHeight()};
  }

  /** @override */
  getViewMetrics(getWorkspaceCoordinates) {
    const metrics = super.getViewMetrics(getWorkspaceCoordinates);
    const scale = getWorkspaceCoordinates ? this.workspace_.scale : 1;
    return {
      ...metrics,
      height: metrics.height - this.getHeaderHeight() / scale,
    };
  }

  /** @override */
  getPaddedContent_(viewMetrics, contentMetrics) {
    const padded = super.getPaddedContent_(viewMetrics, contentMetrics);
    return {
      ...padded,
      top: 0,
      bottom: Math.max(padded.bottom, viewMetrics.height),
    };
  }
}

/**
 * Shows, or stops showing, that a dragged item won't land where it is, the
 * way core shows a drag that would delete. Core's own class can't be used:
 * the dragger resets it from the drop target on every move.
 * @param {!Blockly.IDraggable} item The dragged item.
 * @param {boolean} on Whether it won't land.
 */
export function setWontLand(item, on) {
  item.getSvgRoot?.()?.classList.toggle('spikeWontLand', on);
}

/** Holds and lays out the contents shown in pane 3. */
export class FlyoutPane {
  /**
   * @param {!Blockly.WorkspaceSvg} workspace The pane's workspace.
   * @param {{onEdit: function(!SurfaceItem), onReject: function(string)}}
   *     handlers Called to edit an item, and when a drop is refused.
   */
  constructor(workspace, handlers) {
    this.workspace = workspace;
    this.handlers = handlers;
    /** @type {!Set<!SurfaceItem>} */
    this.surfaceItems = new Set();
    /** Tags given to items at load. See load. */
    this.tags = new WeakMap();
    /** True while showing a dynamic category, which can't be edited. */
    this.readOnly = false;
    this.layoutQueued = false;
    this.inLayout = false;

    workspace.addChangeListener((e) => this.onChange(e));
    /**
     * The drop preview while something is dragged over the pane: the dragged
     * item and the index it would land at.
     */
    this.preview = null;

    // Core's lookup only knows blocks, comments and the workspace's own
    // flyout items. Without this, focusing a surface item by DOM focus falls
    // back to the workspace, and it can't be selected or dragged.
    const lookUp = workspace.lookUpFocusableNode.bind(workspace);
    workspace.lookUpFocusableNode = (id) =>
      [...this.surfaceItems].find((item) => item.id === id) ?? lookUp(id);
  }

  /**
   * @param {!Blockly.BlockSvg} block A block.
   * @returns {boolean} Whether it was created by the drag in progress, which
   *     means it came from the palette.
   */
  isNewFromPalette(block) {
    return isNewFromPalette(block);
  }

  /**
   * Lays the pane out again after anything that could change it.
   * @param {!Blockly.Events.Abstract} e The event.
   */
  onChange(e) {
    if (
      this.inLayout ||
      (e.isUiEvent && e.type !== Blockly.Events.BLOCK_DRAG)
    ) {
      return;
    }
    if (e.type === Blockly.Events.BLOCK_CREATE) {
      // Pasted, duplicated and undeleted blocks get the editor's strategy.
      const block = this.workspace.getBlockById(e.blockId);
      if (block) applyEditorDragStrategy(block);
    }
    if (e.type === Blockly.Events.BLOCK_DRAG) {
      if (e.isStart) return;
      const block = this.workspace.getBlockById(e.blockId);
      if (block && !block.getParent() && this.isInReadOnlySection(block)) {
        block.dispose(false);
        this.handlers.onReject(READ_ONLY_MESSAGE);
      }
    }
    this.queueLayout();
  }

  /**
   * @param {!Blockly.BlockSvg|!SurfaceItem} item An item in the pane.
   * @returns {boolean} Whether it sits in a dynamic category's contents.
   */
  isInReadOnlySection(item) {
    if (this.readOnlyItems?.has(item)) return false;
    const headings = [...this.surfaceItems].filter(
      (other) => other.kind === 'heading',
    );
    if (!headings.length) return this.readOnly;
    const top = item.getBoundingRectangle().top;
    const above = headings
      .filter((heading) => heading.y <= top)
      .sort((a, b) => b.y - a.y)[0];
    return !!above?.readOnly;
  }

  queueLayout() {
    if (this.layoutQueued) return;
    this.layoutQueued = true;
    Blockly.renderManagement.finishQueuedRenders().then(() => {
      this.layoutQueued = false;
      this.layout();
    });
  }

  /** @returns {!Object} Handlers for the pane's surface items. */
  itemHandlers() {
    return {
      onDrop: (item) => this.onSurfaceDrop(item),
      onDragStart: (item) => this.onDragStart(item),
      onDragMove: (item, e) => this.onDragMove(item, e, false),
      onDragEnd: (item, disposition) => this.onDragEnd(item, disposition),
      takeRejection: (item) => this.takeRejection(item),
      onEdit: (item) => this.handlers.onEdit(item),
      onDispose: (item) => {
        this.surfaceItems.delete(item);
        this.queueLayout();
      },
    };
  }

  /**
   * Adds a non-block item to the pane.
   * @param {!Object} info The item's toolbox JSON.
   * @returns {!SurfaceItem} The item.
   */
  addSurfaceItem(info) {
    const item = new SurfaceItem(this.workspace, info, this.itemHandlers());
    this.surfaceItems.add(item);
    return item;
  }

  /**
   * Called when a surface item's drag ends. Categories can only go in the
   * toolbox pane, so one dropped here is thrown away, as is an item the
   * toolbox pane has already taken.
   * @param {!SurfaceItem} item The item.
   */
  onSurfaceDrop(item) {
    if (item.consumed) {
      item.dispose();
      return;
    }
    if (item.kind === 'category') {
      item.dispose();
      this.handlers.onReject('Categories go in the toolbox.');
      return;
    }
    if (this.isInReadOnlySection(item)) {
      item.dispose();
      this.handlers.onReject(READ_ONLY_MESSAGE);
      return;
    }
    this.queueLayout();
    if (item.isNewLabel) {
      item.isNewLabel = false;
      this.editSoon(item);
    }
  }

  /**
   * Opens an item's editor once the drop or click that added it has
   * finished, so the end of the gesture doesn't take focus from it.
   * @param {!SurfaceItem} item The item.
   */
  editSoon(item) {
    setTimeout(() => {
      if (!item.disposed) this.handlers.onEdit(item);
    });
  }

  /**
   * @returns {!Array<!Blockly.BlockSvg|!SurfaceItem>} The pane's items, top to
   *     bottom, leaving out any being dragged.
   */
  orderedItems() {
    const blocks = this.workspace
      .getTopBlocks(false)
      .filter((block) => !block.isDragging() && !block.isInsertionMarker());
    const others = [...this.surfaceItems].filter((item) => !item.dragging);
    return [...blocks, ...others].sort(
      (a, b) => a.getBoundingRectangle().top - b.getBoundingRectangle().top,
    );
  }

  /**
   * Stacks the items the way VerticalFlyout.layout_ does. While something
   * is dragged over the pane, room is left where it would land: an insertion
   * marker copy for a block, or a gap with a line for anything else.
   */
  layout() {
    const tabWidth = this.workspace.getRenderer().getConstants().TAB_WIDTH;
    const cursorX = MARGIN + tabWidth;
    let cursorY = MARGIN;
    const preview = this.preview;

    this.inLayout = true;
    Blockly.Events.disable();
    try {
      // The ghost or gap is just another item, so the usual gap rules apply.
      const sequence = this.orderedItems();
      if (preview) {
        const rect = preview.item.getBoundingRectangle();
        sequence.splice(
          preview.index,
          0,
          this.ghost ?? {
            slot: true,
            height: rect.getHeight(),
            width: rect.getWidth(),
          },
        );
      }
      let line = null;
      sequence.forEach((item, i) => {
        if (item.slot) {
          line = {top: cursorY, height: item.height, width: item.width};
          cursorY += item.height;
        } else {
          const rect = item.getBoundingRectangle();
          // Separators sit at the column's left edge, under their outline.
          const x = isSeparator(item) ? MARGIN : cursorX;
          item.moveBy(x - rect.left, cursorY - rect.top);
          cursorY += rect.getHeight();
        }
        // A separator replaces the gap after the item before it.
        const next = sequence[i + 1];
        if (!isSeparator(item) && next && !isSeparator(next)) {
          cursorY += GAP_Y;
        }
      });
      this.showLine(line);
    } finally {
      Blockly.Events.enable();
      this.inLayout = false;
    }
  }

  /**
   * Updates the drop preview after the dragged item moves. Called by the
   * editor's drag strategy for blocks, and by surface items.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The dragged item.
   * @param {(PointerEvent|KeyboardEvent)=} e The event that moved it.
   * @param {boolean} connecting Whether a block is about to connect to
   *     another, so it won't land in a gap.
   */
  onDragMove(item, e, connecting) {
    // Categories only go in the toolbox pane, so dropping one here does
    // nothing, and neither does dropping off the pane.
    this.rejected = null;
    const overPane = e instanceof PointerEvent && this.isOverPane(e);
    if (overPane && this.readOnly && item.kind !== 'category') {
      this.showRejection(item);
      return;
    }
    this.clearWontLand();
    const lands =
      item.kind !== 'category' && !connecting && !this.readOnly && overPane;
    if (!lands) {
      // Categories only go in the toolbox pane.
      if (overPane && item.kind === 'category') this.markWontLand(item);
      if (this.preview) this.clearPreview();
      return;
    }
    const rect = item.getBoundingRectangle();
    const middle = (rect.top + rect.bottom) / 2;
    const items = this.orderedItems();
    const index = items.filter((other) => {
      const otherRect = other.getBoundingRectangle();
      return (otherRect.top + otherRect.bottom) / 2 < middle;
    }).length;
    // A dynamic category can't hold static contents, so there's no gap, and
    // dropping does nothing.
    if (this.isReadOnlyAt(items, index)) {
      this.showRejection(item);
      return;
    }
    this.showPreview(item, index);
  }

  /**
   * Records where an item in the pane starts, so a refused drop can show
   * where it will go back to. Called just before its drag starts.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The item.
   */
  onDragStart(item) {
    this.origin = null;
    const isBlock = item instanceof Blockly.BlockSvg;
    if (isBlock && (item.workspace !== this.workspace || item.getParent())) {
      // A palette block, or a block pulled out of another, which goes back
      // into its parent rather than into the column.
      return;
    }
    if (isNewFromPalette(item) || item.fromPalette) return;
    const index = this.orderedItems().indexOf(item);
    if (index !== -1) this.origin = {item, index};
  }

  /**
   * Shows that the dragged item can't be dropped where it is: core's
   * would-delete look, and the marker back in its original place if it has one.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The dragged item.
   */
  showRejection(item) {
    this.rejected = item;
    this.markWontLand(item);
    if (this.origin?.item === item) {
      this.showPreview(item, this.origin.index);
    } else if (this.preview) {
      this.clearPreview();
    }
  }

  /**
   * Leaves room for the dragged item at an index.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The dragged item.
   * @param {number} index Where among the other items.
   */
  showPreview(item, index) {
    if (this.preview?.item === item && this.preview.index === index) return;
    if (this.preview?.item !== item) {
      this.removeGhost();
      if (item instanceof Blockly.BlockSvg) this.ghost = this.createGhost(item);
    }
    this.preview = {item, index};
    this.layout();
  }

  /**
   * Gives the dragged item core's would-delete look: its delete cursor,
   * which is what a drag shows over somewhere it can't stay.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The dragged item.
   */
  markWontLand(item) {
    if (this.wontLand !== item) this.clearWontLand();
    this.wontLand = item;
    setWontLand(item, true);
  }

  clearWontLand() {
    if (this.wontLand) setWontLand(this.wontLand, false);
    this.wontLand = null;
  }

  /**
   * @param {!Array<!Blockly.BlockSvg|!SurfaceItem>} items The pane's items,
   *     not counting the dragged one.
   * @param {number} index Where the dragged item would land among them.
   * @returns {boolean} Whether that's inside a dynamic category's contents.
   */
  isReadOnlyAt(items, index) {
    if (this.readOnly) return true;
    // The item just above decides the section: a heading, or an item from
    // that section. At the very top, the first heading does.
    const neighbour = items[index - 1] ?? items[index];
    if (!neighbour) return false;
    if (neighbour instanceof SurfaceItem && neighbour.kind === 'heading') {
      return !!neighbour.readOnly;
    }
    return !!this.readOnlyItems?.has(neighbour);
  }

  /**
   * Checks whether the drop that's ending was over a dynamic category. If
   * so, says why it does nothing.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The dropped item.
   * @returns {boolean} Whether the drop should be undone.
   */
  takeRejection(item) {
    if (this.rejected !== item) return false;
    this.rejected = null;
    this.handlers.onReject(READ_ONLY_MESSAGE);
    return true;
  }

  /**
   * Finishes a drag: a dropped item goes exactly where the preview showed.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The dragged item.
   * @param {!Blockly.DragDisposition} disposition How the drag ended.
   */
  onDragEnd(item, disposition) {
    const index = this.preview?.index;
    this.clearWontLand();
    this.origin = null;
    this.preview = null;
    this.removeGhost();
    const stillHere =
      item instanceof Blockly.BlockSvg
        ? !item.isDeadOrDying() && !item.getParent()
        : this.surfaceItems.has(item);
    if (
      disposition === Blockly.DragDisposition.COMMIT &&
      index !== undefined &&
      stillHere
    ) {
      // Placed by index, not by the slot's y: laying the pane out without
      // the preview moves everything below it, by more than the slot's
      // height when a dropped separator replaces a large gap.
      const others = this.orderedItems().filter((other) => other !== item);
      const next = others[index]?.getBoundingRectangle().top;
      const last = others[others.length - 1]?.getBoundingRectangle().bottom;
      const top = next !== undefined ? next - 0.5 : (last ?? 0) + 0.5;
      Blockly.Events.disable();
      try {
        item.moveBy(0, top - item.getBoundingRectangle().top);
      } finally {
        Blockly.Events.enable();
      }
    }
    this.layout();
    this.queueLayout();
  }

  /** Removes the drop preview and closes the gap. */
  clearPreview() {
    this.preview = null;
    this.removeGhost();
    this.layout();
  }

  /**
   * Makes a grey, insertion-marker copy of a dragged block, as core shows
   * where a block will connect. setInsertionMarker is @internal.
   * @param {!Blockly.BlockSvg} block The dragged block.
   * @returns {!Blockly.BlockSvg} The copy.
   */
  createGhost(block) {
    Blockly.Events.disable();
    try {
      const state = Blockly.serialization.blocks.save(block, {saveIds: false});
      const ghost = Blockly.serialization.blocks.append(state, this.workspace);
      for (const descendant of ghost.getDescendants(false)) {
        descendant.setInsertionMarker(true);
      }
      return ghost;
    } finally {
      Blockly.Events.enable();
    }
  }

  removeGhost() {
    if (!this.ghost) return;
    Blockly.Events.disable();
    try {
      this.ghost.dispose(false);
    } finally {
      Blockly.Events.enable();
    }
    this.ghost = null;
  }

  /**
   * @param {!PointerEvent} e A pointer event.
   * @returns {boolean} Whether it's over the pane, rather than the palette
   *     or toolbox.
   */
  isOverPane(e) {
    const svg = this.workspace.getParentSvg().getBoundingClientRect();
    const left = svg.left + this.workspace.getMetrics().absoluteLeft;
    return e.clientX >= left && e.clientX <= svg.right;
  }

  /**
   * Shows a line across the middle of a gap, as wide as the item that will
   * fill it, or hides it.
   * @param {?{top: number, height: number, width: number}} gap The gap.
   */
  showLine(gap) {
    if (!gap) {
      this.line?.remove();
      return;
    }
    if (!this.line) {
      this.line = Blockly.utils.dom.createSvgElement(
        Blockly.utils.Svg.RECT,
        {class: 'spikeInsertionLine', height: 4, rx: 2},
        null,
      );
    }
    this.workspace.getLayerManager().getBlockLayer().append(this.line);
    this.line.setAttribute('x', String(MARGIN));
    this.line.setAttribute('width', String(gap.width));
    this.line.setAttribute('y', String(gap.top + gap.height / 2 - 2));
  }

  /** Removes everything from the pane. */
  clear() {
    for (const item of [...this.surfaceItems]) item.dispose();
    Blockly.Events.disable();
    try {
      this.workspace.clear();
    } finally {
      Blockly.Events.enable();
    }
  }

  /**
   * Replaces the pane's contents. A flyout or category toolbox has one
   * section. A continuous toolbox has one per category, each starting with a
   * heading, as ContinuousToolbox.convertToolboxItemToFlyoutItems makes.
   * @param {!Array<{heading: (string|undefined), contents: !Array<!Object>,
   *     readOnly: (boolean|undefined)}>} sections The sections.
   */
  load(sections) {
    this.clear();
    this.loaded = sections.length > 0;
    this.readOnlyItems = new WeakSet();
    this.readOnly = sections.length === 1 && !!sections[0].readOnly;
    // Loading isn't something to undo.
    Blockly.Events.disable();
    try {
      let y = 0;
      const place = (item) => {
        // A distinct y for each item, so layout keeps the loaded order.
        item.moveBy(0, y - item.getBoundingRectangle().top);
        y += 1000;
      };
      sections.forEach((section, index) => {
        if (section.heading !== undefined) {
          const heading = this.addSurfaceItem({
            kind: 'heading',
            text: section.heading,
          });
          heading.sectionIndex = index;
          heading.readOnly = !!section.readOnly;
          place(heading);
        }
        const {contents, tags} = splitBlockGaps(section);
        contents.forEach((info, i) => {
          const item = this.loadItem(info, !!section.readOnly);
          // Where the item came from, for putting it back later. Kept here
          // rather than in its JSON, so it's never exported.
          if (tags?.[i] !== undefined) this.tags.set(item, tags[i]);
          if (section.readOnly) {
            this.readOnlyItems.add(item);
            item.readOnly = true;
          }
          place(item);
        });
      });
    } finally {
      Blockly.Events.enable();
    }
    this.workspace.clearUndo();
    this.layout();
    // Each category opens at its top, as a flyout does.
    this.workspace.scroll(0, 0);
  }

  /**
   * Adds one flyout item.
   * @param {!Object} info Flyout item JSON.
   * @param {boolean} readOnly Whether the item can't be edited.
   * @returns {!Blockly.BlockSvg|!SurfaceItem} The item.
   */
  loadItem(info, readOnly) {
    const kind = info.kind.toLowerCase();
    if (kind !== 'block') return this.addSurfaceItem(info);
    const {kind: _kind, ...state} = info;
    const block = Blockly.serialization.blocks.append(state, this.workspace);
    applyEditorDragStrategy(block);
    if (readOnly) {
      block.setMovable(false);
      block.setDeletable(false);
      block.setEditable(false);
    }
    return block;
  }

  /**
   * @returns {!Array<!Array<!Object>>} Each section's contents as flyout item
   *     JSON, leaving out read-only items. An item above the first heading
   *     goes in the first section.
   */
  save() {
    const sections = [[]];
    /** Each saved item's tag from load, in the same shape as the sections. */
    this.lastSaveTags = [[]];
    let started = false;
    for (const item of this.orderedItems()) {
      if (item instanceof SurfaceItem && item.kind === 'heading') {
        if (started) {
          sections.push([]);
          this.lastSaveTags.push([]);
        }
        started = true;
        continue;
      }
      if (this.readOnlyItems?.has(item)) continue;
      sections[sections.length - 1].push(this.itemToJson(item));
      this.lastSaveTags[this.lastSaveTags.length - 1].push(this.tags.get(item));
    }
    return sections;
  }

  /**
   * @param {!Blockly.BlockSvg|!SurfaceItem} item An item.
   * @returns {!Object} Its flyout item JSON.
   */
  itemToJson(item) {
    if (!(item instanceof Blockly.BlockSvg)) return item.toJson();
    return {
      kind: 'block',
      ...Blockly.serialization.blocks.save(item, {saveIds: false}),
    };
  }

  /**
   * @returns {boolean} Whether the pane shows anything to add to. A category
   *     toolbox with no category selected shows nothing.
   */
  hasSection() {
    return this.loaded;
  }

  /**
   * @param {number|undefined} index A section, or undefined when the pane has
   *     only one.
   * @returns {boolean} Whether it's a dynamic category's, which can't change.
   */
  isSectionReadOnly(index) {
    if (index === undefined) return this.readOnly;
    return !!this.headingFor(index)?.readOnly;
  }

  /**
   * @param {number} index A section.
   * @returns {?SurfaceItem} Its heading, in continuous mode.
   */
  headingFor(index) {
    return (
      [...this.surfaceItems].find((item) => item.sectionIndex === index) ?? null
    );
  }

  /**
   * Moves a newly added item to the end of a section, and scrolls to it.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The item.
   * @param {number|undefined} index The section, or undefined when the pane
   *     has only one.
   */
  appendToSection(item, index) {
    const others = this.orderedItems().filter((other) => other !== item);
    const next = index === undefined ? null : this.headingFor(index + 1);
    const last = others.at(-1)?.getBoundingRectangle().bottom ?? 0;
    // Just above the next section's heading, or after everything. Layout
    // then sorts by y.
    const top = next ? next.getBoundingRectangle().top - 0.5 : last + 0.5;
    Blockly.Events.disable();
    try {
      item.moveBy(0, top - item.getBoundingRectangle().top);
    } finally {
      Blockly.Events.enable();
    }
    this.layout();
    // A new block's size is only known once it has rendered.
    Blockly.renderManagement.finishQueuedRenders().then(() => {
      this.layout();
      this.scrollToItem(item);
    });
  }

  /**
   * Scrolls the least distance that brings an item into view.
   * @param {!Blockly.BlockSvg|!SurfaceItem} item The item.
   */
  scrollToItem(item) {
    const rect = item.getBoundingRectangle();
    const view = this.workspace.getMetricsManager().getViewMetrics(true);
    const viewBottom = view.top + view.height;
    if (rect.top >= view.top && rect.bottom <= viewBottom) return;
    const top =
      rect.bottom > viewBottom
        ? Math.min(rect.top - MARGIN, rect.bottom + MARGIN - view.height)
        : rect.top - MARGIN;
    this.workspace.scroll(0, -top * this.workspace.scale);
  }

  /**
   * Scrolls so a section's heading is in view.
   * @param {number} index The section.
   */
  scrollToSection(index) {
    const heading = [...this.surfaceItems].find(
      (item) => item.sectionIndex === index,
    );
    if (heading) {
      // Puts the heading at the top, as ContinuousFlyout.scrollToCategory
      // does. Scroll coordinates are negated, scaled workspace coordinates.
      const scale = this.workspace.scale;
      this.workspace.scroll(0, -(heading.y - MARGIN) * scale);
    }
  }
}

/**
 * @param {!Blockly.BlockSvg|!SurfaceItem} item An item.
 * @returns {boolean} Whether it's a separator.
 */
/**
 * Turns each block's `gap` into a separator after it, so the editor has one
 * way to show and edit space. Core lays the two out the same way: a block's
 * gap is the separator the flyout adds after it, and a real separator that
 * follows replaces it, so that block's gap is dropped.
 * @param {{contents: !Array<!Object>, tags: (!Array|undefined)}} section A
 *     section's flyout item JSON, and each item's tag.
 * @returns {{contents: !Array<!Object>, tags: (!Array|undefined)}} The same,
 *     with gaps as separators. A new separator shares its block's tag.
 */
function splitBlockGaps({contents, tags}) {
  const result = {contents: [], tags: tags && []};
  contents.forEach((info, i) => {
    const {gap, ...rest} = info;
    const isBlock = info.kind.toLowerCase() === 'block';
    const next = contents[i + 1];
    const add = (item) => {
      result.contents.push(item);
      result.tags?.push(tags[i]);
    };
    add(isBlock ? rest : info);
    if (isBlock && gap !== undefined && next?.kind.toLowerCase() !== 'sep') {
      add({kind: 'sep', gap});
    }
  });
  return result;
}

function isSeparator(item) {
  return item instanceof SurfaceItem && item.kind === 'sep';
}

Blockly.Css.register(`
  /* Core's would-delete cursor, as .blocklyDraggingDelete has. */
  .spikeWontLand,
  .spikeWontLand * {
    cursor: url("<<<PATH>>>/handdelete.cur"), auto !important;
  }
  .spikeInsertionLine {
    fill: #fc3;
  }
`);
