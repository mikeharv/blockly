/**
 * @license
 * Copyright 2026 Raspberry Pi Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A throwaway spike of the three-pane toolbox editor: palette, toolbox pane
 * and flyout pane. See the A3 design in the plan.
 */

import * as Blockly from 'blockly';
import {installAllBlocks as installColourBlocks} from '@blockly/field-colour';
import {javascriptGenerator} from 'blockly/javascript';
import {toolboxTestBlocks} from '@blockly/block-test';
import {registerLessonAuthoringContextMenuOptions} from '@blockly/plugin-lesson-authoring';
import {blocks} from '../blocks/p5';
import {toolbox as sourceToolbox} from '../toolbox';
import {categoryColour} from './chips';
import {EditorToolbox, registerCategoryClass} from './editor_toolbox';
import {FlyoutPane, FlyoutPaneMetrics} from './flyout_pane';
import {PALETTE_ITEM, PaletteFlyout} from './palette';
import '../index.css';
import './spike.css';

window.Blockly = Blockly;
installColourBlocks({javascript: javascriptGenerator});
Blockly.common.defineBlocks(blocks);

registerLessonAuthoringContextMenuOptions();
hideLockItemsInEditor();

const editorDiv = document.getElementById('editorDiv');
const continuousInput = document.getElementById('continuousInput');
const rendererSelect = document.getElementById('rendererSelect');
const testBlocksInput = document.getElementById('testBlocksInput');
const statusText = document.getElementById('status');

/** The host's static categories, which the palette offers in full. */
const sourceCategories = sourceToolbox.contents.filter(
  (item) => item.kind === 'category' && !item.custom,
);

/** The host's dynamic categories. */
const dynamicCategories = sourceToolbox.contents.filter((item) => item.custom);

/**
 * Lists the blocks in toolbox contents, at any depth, as supported-block
 * entries: a plain name where the entry is just a type, and the state
 * otherwise. Blocks written as XML are converted to states.
 * @param {!Array<!Object>} contents Toolbox contents.
 * @returns {!Array<string|!Object>} The entries.
 */
function blocksIn(contents) {
  return contents.flatMap((item) => {
    const kind = item.kind.toLowerCase();
    if (kind === 'category') {
      return Array.isArray(item.contents) ? blocksIn(item.contents) : [];
    }
    if (kind !== 'block') return [];
    if (item.blockxml) return [xmlToState(item.blockxml)];
    const {kind: _kind, ...state} = item;
    return [Object.keys(state).length === 1 ? state.type : state];
  });
}

/**
 * @param {string|!Node} xml A block in XML.
 * @returns {!Object} Its JSON state.
 */
function xmlToState(xml) {
  const workspace = new Blockly.Workspace();
  try {
    const dom =
      typeof xml === 'string' ? Blockly.utils.xml.textToDom(xml) : xml;
    const block = Blockly.Xml.domToBlock(dom, workspace);
    return Blockly.serialization.blocks.save(block, {saveIds: false});
  } finally {
    workspace.dispose();
  }
}

/**
 * The blocks the host supports. Each entry is either a block type name, or a
 * full block state for a block that should come with default field values or
 * shadows. Any Blockly app can give this. The spike takes it from the
 * prototype's toolbox, plus core's test blocks from @blockly/block-test when
 * "Include test blocks" is ticked.
 * @returns {!Array<string|!Object>} The host's list.
 */
function supportedBlocks() {
  return [
    ...blocksIn(sourceCategories),
    ...(testBlocksInput.checked ? blocksIn(toolboxTestBlocks.contents) : []),
  ];
}

/**
 * Turns the host's supported blocks into palette entries, one per type. A
 * full state is preferred over a plain name, since it carries the block's
 * default fields and shadows. Otherwise the first entry for a type wins, in
 * the host's order.
 * @param {!Array<string|!Object>} blocks The host's list.
 * @returns {!Array<!Object>} Flyout block JSON.
 */
function paletteBlocks(blocks) {
  const byType = new Map();
  for (const entry of blocks) {
    const state = typeof entry === 'string' ? {type: entry} : entry;
    const existing = byType.get(state.type);
    if (
      !existing ||
      (typeof existing === 'string' && typeof entry !== 'string')
    ) {
      byType.set(state.type, entry);
    }
  }
  return [...byType.values()].map((entry) =>
    typeof entry === 'string'
      ? {kind: 'block', type: entry}
      : {kind: 'block', ...entry},
  );
}

