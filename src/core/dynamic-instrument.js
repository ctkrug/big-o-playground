// Dynamic instrumentation: counts operations as a function actually runs
// against a given input, rather than guessing from source text alone.
//
// The static counter in instrument.js tells you how many op-sites *exist*.
// This module tells you how many of them *execute*, and how many times —
// so a loop body's cost scales with iterations and recursive calls
// accumulate across the call stack.

import { parseFunction } from './instrument.js';

const OP_NODE_TYPES = new Set([
  'BinaryExpression',
  'LogicalExpression',
  'UnaryExpression',
  'UpdateExpression',
  'CallExpression',
  'MemberExpression',
]);

const FUNCTION_TYPES = new Set([
  'FunctionExpression',
  'ArrowFunctionExpression',
  'FunctionDeclaration',
]);

function isFunctionNode(node) {
  return !!node && FUNCTION_TYPES.has(node.type);
}

/**
 * Counts op-sites within a single AST subtree, without crossing into any
 * nested function body. Nested functions (callbacks, closures) are
 * instrumented and counted separately, at the point they're actually
 * invoked — counting them here too would double-count their operations.
 */
export function countNodeOps(node) {
  let total = 0;

  function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (isFunctionNode(n)) return;
    if (OP_NODE_TYPES.has(n.type)) total += 1;

    for (const key in n) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = n[key];
      if (Array.isArray(value)) {
        for (const child of value) walk(child);
      } else if (value && typeof value.type === 'string') {
        walk(value);
      }
    }
  }

  walk(node);
  return total;
}

/**
 * Applies a list of `{ index, insert }` edits to `text` by inserting each
 * `insert` string at its `index` (a character offset into `text`, as
 * produced by acorn's `node.start`/`node.end`). Insert-only, so offsets
 * never shift: edits can be collected in any order. Multiple edits at the
 * same index are concatenated in the order they were pushed.
 */
export function applyEdits(text, edits) {
  const byIndex = new Map();
  for (const edit of edits) {
    const existing = byIndex.get(edit.index);
    if (existing) {
      existing.push(edit.insert);
    } else {
      byIndex.set(edit.index, [edit.insert]);
    }
  }

  let out = '';
  for (let i = 0; i <= text.length; i += 1) {
    const inserts = byIndex.get(i);
    if (inserts) out += inserts.join('');
    if (i < text.length) out += text[i];
  }
  return out;
}

const COUNTER_VAR = '__ops';
const ITER_VAR = '__iter';
const ITER_CAP_VAR = '__iterCap';

function opsIncrement(count) {
  return count > 0 ? `${COUNTER_VAR}+=${count};` : '';
}

const ITER_GUARD = `if(++${ITER_VAR}>${ITER_CAP_VAR}){throw new RangeError('Operation limit exceeded — likely an infinite loop or runaway recursion.');}`;

/**
 * Recursively finds function expressions nested inside a non-statement
 * expression (e.g. a callback argument, a variable-bound comparator) and
 * instruments each one's body, so operations executed inside them are
 * counted too — at the point they're actually invoked, via the shared
 * `__ops` closure variable.
 */
function findNestedFunctions(node, edits) {
  if (!node || typeof node.type !== 'string') return;
  if (isFunctionNode(node)) {
    instrumentFunctionBody(node, edits);
    return;
  }
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) findNestedFunctions(child, edits);
    } else if (value && typeof value.type === 'string') {
      findNestedFunctions(value, edits);
    }
  }
}

/**
 * Instruments a loop/if body that may or may not already be a block
 * statement. Non-block bodies (`if (x) doThing();`) get wrapped in braces
 * so a counting prefix can be inserted, without altering their behavior.
 */
function instrumentBody(body, edits, prefix) {
  if (body.type === 'BlockStatement') {
    if (prefix) edits.push({ index: body.start + 1, insert: prefix });
    instrumentBlock(body, edits);
  } else {
    if (prefix) edits.push({ index: body.start, insert: `{${prefix}` });
    else edits.push({ index: body.start, insert: '{' });
    instrumentStatement(body, edits);
    edits.push({ index: body.end, insert: '}' });
  }
}

function instrumentBlock(block, edits) {
  for (const stmt of block.body) instrumentStatement(stmt, edits);
}

/**
 * Instruments a single statement in place: inserts a counter increment
 * sized to that statement's own op-sites (excluding nested function
 * bodies), recurses into control-flow children, and wraps loop bodies
 * with an iteration cap so a runaway loop throws instead of hanging.
 */
