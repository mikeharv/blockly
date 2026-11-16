/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's header: one fixed bar across the top. Over the palette, the
 * Toolbox Type toggle and how to add items; over the toolbox and flyout
 * pane, "Toolbox Preview" and how to change them. The palette, toolbox and
 * flyout pane all start below it, so nothing scrolls under it.
 */

import * as Blockly from 'blockly';
import {createInertFlyoutButton} from './surface_item';

/** Matches Flyout.CORNER_RADIUS, which the flyout uses as its margin. */
const MARGIN = 8;

/** Where text starts, matching the palette's items. */
const TEXT_X = 2 * MARGIN;

/** Space around the toggle's buttons for its focus ring. */
const RING_PADDING = 3;

/** The editor's header. */
export class EditorHeader {
  /**
   * @param {!Blockly.WorkspaceSvg} workspace The editor's workspace.
   * @param {boolean} categories Whether the toolbox has categories.
   * @param {function(boolean)} onChoose Called when the author picks a
   *     toolbox type.
   */
  constructor(workspace, categories, onChoose) {
    const {dom, Svg} = Blockly.utils;
    this.workspace = workspace;
    this.categories = categories;
    this.onChoose = onChoose;
    this.labels = [];
    // Its own SVG, first in the editor, so it's first in the tab order too:
    // the toggle, then the palette, toolbox and flyout pane.
    this.svgGroup = dom.createSvgElement(
      Svg.SVG,
      {class: 'spikeEditorHeader'},
      null,
    );
    workspace.getInjectionDiv().prepend(this.svgGroup);

    // Over the palette, in the palette's colours: an opaque base under the
    // flyout's background, which can be translucent.
    this.paletteSection = dom.createSvgElement(Svg.G, {}, this.svgGroup);
    this.paletteBackgrounds = [
      'spikeHeaderBase',
      'blocklyFlyoutBackground',
    ].map((className) =>
      dom.createSvgElement(Svg.RECT, {class: className}, this.paletteSection),
    );
    const themeManager = workspace.getThemeManager();
    const [, flyoutBackground] = this.paletteBackgrounds;
    themeManager.subscribe(flyoutBackground, 'flyoutBackgroundColour', 'fill');
    themeManager.subscribe(flyoutBackground, 'flyoutOpacity', 'fill-opacity');

    const typeLabel = this.addLabel(this.paletteSection, 'Toolbox Type');
    this.toggle = this.createToggle();
    const buttonHeight = this.toggleSize.height;
    const titleY = MARGIN + (buttonHeight - typeLabel.height) / 2;
    const hintY = MARGIN + buttonHeight + MARGIN / 2;
    const toggleX = TEXT_X + typeLabel.width + MARGIN;
    typeLabel.moveTo(TEXT_X, titleY);
    this.toggle.setAttribute('transform', `translate(${toggleX},${MARGIN})`);
    const hint = this.addLabel(
      this.paletteSection,
      'Click or drag to add items',
      true,
    );
    hint.moveTo(TEXT_X, hintY);

    /** The header's height. */
    this.height = Math.ceil(hintY + hint.height + MARGIN);
    /** The narrowest the palette can be without cutting off the toggle. */
    this.minPaletteWidth = Math.ceil(
      toggleX +
        this.toggleSize.width +
        MARGIN +
        Blockly.Scrollbar.scrollbarThickness,
    );

    // Over the toolbox and flyout pane, in the workspace's colours.
    this.previewSection = dom.createSvgElement(Svg.G, {}, this.svgGroup);
    this.previewBackground = dom.createSvgElement(
      Svg.RECT,
      {class: 'spikeHeaderPreviewBackground'},
      this.previewSection,
    );
    this.addLabel(this.previewSection, 'Toolbox Preview').moveTo(
      TEXT_X,
      titleY,
    );
    this.addLabel(
      this.previewSection,
      'This is the toolbox you are editing.',
      true,
    ).moveTo(TEXT_X, hintY);
    this.line = dom.createSvgElement(
      Svg.LINE,
      {class: 'spikeHeaderLine'},
      this.svgGroup,
    );
  }

  /**
   * Draws text as a core flyout label, so it matches the palette.
   * @param {!SVGElement} parent Where to draw it.
   * @param {string} text The text.
   * @param {boolean=} hint Whether it's the smaller instruction text.
   * @returns {{width: number, height: number, moveTo: function(number,
   *     number)}} Its size, and a way to place it.
   */
  addLabel(parent, text, hint = false) {
    const info = {kind: 'label', text};
    if (hint) info['web-class'] = 'spikeHeaderHint';
    const label = createInertFlyoutButton(this.workspace, info, true);
    this.labels.push(label);
    const root = label.getSvgRoot();
    parent.appendChild(root);
    // Read by screen readers as text, not as a flyout list option.
    Blockly.utils.aria.setRole(root, Blockly.utils.aria.Role.NONE);
    const rect = label.getBoundingRectangle();
    return {
      width: rect.getWidth(),
      height: rect.getHeight(),
      moveTo: (x, y) => root.setAttribute('transform', `translate(${x},${y})`),
    };
  }