/** The button callbacks the host supports. */
const buttonCallbacks = [
  {text: 'Create variable...', callbackkey: 'CREATE_VARIABLE'},
];

/**
 * The category styles the host allows authors to choose from. A host would
 * pass these in; the spike offers every category style in the theme.
 */
const categoryStyleNames = Object.keys(Blockly.Themes.Classic.categoryStyles);

/** A smaller starting toolbox than the host's, so editing is easy to see. */
const initialToolbox = {
  kind: 'categoryToolbox',
  contents: [
    sourceCategories.find((c) => c.name === 'Logic'),
    sourceCategories.find((c) => c.name === 'p5'),
    {kind: 'sep'},
    dynamicCategories[0],
  ],
};

/** The palette's empty category. Adding it asks for a name. */
const NEW_CATEGORY = {
  kind: 'category',
  name: 'New category',
  colour: '#888888',
  contents: [],
};

/** The palette's label. Adding it asks for its text. */
const NEW_LABEL = {kind: 'label', text: 'New label'};

const editor = {
  /** The author's choice, from the toggle at the top of the palette. */
  categories: true,
  /** The host's setting: whether it uses @blockly/continuous-toolbox. */
  continuous: continuousInput.checked,
  /** @returns {string} 'flyout', 'category' or 'continuous'. */
  get mode() {
    if (!this.categories) return 'flyout';
    return this.continuous ? 'continuous' : 'category';
  },
  /** The toolbox definition being edited. */
  model: structuredClone(initialToolbox),
  /** Which model entry pane 3 shows, in category mode. */
  currentIndex: -1,
  /** Set while selecting a category in code, to skip saving pane 3. */
  suppressSave: false,
  workspace: null,
  pane: null,
  dropLine: null,

  /**
   * Switches the toolbox between categories and a flyout, from the header's
   * toggle, and gives the new toggle focus.
   * @param {boolean} categories Whether it should have categories.
   */
  setCategories(categories) {
    this.commitPane();
    const from = this.mode;
    this.categories = categories;
    convertModel(from, this.mode);
    inject();
    this.workspace.getToolbox().header.focusToggle();
  },

  /** @returns {!Array<!Object>} The palette's flyout contents. */
  paletteContents() {
    const entry = (item) => ({kind: PALETTE_ITEM, item});
    // Small and faded, so they don't look like the Label entry, which is
    // drawn as a real label.
    const heading = (text) => ({
      'kind': 'label',
      'text': text.toUpperCase(),
      'web-class': 'spikePaletteHeading',
    });
    return [
      // A flyout toolbox has no categories to add them to.
      ...(this.mode === 'flyout'
        ? []
        : [
            heading('Add categories'),
            entry(NEW_CATEGORY),
            ...sourceCategories.map(entry),
            ...dynamicCategories.map(entry),
          ]),
      heading('Buttons, labels and separators'),
      ...buttonCallbacks.map((button) => entry({kind: 'button', ...button})),
      entry(NEW_LABEL),
      entry({kind: 'sep', gap: 48}),
      heading('Blocks'),
      ...paletteBlocks(supportedBlocks()),
    ];
  },

  /**
   * Creates the item a palette entry drags as.
   * @param {!Object} info The toolbox JSON the entry creates.
   * @returns {!Object} A SurfaceItem on pane 3.
   */
  createDragItem(info) {
    const item = this.pane.addSurfaceItem(structuredClone(info));
    item.fromPalette = true;
    item.isNewCategory = info === NEW_CATEGORY;
    item.isNewLabel = info === NEW_LABEL;
    return item;
  },

  /**
   * Adds a clicked palette entry: a category or dynamic category at the end
   * of the toolbox, anything else at the end of the open flyout.
   * @param {!Object} info The toolbox JSON the entry adds.
   */
  insertFromPalette(info) {
    const kind = info.kind.toLowerCase();
    if (kind === 'category') {
      if (this.mode === 'flyout') {
        this.reject("A flyout toolbox can't hold categories.");
        return;
      }
      this.commitPane();
      this.model.contents.push(structuredClone(info));
      this.renderToolbox(this.model.contents.length - 1);
      status(`Added ${info.name}.`);
      if (info === NEW_CATEGORY)
        this.promptForName(this.model.contents.length - 1);
      return;
    }
    if (this.mode === 'category' && !this.pane.hasSection()) {
      this.reject('Select a category to add it to.');
      return;
    }
    const section =
      this.mode === 'continuous' ? this.selectedSection() : undefined;
    if (this.pane.isSectionReadOnly(section)) {
      this.reject("A dynamic category's contents can't be changed.");
      return;
    }
    const item = this.pane.loadItem(structuredClone(info), false);
    this.pane.appendToSection(item, section);
    if (info === NEW_LABEL) this.pane.editSoon(item);
  },

  /**
   * @returns {number} The pane 3 section of the category selected in pane 2,
   *     in continuous mode, or the first if none is.
   */
  selectedSection() {
    const contents = this.model.contents;
    if (contents[this.currentIndex]?.kind !== 'category') return 0;
    return contents
      .slice(0, this.currentIndex)
      .filter((entry) => entry.kind === 'category').length;
  },

  /**
   * @param {!Object} element A dragged element.
   * @returns {boolean} Whether the drag in progress created it from the
   *     palette.
   */
  isNewFromPalette(element) {
    if (element instanceof Blockly.BlockSvg) {
      return this.pane.isNewFromPalette(element);
    }
    return !!element.fromPalette;
  },

  /**
   * Edits a label's or button's text, a button's callback, or a separator's
   * gap, in a small popover over the item.
   * @param {!Object} item The SurfaceItem.
   */
  editSurfaceItem(item) {
    let text;
    let callback;
    let gap;
    showEditPopover(
      item.getSvgRoot().getBoundingClientRect(),
      (field) => {
        if (item.kind === 'sep') {
          gap = field('Size ', document.createElement('input'));
          gap.type = 'number';
          gap.min = '0';
          gap.value = String(item.getGap());
          return;
        }
        text = field('Text ', document.createElement('input'));
        text.value = item.info.text;
        if (item.kind === 'button') {
          callback = field('Callback ', document.createElement('select'));
          for (const button of buttonCallbacks) {
            callback.add(new Option(button.callbackkey, button.callbackkey));
          }
          callback.value = item.info.callbackkey;
        }
      },
      () => {
        const info = {...item.info};
        if (gap) info.gap = Math.max(0, parseInt(gap.value) || 0);
        if (text) info.text = text.value;
        if (callback) info.callbackkey = callback.value;
        item.setInfo(info);
        this.pane.layout();
        Blockly.getFocusManager().focusNode(item);
      },
    );
  },

  /**
   * Edits a category's name and colour, in the same popover as a label's
   * text. The colour is one of the host's category styles. An empty name
   * keeps the old one.
   * @param {!Blockly.ToolboxCategory} category The category's row.
   * @param {number} index Its model index.
   */
  showCategoryEditor(category, index) {
    const entry = this.model.contents[index];
    let name;
    let style = entry.categorystyle;
    showEditPopover(
      category.getDiv().getBoundingClientRect(),
      (field, form) => {
        name = field('Name ', document.createElement('input'));
        name.value = entry.name;
        const swatches = document.createElement('div');
        swatches.className = 'spikeSwatches';
        swatches.setAttribute('role', 'radiogroup');
        swatches.setAttribute('aria-label', 'Colour');
        for (const option of categoryStyleNames) {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'spikeSwatch';
          swatch.title = option.replace(/_category$/, '').replace(/_/g, ' ');
          swatch.setAttribute('role', 'radio');
          swatch.setAttribute('aria-label', swatch.title);
          swatch.setAttribute('aria-checked', String(option === style));
          swatch.style.background = categoryColour(
            {categorystyle: option},
            this.workspace,
          );
          swatch.addEventListener('click', () => {
            style = option;
            for (const other of swatches.children) {
              other.setAttribute('aria-checked', String(other === swatch));
            }
          });
          swatches.append(swatch);
        }
        form.append(swatches);
      },
      () => {
        if (name.value) entry.name = name.value;
        else this.reject('A category needs a name.');
        if (style !== entry.categorystyle) {
          entry.categorystyle = style;
          delete entry.colour;
        }
        this.renderToolbox(this.currentIndex);
        this.focusToolboxItem(index);
      },
      () => this.focusToolboxItem(index),
    );
  },

  /**
   * Focuses a row in pane 2.
   * @param {number} index Its model index.
   */
  focusToolboxItem(index) {
    const item = this.workspace.getToolbox().getToolboxItems()[index];
    if (item) Blockly.getFocusManager().focusNode(item);
  },

  /** Saves pane 3 back into the model. */
  commitPane() {
    if (!this.pane || this.suppressSave) return;
    const sections = this.pane.save();
    if (this.mode === 'flyout') {
      this.model.contents = sections[0];
    } else if (this.mode === 'continuous') {
      const categories = this.model.contents.filter(
        (item) => item.kind === 'category',
      );
      categories.forEach((category, i) => {
        if (!category.custom) category.contents = sections[i] ?? [];
      });
    } else {
      const category = this.model.contents[this.currentIndex];
      if (category?.kind === 'category' && !category.custom) {
        category.contents = sections[0];
      }
    }
  },

  /**
   * Says why an action did nothing, with core's error beep.
   * @param {string} message The reason.
   */
  reject(message) {
    status(message);
    this.workspace.getAudioManager().playErrorBeep();
  },

  /**
   * Adds a copy of a palette block, clicked rather than dragged.
   * @param {!Blockly.BlockSvg} block The palette block.
   */
  insertBlockFromPalette(block) {
    this.insertFromPalette({
      kind: 'block',
      ...Blockly.serialization.blocks.save(block, {saveIds: false}),
    });
  },

  /**
   * Shows a category in pane 3, or scrolls to it in continuous mode.
   * @param {?Blockly.IToolboxItem} item The selected toolbox item.
   */
  onCategorySelected(item) {
    const index = this.workspace.getToolbox().getToolboxItems().indexOf(item);
    if (this.mode === 'continuous') {
      const categoryIndex = this.model.contents
        .slice(0, index)
        .filter((entry) => entry.kind === 'category').length;
      this.pane.scrollToSection(categoryIndex);
      this.currentIndex = index;
      return;
    }
    this.commitPane();
    this.currentIndex = index;
    this.loadPane();
  },

  /** Loads pane 3 from the model. */
  loadPane() {
    if (this.mode === 'flyout') {
      this.pane.load([{contents: this.model.contents, tags: this.flyoutTags}]);
      this.flyoutTags = undefined;
    } else if (this.mode === 'continuous') {
      this.pane.load(
        this.model.contents
          .filter((entry) => entry.kind === 'category')
          .map((category) => this.sectionFor(category, category.name)),
      );
    } else {
      const category = this.model.contents[this.currentIndex];
      this.pane.load(
        category?.kind === 'category' ? [this.sectionFor(category)] : [],
      );
    }
  },

  /**
   * @param {!Object} category A category's JSON.
   * @param {string=} heading The section's heading, in continuous mode.
   * @returns {!Object} Its pane 3 section. A dynamic category's contents
   *     come from its callback, read-only, as the student would see them.
   */
  sectionFor(category, heading) {
    if (!category.custom) {
      return {heading, contents: category.contents ?? []};
    }
    const callback = this.workspace.getToolboxCategoryCallback(category.custom);
    const contents = callback ? callback(this.workspace) : [];
    return {
      heading,
      readOnly: true,
      contents: Blockly.utils.toolbox.convertFlyoutDefToJsonArray(contents),
    };
  },

  /**
   * Changes a category or separator in pane 2.
   * @param {!Blockly.IToolboxItem} toolboxItem The row's item.
   * @param {string} action 'edit' or 'delete'.
   */
  editToolboxItem(toolboxItem, action) {
    this.commitPane();
    const items = this.workspace.getToolbox().getToolboxItems();
    const index = items.indexOf(toolboxItem);
    const contents = this.model.contents;
    let selected = this.currentIndex;
    if (action === 'edit') {
      this.showCategoryEditor(toolboxItem, index);
      return;
    } else if (action === 'delete') {
      contents.splice(index, 1);
      if (selected === index) selected = Math.min(index, contents.length - 1);
      else if (selected > index) selected--;
    }
    this.renderToolbox(selected);
  },

  /**
   * Redraws pane 2 from the model and selects an entry without saving pane 3
   * over it. Redraws through IToolbox.render, which is public; only Toolbox's
   * own implementation is marked @internal.
   * @param {number} selected The model index to select.
   */
  renderToolbox(selected) {
    /** @type {!Blockly.IToolbox} */
    const toolbox = this.workspace.getToolbox();
    toolbox.render(this.model);
    this.suppressSave = true;
    try {
      const item = toolbox.getToolboxItems()[selected];
      if (item?.isSelectable()) {
        toolbox.setSelectedItem(item);
      } else {
        this.currentIndex = selected;
        this.loadPane();
      }
      if (this.mode === 'continuous') this.loadPane();
    } finally {
      this.suppressSave = false;
    }
    this.workspace.resize();
  },

  /**
   * @param {!Object} element The item being dragged over pane 2.
   * @returns {number} The model index it would be inserted at.
   */
  toolboxDropIndex(element) {
    // IDragTarget's hooks aren't given the pointer, so it's tracked below.
    return this.toolboxIndexAt(lastPointer.y);
  },

  /**
   * @param {number} y A client y coordinate.
   * @returns {number} The model index a row dropped there would go before.
   */
  toolboxIndexAt(y) {
    const rows = this.workspace
      .getToolbox()
      .getToolboxItems()
      .map((item) => item.getDiv().getBoundingClientRect());
    const index = rows.findIndex((row) => y < row.top + row.height / 2);
    return index === -1 ? rows.length : index;
  },

  /**
   * Moves a toolbox entry, keeping the same category selected.
   * @param {number} from Its model index.
   * @param {number} before The index it should go before, counting itself.
   */
  moveToolboxItem(from, before) {
    const to = before > from ? before - 1 : before;
    if (to === from) return;
    this.commitPane();
    const contents = this.model.contents;
    const selected = contents[this.currentIndex];
    const [entry] = contents.splice(from, 1);
    contents.splice(to, 0, entry);
    this.renderToolbox(contents.indexOf(selected));
  },

  /** @returns {boolean} Whether pane 2 can take this dragged element. */
  canDropOnToolbox(element) {
    return (
      element.fromPalette &&
      (element.kind === 'category' || element.kind === 'sep')
    );
  },

  showToolboxDropIndicator(element) {
    if (!this.canDropOnToolbox(element)) return;
    this.showToolboxDropLineAt(this.toolboxDropIndex(element));
  },

  /**
   * Shows the drop line before a toolbox row, or after the last one.
   * @param {number} index The row's index.
   */
  showToolboxDropLineAt(index) {
    const toolbox = this.workspace.getToolbox();
    const div = toolbox.HtmlDiv;
    if (!this.dropLine) {
      this.dropLine = document.createElement('div');
      this.dropLine.className = 'spikeToolboxDropLine';
    }
    div.appendChild(this.dropLine);
    const rows = toolbox.getToolboxItems().map((item) => item.getDiv());
    const divTop = div.getBoundingClientRect().top;
    const top =
      index < rows.length
        ? rows[index].getBoundingClientRect().top
        : (rows.at(-1)?.getBoundingClientRect().bottom ?? divTop);
    this.dropLine.style.top = `${top - divTop + div.scrollTop}px`;
  },

  hideToolboxDropIndicator() {
    this.dropLine?.remove();
  },

  /** Inserts a category or separator dropped on pane 2. */
  dropOnToolbox(element) {
    this.hideToolboxDropIndicator();
    if (!this.canDropOnToolbox(element)) {
      this.reject('The toolbox only holds categories and separators.');
      return;
    }
    this.commitPane();
    const index = this.toolboxDropIndex(element);
    // A separator between categories has no gap.
    const entry =
      element.kind === 'sep' ? {kind: 'sep'} : structuredClone(element.info);
    this.model.contents.splice(index, 0, entry);
    element.consumed = true;
    let selected = this.currentIndex;
    if (selected >= index) selected++;
    if (entry.kind === 'category') selected = index;
    this.renderToolbox(selected);
    status(`Added ${entry.kind === 'sep' ? 'a separator' : entry.name}.`);
    if (element.isNewCategory) this.promptForName(index);
  },

  /**
   * Asks for a new category's name. Cancelling keeps the default name.
   * @param {number} index The category's model index.
   */
  promptForName(index) {
    // After the drag or click that added it has finished, so the end of the
    // gesture doesn't take focus from the name field.
    setTimeout(() => {
      const item = this.workspace.getToolbox().getToolboxItems()[index];
      if (item) this.editToolboxItem(item, 'edit');
    });
  },
};

