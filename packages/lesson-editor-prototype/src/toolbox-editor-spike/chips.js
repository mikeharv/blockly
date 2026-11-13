/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SVG drawings of toolbox items, used by the palette and while dragging, so
 * that each looks like what it adds.
 */

import * as Blockly from 'blockly';

const FONT_SIZE = 14;
const ROW_HEIGHT = 26;
const COLOUR_BAR = 8;

/**
 * Works out a category's colour as the toolbox would show it.
 * @param {!Object} def The category's JSON.
 * @param {!Blockly.WorkspaceSvg} workspace A workspace with the host's theme.
 * @returns {string} A CSS colour.
 */
export function categoryColour(def, workspace) {
  const style = def.categorystyle
    ? workspace.getTheme().categoryStyles[def.categorystyle]?.colour
    : undefined;
  const colour =
    style ?? def.colour ?? Blockly.ToolboxCategory.defaultBackgroundColour;
  return /^\d+$/.test(String(colour))
    ? Blockly.utils.colour.hueToHex(Number(colour))
    : String(colour);
}

/**
 * Draws a category as its row looks in the toolbox being edited: a
 * continuous toolbox's bubble, or a normal toolbox's colour bar.
 * @param {!SVGElement} parent The group to draw into.
 * @param {!Object} def The category's JSON.
 * @param {!Blockly.WorkspaceSvg} workspace A workspace with the host's theme.
 * @returns {{width: number, height: number}} The drawing's size.
 */
export function drawCategory(parent, def, workspace) {
  const colour = categoryColour(def, workspace);
  const editor = workspace.spikeEditor;
  const draw =
    editor.mode === 'continuous'
      ? drawContinuousCategoryChip
      : drawCategoryChip;
  // Toolbox rows all share the toolbox's width, so these do too.
  return draw(
    parent,
    def.name,
    colour,
    !!def.custom,
    editor.categoryChipWidth ?? 0,
  );
}

/**
 * Draws a continuous toolbox's category: a colour bubble above the name, as
 * ContinuousCategory draws its rows.
 * @param {!SVGElement} parent The group to draw into.
 * @param {string} name The category's name.
 * @param {string} colour The category's colour.
 * @param {boolean} dynamic Whether it's a dynamic category.
 * @param {number} minWidth The narrowest it can be.
 * @returns {{width: number, height: number}} The drawing's size.
 */
function drawContinuousCategoryChip(parent, name, colour, dynamic, minWidth) {
  const height = 46;
  const text = createText(parent, dynamic ? `${name} ⟳` : name, 0, 38);
  text.setAttribute('text-anchor', 'middle');
  const width = Math.max(
    40,
    minWidth,
    Blockly.utils.dom.getFastTextWidth(
      text,
      FONT_SIZE * 0.75,
      'normal',
      'sans-serif',
    ) + 16,
  );
  text.setAttribute('x', String(width / 2));
  const background = Blockly.utils.dom.createSvgElement(
    Blockly.utils.Svg.RECT,
    {class: 'spikeChipBackground', width, height},
    null,
  );
  parent.insertBefore(background, parent.firstChild);
  Blockly.utils.dom.createSvgElement(
    Blockly.utils.Svg.CIRCLE,
    {cx: width / 2, cy: 14, r: 10, fill: colour, stroke: colour},
    parent,
  );
  return {width, height};
}

/**
 * Draws a toolbox category row: a colour bar and the category's name.
 * @param {!SVGElement} parent The group to draw into.
 * @param {string} name The category's name.
 * @param {string} colour The category's colour.
 * @param {boolean} dynamic Whether it's a dynamic category.
 * @param {number} minWidth The narrowest it can be.
 * @returns {{width: number, height: number}} The drawing's size.
 */
function drawCategoryChip(parent, name, colour, dynamic, minWidth) {
  const text = dynamic ? `${name} ⟳` : name;
  const textWidth =
    Blockly.utils.dom.getFastTextWidth(
      createText(parent, text, COLOUR_BAR + 8, ROW_HEIGHT / 2 + 5),
      // getFastTextWidth takes points, and the CSS sets pixels.
      FONT_SIZE * 0.75,
      'normal',
      'sans-serif',
    ) +
    COLOUR_BAR +
    16;
  const width = Math.max(textWidth, minWidth);
  const background = Blockly.utils.dom.createSvgElement(
    Blockly.utils.Svg.RECT,
    {class: 'spikeChipBackground', width: width, height: ROW_HEIGHT},
    null,
  );
  parent.insertBefore(background, parent.firstChild);
  Blockly.utils.dom.createSvgElement(
    Blockly.utils.Svg.RECT,
    {width: COLOUR_BAR, height: ROW_HEIGHT, fill: colour},
    parent,
  );
  return {width, height: ROW_HEIGHT};
}

/**
 * Draws a separator: a rule across a short gap.
 * @param {!SVGElement} parent The group to draw into.
 * @returns {{width: number, height: number}} The drawing's size.
 */
export function drawSeparatorChip(parent) {
  const width = 120;
  const height = 16;
  Blockly.utils.dom.createSvgElement(
    Blockly.utils.Svg.RECT,
    {width: width, height: height, fill: 'transparent'},
    parent,
  );
  Blockly.utils.dom.createSvgElement(
    Blockly.utils.Svg.LINE,
    {
      class: 'spikeChipRule',
      x1: 0,
      x2: width,
      y1: height / 2,
      y2: height / 2,
    },
    parent,
  );
  return {width, height};
}

/**
 * Adds a text element.
 * @param {!SVGElement} parent The group.
 * @param {string} text The text.
 * @param {number} x Its x position.
 * @param {number} y Its baseline.
 * @returns {!SVGTextElement} The element.
 */
function createText(parent, text, x, y) {
  const element = Blockly.utils.dom.createSvgElement(
    Blockly.utils.Svg.TEXT,
    {class: 'spikeChipText', x, y},
    parent,
  );
  element.textContent = text;
  return element;
}

Blockly.Css.register(`
  .spikeChipBackground {
    fill: #fff;
    stroke: #ccc;
  }
  .spikeChipText {
    font: ${FONT_SIZE}px sans-serif;
    fill: #333;
  }
  .spikeChipRule {
    stroke: #bbb;
    stroke-width: 2;
  }
`);