  /**
   * Creates the Toolbox Type toggle: two of core's flyout buttons side by
   * side, the chosen one drawn as a normal button and the other as an
   * outline. It's outside any of Blockly's focus trees, so like core's zoom
   * controls and trashcan it's an ordinary tab stop, with core's focus ring
   * shown on :focus-visible. Enter or Space switches.
   * @returns {!SVGElement} The toggle.
   */
  createToggle() {
    const {dom, Svg, aria} = Blockly.utils;
    const toggle = dom.createSvgElement(
      Svg.G,
      {class: 'spikeHeaderToggle', tabindex: 0},
      this.paletteSection,
    );
    aria.setRole(toggle, aria.Role.CHECKBOX);
    aria.setState(toggle, aria.State.LABEL, 'Categories');
    aria.setState(toggle, aria.State.CHECKED, this.categories);
    const focusRing = dom.createSvgElement(
      Svg.RECT,
      {class: 'blocklyFocusRing', rx: 4},
      toggle,
    );
    let x = 0;
    let height = 0;
    for (const [text, value] of [
      ['Categories', true],
      ['Flyout', false],
    ]) {
      const button = createInertFlyoutButton(
        this.workspace,
        {kind: 'button', text},
        false,
      );
      this.labels.push(button);
      const root = button.getSvgRoot();
      toggle.appendChild(root);
      root.setAttribute('transform', `translate(${x},0)`);
      root.classList.toggle('spikeToggleOff', value !== this.categories);
      aria.setRole(root, aria.Role.NONE);
      aria.clearState(root, aria.State.LABEL);
      root.addEventListener('pointerdown', (e) => e.stopPropagation());
      root.addEventListener('click', () => this.choose(value));
      const rect = button.getBoundingRectangle();
      x += rect.getWidth() + MARGIN / 2;
      height = rect.getHeight();
    }
    this.toggleSize = {width: x - MARGIN / 2, height};
    toggle.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        this.choose(!this.categories);
      }
    });
    focusRing.setAttribute('x', String(-RING_PADDING));
    focusRing.setAttribute('y', String(-RING_PADDING));
    focusRing.setAttribute(
      'width',
      String(this.toggleSize.width + 2 * RING_PADDING),
    );
    focusRing.setAttribute('height', String(height + 2 * RING_PADDING));
    return toggle;
  }

  /**
   * @param {boolean} categories Whether the toolbox should have categories.
   */
  choose(categories) {
    if (categories !== this.categories) this.onChoose(categories);
  }

  /** Gives the toggle keyboard focus. */
  focusToggle() {
    this.toggle.focus();
  }

  /**
   * Sizes the two sections.
   * @param {number} paletteWidth The palette's width.
   * @param {number} width The editor's width.
   */
  layout(paletteWidth, width) {
    this.svgGroup.setAttribute('width', String(width));
    this.svgGroup.setAttribute('height', String(this.height));
    for (const background of this.paletteBackgrounds) {
      background.setAttribute('width', String(paletteWidth));
      background.setAttribute('height', String(this.height));
    }
    this.previewSection.setAttribute(
      'transform',
      `translate(${paletteWidth},0)`,
    );
    this.previewBackground.setAttribute(
      'width',
      String(Math.max(0, width - paletteWidth)),
    );
    this.previewBackground.setAttribute('height', String(this.height));
    for (const [name, value] of Object.entries({
      x1: paletteWidth,
      x2: width,
      y1: this.height - 0.5,
      y2: this.height - 0.5,
    })) {
      this.line.setAttribute(name, String(value));
    }
  }

  dispose() {
    for (const label of this.labels) label.dispose();
    this.svgGroup.remove();
  }
}

Blockly.Css.register(`
  /* First in the DOM for tab order, so it needs a z-index to draw over the
     workspace's SVG, which fills the editor. Above the toolbox (70), below
     the drag layers (80), so dragged items still pass over it. */
  .spikeEditorHeader {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 75;
  }
  .spikeHeaderBase,
  .spikeHeaderPreviewBackground {
    fill: #fff;
  }
  .spikeHeaderLine {
    stroke: #ccc;
  }
  /* Beats the renderer's label font, which includes its own two classes. */
  .injectionDiv .blocklyFlyoutLabel.spikeHeaderHint .blocklyFlyoutLabelText {
    font-size: 12px;
    font-weight: normal;
    opacity: 0.75;
  }
  /* The choice that isn't selected, drawn as an outlined button. */
  .spikeToggleOff .blocklyFlyoutButtonBackground {
    fill: transparent;
    stroke: #888;
  }
  /* Beats the renderer's text colour, which includes its own two classes. */
  .injectionDiv .spikeHeaderToggle .spikeToggleOff .blocklyText {
    fill: #575e75;
  }
  .spikeToggleOff .blocklyFlyoutButtonShadow {
    display: none;
  }
  .spikeHeaderToggle .blocklyFlyoutButton {
    cursor: pointer;
  }
  .spikeHeaderToggle {
    outline: none;
  }
  .spikeHeaderToggle .blocklyFocusRing {
    fill: none;
  }
  /* As core does for its zoom controls and trashcan. */
  .spikeHeaderToggle:focus-visible > .blocklyFocusRing {
    stroke: var(--blockly-active-node-color);
    stroke-width: var(--blockly-selection-width);
  }
`);