/** The pointer's latest position, for placing drops on pane 2. */
const lastPointer = {x: 0, y: 0};
document.addEventListener(
  'pointermove',
  (e) => Object.assign(lastPointer, {x: e.clientX, y: e.clientY}),
  true,
);

/**
 * Shows a small form under something, with a Done button. Escape closes it
 * without changing anything.
 * @param {!DOMRect} box Where the thing being edited is on screen.
 * @param {function(function(string, !HTMLElement): !HTMLElement,
 *     !HTMLFormElement)} build Adds the controls, through the function it's
 *     given, which labels each one, or straight to the form.
 * @param {function()} apply Saves the controls' values, on Done.
 * @param {function()=} cancel Called on Escape.
 */
function showEditPopover(box, build, apply, cancel) {
  document.querySelector('.spikePopover')?.remove();
  const form = document.createElement('form');
  form.className = 'spikePopover';
  build((label, control) => {
    const wrapper = document.createElement('label');
    wrapper.append(label, control);
    form.append(wrapper);
    return control;
  }, form);
  const done = document.createElement('button');
  done.textContent = 'Done';
  form.append(done);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    form.remove();
    apply();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    form.remove();
    cancel?.();
  });
  form.style.left = `${box.left}px`;
  form.style.top = `${box.bottom + 4}px`;
  document.body.append(form);
  const first = form.querySelector('input, select');
  first?.focus();
  // So typing replaces the value.
  if (first instanceof HTMLInputElement) first.select();
}

