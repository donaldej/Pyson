'use strict';
const { evaluateArguments, argumentOrder } = require('./builtin-arguments');

const procedures = ['start_dialogue', 'start_choices', 'update_dialogue', 'close_dialogue', 'dialogue_speaker', 'dialogue_portrait'];
const queries = ['dialogue_active', 'dialogue_waiting', 'dialogue_finished', 'choices_active', 'choices_finished', 'choices_cancelled', 'choices_result', 'choices_selected'];
const names = [...procedures, ...queries];

function emitDialogue(node, context, helpers, dialogue, graphics) {
  const { fail, expression, numeric, literalNumber, typeOf, label, stringLabel } = helpers;
  if (!names.includes(node.name)) return null;
  dialogue.enabled = true;
  graphics.window = true;
  if (['dialogue_speaker', 'dialogue_portrait'].includes(node.name)) {
    dialogue.portraits = true; graphics.portraits = true;
    if (node.name === 'dialogue_speaker') {
      if (node.args.length !== 1 || node.args[0].type !== 'string' || node.args[0].value.length < 1 || node.args[0].value.length > 14 || /[\r\n]/.test(node.args[0].value)) fail(node, 'dialogue_speaker expects a single-line literal name of 1..14 characters');
      return [`    ld hl, ${stringLabel(node.args[0].value, node)}`, '    call DialogueSpeaker', '    ld hl, 0'];
    }
    if (node.args.length < 1 || node.args.length > 3) fail(node, 'dialogue_portrait expects (sheet[, frame[, palette]])');
    const args = [node.args[0], node.args[1] || { type: 'number', value: 0 }, node.args[2] || { type: 'number', value: 0 }];
    for (const arg of args) numeric(arg, context);
    const code = evaluateArguments(node, args, context, expression);
    for (let i = 2; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
    return [...code, '    call DialoguePortrait', '    ld hl, 0'];
  }
  if (node.name === 'start_choices' || node.name.startsWith('choices_')) dialogue.choicesEnabled = true;
  if (node.name === 'start_choices') {
    if (node.args.length < 1 || node.args.length > 5 || node.args[0].type !== 'list') fail(node, 'start_choices expects a literal list of 1..4 labels and optional palette, selected_palette, default, cancel options');
    const labels = node.args[0].items;
    if (labels.length < 1 || labels.length > 4 || labels.some(item => item.type !== 'string' || !item.value.trim() || item.value.length > 16 || /[\r\n]/.test(item.value))) fail(node, 'Choice labels must be 1..16 characters, nonblank, single-line literal strings; use 1..4 labels');
    const table = label('choices_table');
    dialogue.choiceTables ||= [];
    dialogue.choiceTables.push({ label: table, labels: labels.map(item => stringLabel(item.value, item)) });
    const defaults = [null, 0, 0, 0, 1];
    const optionNames = ['labels', 'palette', 'selected_palette', 'default', 'cancel'];
    const args = defaults.map(value => ({ type: 'number', value, line: node.line }));
    const order = [];
    const seen = new Set();
    let named = false;
    for (let i = 1; i < node.args.length; i++) {
      const arg = node.args[i];
      if (arg.type !== 'keyword' && named) fail(arg, 'Positional arguments must precede named choice options');
      const index = arg.type === 'keyword' ? optionNames.indexOf(arg.name) : i;
      if (index < 1 || seen.has(index)) fail(arg, 'Unknown or duplicate choice option');
      named ||= arg.type === 'keyword';
      seen.add(index);
      order.push(index);
      args[index] = arg.type === 'keyword' ? arg.expression : arg;
    }
    for (let i = 1; i <= 4; i++) {
      numeric(args[i], context);
      const value = literalNumber(args[i]);
      const max = i === 3 ? labels.length - 1 : 7;
      if (i < 4 && value !== null && (value < 0 || value > max)) fail(args[i], `Choice ${optionNames[i]} must be 0..${max}`);
      if (!seen.has(i)) order.push(i);
    }
    const code = [];
    // Literal labels have no side effects; evaluate option expressions in source order.
    const evaluationOrder = node.argumentOrder ? argumentOrder(node, args).filter(index => index !== 0) : order;
    for (const index of evaluationOrder) code.push(...expression(args[index], context), '    push hl');
    for (const index of [...evaluationOrder].reverse()) code.push('    pop hl', '    ld a, l', `    ld [wArg${index}], a`, '    ld a, h', `    ld [wArg${index} + 1], a`);
    code.push(`    ld hl, ${table}`, '    ld a, l', '    ld [wArg0], a', '    ld a, h', '    ld [wArg0 + 1], a', '    call StartChoices', '    ld hl, 0');
    return code;
  }
  if (node.name.startsWith('choices_')) {
    if (node.args.length) fail(node, `${node.name} expects no arguments`);
    const routine = { choices_active: 'ChoicesActive', choices_finished: 'ChoicesFinished', choices_cancelled: 'ChoicesCancelled', choices_result: 'ChoicesResult', choices_selected: 'ChoicesSelected' }[node.name];
    return [`    call ${routine}`];
  }
  if (node.name !== 'start_dialogue') {
    if (node.args.length) fail(node, `${node.name} expects no arguments`);
    if (queries.includes(node.name)) {
      const variable = { dialogue_active: 'wDialogueActive', dialogue_waiting: 'wDialogueWaiting', dialogue_finished: 'wDialogueFinished' }[node.name];
      return [`    ld a, [${variable}]`, '    ld l, a', '    ld h, 0'];
    }
    return [`    call ${node.name === 'update_dialogue' ? 'UpdateDialogue' : 'CloseDialogue'}`, '    ld hl, 0'];
  }
  if (node.args.length < 1 || node.args.length > 3 || node.args[0].type === 'keyword' || typeOf(node.args[0], context.scope) !== 'string') fail(node, 'start_dialogue expects (text[, speed=2, palette=0]); text must be a string');
  const args = [node.args[0], { type: 'number', value: 2, line: node.line }, { type: 'number', value: 0, line: node.line }];
  const assigned = new Set();
  const order = [0];
  let named = false;
  for (let i = 1; i < node.args.length; i++) {
    const arg = node.args[i];
    if (arg.type !== 'keyword' && named) fail(arg, 'Positional arguments must precede named dialogue options');
    const index = arg.type === 'keyword' ? { speed: 1, palette: 2 }[arg.name] : i;
    if (!index || assigned.has(index)) fail(arg, 'Unknown or duplicate dialogue option; use speed or palette');
    named ||= arg.type === 'keyword';
    assigned.add(index);
    order.push(index);
    args[index] = arg.type === 'keyword' ? arg.expression : arg;
  }
  for (const [index, max] of [[1, 255], [2, 7]]) {
    numeric(args[index], context);
    const value = literalNumber(args[index]);
    if (value !== null && (value < 0 || value > max)) fail(args[index], `Dialogue ${index === 1 ? 'speed' : 'palette'} must be 0..${max}`);
  }
  const code = [];
  for (const index of [1, 2]) if (!assigned.has(index)) order.push(index);
  const evaluationOrder = node.argumentOrder ? argumentOrder(node, args) : order;
  for (const index of evaluationOrder) code.push(...expression(args[index], context), '    push hl');
  for (const index of [...evaluationOrder].reverse()) code.push('    pop hl', '    ld a, l', `    ld [wArg${index}], a`, '    ld a, h', `    ld [wArg${index} + 1], a`);
  return [...code, '    call StartDialogue', '    ld hl, 0'];
}
module.exports = { names, procedures, emitDialogue };