function instrumentStatement(stmt, edits) {
  if (!stmt) return;

  switch (stmt.type) {
    case 'BlockStatement':
      instrumentBlock(stmt, edits);
      return;

    case 'IfStatement': {
      const prefix = opsIncrement(countNodeOps(stmt.test));
      if (prefix) edits.push({ index: stmt.start, insert: prefix });
      findNestedFunctions(stmt.test, edits);
      instrumentBody(stmt.consequent, edits, '');
      if (stmt.alternate) instrumentBody(stmt.alternate, edits, '');
      return;
    }

    case 'ForStatement': {
      if (stmt.init) {
        const initOps = opsIncrement(countNodeOps(stmt.init));
        if (initOps) edits.push({ index: stmt.start, insert: initOps });
        findNestedFunctions(stmt.init, edits);
      }
      let perIteration = 0;
      if (stmt.test) {
        perIteration += countNodeOps(stmt.test);
        findNestedFunctions(stmt.test, edits);
      }
      if (stmt.update) {
        perIteration += countNodeOps(stmt.update);
        findNestedFunctions(stmt.update, edits);
      }
      instrumentBody(stmt.body, edits, ITER_GUARD + opsIncrement(perIteration));
      return;
    }

    case 'WhileStatement':
    case 'DoWhileStatement': {
      const perIteration = countNodeOps(stmt.test);
      findNestedFunctions(stmt.test, edits);
      instrumentBody(stmt.body, edits, ITER_GUARD + opsIncrement(perIteration));
      return;
    }

    case 'ForInStatement':
    case 'ForOfStatement': {
      const rightOps = opsIncrement(countNodeOps(stmt.right));
      if (rightOps) edits.push({ index: stmt.start, insert: rightOps });
      findNestedFunctions(stmt.right, edits);
      instrumentBody(stmt.body, edits, ITER_GUARD);
      return;
    }

    case 'SwitchStatement': {
      const prefix = opsIncrement(countNodeOps(stmt.discriminant));
      if (prefix) edits.push({ index: stmt.start, insert: prefix });
      findNestedFunctions(stmt.discriminant, edits);
      for (const switchCase of stmt.cases) {
        if (switchCase.test) findNestedFunctions(switchCase.test, edits);
        for (const caseStmt of switchCase.consequent) instrumentStatement(caseStmt, edits);
      }
      return;
    }

    case 'TryStatement':
      instrumentBlock(stmt.block, edits);
      if (stmt.handler) instrumentBlock(stmt.handler.body, edits);
      if (stmt.finalizer) instrumentBlock(stmt.finalizer, edits);
      return;

    case 'LabeledStatement':
      instrumentStatement(stmt.body, edits);
      return;

    case 'BreakStatement':
    case 'ContinueStatement':
    case 'EmptyStatement':
    case 'DebuggerStatement':
      return;

    default: {
      // ExpressionStatement, VariableDeclaration, ReturnStatement,
      // ThrowStatement, and anything else that isn't a control structure:
      // count its own op-sites, then look for callbacks/closures inside.
      const prefix = opsIncrement(countNodeOps(stmt));
      if (prefix) edits.push({ index: stmt.start, insert: prefix });
      findNestedFunctions(stmt, edits);
    }
  }
}

/**
 * Instruments a function's body: a block statement gets each of its
 * statements instrumented in place; a concise arrow body (no braces) gets
 * wrapped in a counting comma expression instead, since there's no
 * statement list to splice into.
 */
function instrumentFunctionBody(fnNode, edits) {
  const body = fnNode.body;
  if (body.type === 'BlockStatement') {
    instrumentBlock(body, edits);
    return;
  }

  const ops = countNodeOps(body);
  if (ops > 0) {
    edits.push({ index: body.start, insert: `(${COUNTER_VAR}+=${ops},` });
    edits.push({ index: body.end, insert: ')' });
  }
  findNestedFunctions(body, edits);
}

/**
 * Transforms a function source string into an equivalent source string
 * that increments `__ops` (and checks `__iter` against `__iterCap`) as it
 * executes, without altering its observable behavior. The result is still
 * a single function expression, ready to be compiled and run.
 */
export function instrumentSource(source) {
  const wrapped = `(${source})`;
  const ast = parseFunction(source);
  const fnNode = ast.body[0].expression;

  if (!isFunctionNode(fnNode)) {
    throw new SyntaxError('Source must be a single function expression, arrow function, or declaration.');
  }

  const edits = [];
  instrumentFunctionBody(fnNode, edits);
  return applyEdits(wrapped, edits);
}