/**
 * Shows a status message.
 * @param {string} message The message.
 */
function status(message) {
  statusText.textContent = message;
}

/** Creates the editor's workspace for the current mode. */
function inject() {
  editor.workspace?.dispose();
  editor.dropLine = null;
  registerCategoryClass(editor.mode === 'continuous');
  editorDiv.classList.toggle('spikeContinuous', editor.mode === 'continuous');
  editorDiv.classList.toggle('spikeFlyoutOnly', editor.mode === 'flyout');

  // The workspace has to be created with a category toolbox so that its
  // flyout, the palette, exists. In flyout mode the toolbox is hidden.
  const toolboxDef =
    editor.mode === 'flyout'
      ? {kind: 'categoryToolbox', contents: []}
      : editor.model;
  const ws = Blockly.inject(editorDiv, {
    toolbox: toolboxDef,
    plugins: {
      toolbox: EditorToolbox,
      flyoutsVerticalToolbox: PaletteFlyout,
      metricsManager: FlyoutPaneMetrics,
    },
    renderer: rendererSelect.value,
    trashcan: false,
    zoom: {controls: false, wheel: false},
    move: {
      scrollbars: {vertical: true, horizontal: false},
      drag: false,
      wheel: true,
    },
  });
  editor.workspace = ws;
  editor.pane = new FlyoutPane(ws, {
    onEdit: (item) => editor.editSurfaceItem(item),
    onReject: (message) => editor.reject(message),
  });
  if (editor.mode === 'flyout') ws.getToolbox().setVisible(false);

  editor.currentIndex = -1;
  if (editor.mode === 'flyout') {
    editor.loadPane();
  } else {
    const first = ws
      .getToolbox()
      .getToolboxItems()
      .findIndex((item) => item.isSelectable());
    editor.renderToolbox(first);
  }
}

