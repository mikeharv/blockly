/* eslint-disable camelcase */
/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import {Order} from 'blockly/javascript';

// Export all the code generators for our custom blocks,
// but don't register them with Blockly yet.
// This file has no side effects!
export const forBlock = Object.create(null);

forBlock['text_print'] = function (block, generator) {
  const msg = generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
  return `sketch.text(${msg}, 20, 20);\n`;
};

forBlock['p5_setup'] = function (block, generator) {
  const statements = generator.statementToCode(block, 'STATEMENTS');
  const code = `sketch.setup = function() {
${statements}};\n`;
  return code;
};

forBlock['p5_draw'] = function (block, generator) {
  const statements = generator.statementToCode(block, 'STATEMENTS');
  const code = `sketch.draw = function() {
${statements}};\n`;
  return code;
};

forBlock['p5_canvas'] = function (block) {
  const width = block.getFieldValue('WIDTH') || 240;
  const height = block.getFieldValue('HEIGHT') || 180;
  return `sketch.createCanvas(${width}, ${height});\n`;
};

forBlock['p5_background_color'] = function (block, generator) {
  const color = generator.valueToCode(block, 'COLOR', Order.ATOMIC) || `'#fff'`;
  const code = `sketch.background(${color});\n`;
  return code;
};

forBlock['p5_stroke'] = function (block, generator) {
  const color = generator.valueToCode(block, 'COLOR', Order.ATOMIC) || `'#fff'`;
  const code = `sketch.stroke(${color});\n`;
  return code;
};

forBlock['p5_fill'] = function (block, generator) {
  const color = generator.valueToCode(block, 'COLOR', Order.ATOMIC) || `'#fff'`;
  const code = `sketch.fill(${color});\n`;
  return code;
};

forBlock['p5_ellipse'] = function (block, generator) {
  const x = generator.valueToCode(block, 'X', Order.NONE) || 0;
  const y = generator.valueToCode(block, 'Y', Order.NONE) || 0;
  const width = generator.valueToCode(block, 'WIDTH', Order.NONE) || 0;
  const height = generator.valueToCode(block, 'HEIGHT', Order.NONE) || 0;
  return `sketch.ellipse(${x}, ${y}, ${width}, ${height});\n`;
};

forBlock['p5_rect'] = function (block, generator) {
  const x = generator.valueToCode(block, 'X', Order.NONE) || 0;
  const y = generator.valueToCode(block, 'Y', Order.NONE) || 0;
  const width = generator.valueToCode(block, 'WIDTH', Order.NONE) || 0;
  const height = generator.valueToCode(block, 'HEIGHT', Order.NONE) || 0;
  return `sketch.rect(${x}, ${y}, ${width}, ${height});\n`;
};

// Blocks that set their own text size or colours wrap them in push()/pop()
// so those settings don't carry over to the blocks that follow.

forBlock['draw_emoji'] = function (block) {
  const dropdown_emoji = block.getFieldValue('emoji');
  const code = `sketch.push();
sketch.textSize(60);
sketch.text('${dropdown_emoji}', 90, 120);
sketch.pop();\n`;
  return code;
};

forBlock['simple_circle'] = function (block, generator) {
  const color = generator.valueToCode(block, 'COLOR', Order.ATOMIC) || `'#fff'`;
  const code = `sketch.push();
sketch.fill(${color});
sketch.stroke(${color});
sketch.ellipse(120, 90, 50, 50);
sketch.pop();\n`;
  return code;
};

forBlock['text_only'] = function (block, generator) {
  const code = generator.quote_(block.getFieldValue('TEXT'));
  return [code, Order.ATOMIC];
};

// Text is drawn in the current fill and stroke colours, like shapes.

forBlock['write_text_with_shadow'] = function (block, generator) {
  const text = generator.valueToCode(block, 'TEXT', Order.ATOMIC) || `''`;
  const code = `sketch.push();
sketch.textSize(40);
sketch.text(${text}, 20, 160);
sketch.pop();\n`;
  return code;
};

forBlock['write_text_without_shadow'] = function (block, generator) {
  const text = generator.quote_(block.getFieldValue('TEXT'));
  const code = `sketch.push();
sketch.textSize(40);
sketch.text(${text}, 20, 160);
sketch.pop();\n`;
  return code;
};