// EditorToolbox.init needs the editor, and runs inside Blockly.inject, so
// the editor is reachable from every workspace.
Object.defineProperty(Blockly.WorkspaceSvg.prototype, 'spikeEditor', {
  get: () => editor,
});

/**
 * Converts the model between toolbox types.
 * @param {string} from The old mode.
 * @param {string} to The new mode.
 */
function convertModel(from, to) {
  if (from !== 'flyout' && to === 'flyout') {
    // Merge static categories in order. Dynamic categories are dropped. The
    // categories are kept here, and each item is tagged with the one it came
    // from, so switching back can restore them. None of this is exported.
    editor.stashedCategories = structuredClone(editor.model);
    const contents = [];
    const tags = [];
    editor.model.contents.forEach((entry, index) => {
      if (entry.kind !== 'category' || entry.custom) return;
      for (const item of entry.contents ?? []) {
        contents.push(item);
        tags.push(index);
      }
    });
    editor.model = {kind: 'flyoutToolbox', contents};
    editor.flyoutTags = tags;
    const dropped = editor.stashedCategories.contents.filter((e) => e.custom);
    if (dropped.length) {
      status(
        `Hid dynamic categories: ${dropped.map((d) => d.name).join(', ')}`,
      );
    }
  } else if (from === 'flyout' && to !== 'flyout') {
    editor.model = editor.stashedCategories
      ? restoreCategories(editor.pane.lastSaveTags?.[0] ?? [])
      : {
          kind: 'categoryToolbox',
          contents: [newBlocksCategory(editor.model.contents)],
        };
    editor.stashedCategories = undefined;
  }
}

/**
 * Puts the flyout's items back into the categories they came from. An item
 * added while it was a flyout goes in the same category as the item before
 * it, or the first category. With no static category left, they go in a
 * new one.
 * @param {!Array<number|undefined>} tags Each item's original category.
 * @returns {!Object} The category toolbox.
 */
function restoreCategories(tags) {
  const model = editor.stashedCategories;
  const isStatic = (entry) => entry?.kind === 'category' && !entry.custom;
  for (const entry of model.contents) {
    if (isStatic(entry)) entry.contents = [];
  }
  let previous = model.contents.findIndex(isStatic);
  if (previous === -1 && editor.model.contents.length) {
    previous = model.contents.push(newBlocksCategory([])) - 1;
  }
  editor.model.contents.forEach((item, i) => {
    const tag = isStatic(model.contents[tags[i]]) ? tags[i] : previous;
    model.contents[tag].contents.push(item);
    previous = tag;
  });
  status('Restored the categories.');
  return model;
}

/**
 * @param {!Array<!Object>} contents Flyout item JSON.
 * @returns {!Object} A category for flyout contents that have no other.
 */
function newBlocksCategory(contents) {
  return {kind: 'category', name: 'Blocks', colour: '#888888', contents};
}

// Category and continuous toolboxes share a definition, so this only
// changes how the editor draws it.
continuousInput.addEventListener('change', () => {
  editor.commitPane();
  editor.continuous = continuousInput.checked;
  inject();
});

// A workspace's renderer is fixed when it's injected, and the palette is
// filled when its toolbox is, so both reopen the editor. This clears undo.
for (const control of [rendererSelect, testBlocksInput]) {
  control.addEventListener('change', () => {
    editor.commitPane();
    inject();
  });
}

document.getElementById('logButton').addEventListener('click', () => {
  editor.commitPane();
  console.log(JSON.stringify(editor.model, null, 2));
  status('Logged the toolbox JSON to the console.');
});

inject();
window.spikeEditor = editor;

/**
 * Hides the movable and deletable items in the editor's own workspace, as
 * they are in flyouts, and every lesson item on palette blocks and on a
 * dynamic category's read-only contents. A real version needs an option in
 * the plugin rather than wrapping its preconditions.
 */
function hideLockItemsInEditor() {
  const lockItems = [
    'lessonBlockMovable',
    'lessonBlockDeletable',
    'lessonAllBlocksMovable',
    'lessonAllBlocksDeletable',
  ];
  const allItems = [
    ...lockItems,
    'lessonBlockEditable',
    'lessonAllBlocksEditable',
    'lessonMakeShadow',
    'lessonMakeShadowsReal',
    'lessonRemoveShadows',
  ];
  for (const id of allItems) {
    const item = Blockly.ContextMenuRegistry.registry.getItem(id);
    const precondition = item.preconditionFn;
    item.preconditionFn = (scope, e) => {
      const workspace = scope.block?.workspace ?? scope.workspace;
      if (scope.block?.isInFlyout || scope.block?.readOnly) return 'hidden';
      if (workspace === editor.workspace && lockItems.includes(id)) {
        return 'hidden';
      }
      return precondition(scope, e);
    };
  }
}
