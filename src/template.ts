/*!
 * template.js
 * Copyright (C) 2021 Sebastian Riedel
 * MIT Licensed
 */
import {AsyncFunction, stickyMatch, xmlEscape} from './util.js';
export * from './util.js';

type EscapeFunction = (text: string) => string;
type TemplateFunction = (data?: Record<string, any>) => Promise<string>;

interface TemplateOptions {
  escape?: EscapeFunction;
  name?: string;
}

interface Source {
  lines: string[];
  name: string;
}

type Op = 'code' | 'comment' | 'end' | 'escape' | 'expression' | 'line' | 'text';

interface ASTNode {
  op: Op;
  value: string;
}

type AST = ASTNode[];

const DEBUG = process.env.MOJO_TEMPLATE_DEBUG === '1';

const LINE_RE = /^(\s*)%(%|#|={1,2})?(.*?)$/;
const START_RE = /(.*?)<%(%|#|={1,2})?/y;
const END_RE = /(.*?)%>/y;
const STACK_RE = /at eval.+eval at compile.+template\.ts:\d+:\d+.+<anonymous>:(\d+):\d+/;

/**
 * Template class.
 */
export default class Template {
  _ast: AST;
  _escape: EscapeFunction;
  _source: Source;

  constructor(source: string, options: TemplateOptions = {}) {
    this._escape = options.escape ?? xmlEscape;
    const lines = source.split('\n');
    this._source = {lines, name: options.name ?? 'template'};
    this._ast = parseTemplate(lines);
  }

  /**
   * Compile template to an async function.
   */
  compile(): TemplateFunction {
    const code = compileTemplate(this._ast);
    const source = this._source;
    const escape = this._escape;

    if (DEBUG === true) console.warn(`-- Template (${source.name})\n${code}`);

    try {
      const fn = new AsyncFunction('__locals', '__source', '__context', '__escape', code);
      return function (data = {}): Promise<string> {
        return fn.apply(null, [data, source, throwWithContext, escape]);
      };
    } catch (error) {
      if (error instanceof SyntaxError) error.message += ` in ${source.name}`;
      throw error;
    }
  }

  /**
   * Render template.
   */
  static render(source: string, data: Record<string, any> = {}, options?: TemplateOptions): Promise<string> {
    return new Template(source, options).compile()(data);
  }
}

function appendNodes(ast: AST, ...nodes: AST): void {
  for (const node of nodes) {
    const position = ast.length - 1;
    if (position >= 0 && ast[position].op === node.op) {
      ast[position].value += node.value;
    } else {
      ast.push(node);
    }
  }
}

function compileTemplate(ast: AST): string {
  let source = '';

  for (let i = 0; i < ast.length; i++) {
    const node = ast[i];

    // Expression
    const op = node.op;
    if (op === 'escape' || op === 'expression') {
      let value = node.value;

      // Multi-line expression (requires look-ahead)
      while (ast[i + 1] !== undefined) {
        const lineNode = ast[i + 1];
        if (lineNode.op === 'line') {
          const exprNode = ast[i + 2];
          if (exprNode !== undefined && exprNode.op === op) {
            value += '\n' + exprNode.value;
            i += 2;
            continue;
          }
        }
        break;
      }

      value = sanitizeExpr(value);
      source += op === 'escape' ? `__output += __escape(${value});` : `__output += ${value};`;
    }

    // Text
    else if (op === 'text') {
      source += `__output += '${escapeText(node.value)}';`;
    }

    // Code
    else if (op === 'code') {
      source += node.value;
    }

    // Newline
    else if (op === 'line') {
      source += '\n';
    }
  }

  source = `let __output = ''; ${source} return __output;`;
  source = `with(__locals){ ${source} }`;
  source = `try { ${source} } catch (error) { __context(error, __source) }`;

  return source;
}

function escapeText(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '\\r');
}

function parseLine(line: string, op: Op, isLastLine: boolean): {nodes: AST; nextOp: Op} {
  const nodes: AST = [];

  const sticky = {offset: 0, value: line};
  while (line.length > sticky.offset) {
    // Tag end
    if (op !== 'text') {
      const endMatch = stickyMatch(sticky, END_RE);
      if (endMatch !== null) {
        appendNodes(nodes, {op, value: endMatch[1]}, {op: 'end', value: ''});
        op = 'text';
        continue;
      } else {
        appendNodes(nodes, {op, value: line.slice(sticky.offset)});
        sticky.offset = line.length;
      }
    }

    // Tag start
    else {
      const startMatch = stickyMatch(sticky, START_RE);
      if (startMatch !== null) {
        const leftovers = startMatch[1];
        const type = startMatch[2];
        if (leftovers !== '') appendNodes(nodes, {op, value: leftovers});

        // Replacement
        if (type === '%') {
          appendNodes(nodes, {op: 'text', value: '<%'});
        } else {
          // Comment
          if (type === '#') {
            op = 'comment';
          }

          // Escaped expression
          else if (type === '=') {
            op = 'escape';
          }

          // Expression
          else if (type === '==') {
            op = 'expression';
          }

          // Code
          else {
            op = 'code';
          }
          appendNodes(nodes, {op, value: ''});
        }
      } else {
        appendNodes(nodes, {op, value: line.slice(sticky.offset)});
        sticky.offset = line.length;
      }
    }
  }

  // Newline
  if (op === 'text' && isLastLine === false) appendNodes(nodes, {op, value: '\n'});

  return {nodes, nextOp: op};
}

function parseTemplate(lines: string[]): AST {
  const ast: AST = [];

  const numLines = lines.length;
  const last = numLines - 1;

  let op: Op = 'text';
  for (let i = 0; i < numLines; i++) {
    const line = lines[i];

    // JavaScript line
    if (op === 'text') {
      const lineMatch = line.match(LINE_RE);
      if (lineMatch !== null) {
        const type = lineMatch[2];
        const value = lineMatch[3];

        // Replacement
        if (type === '%') {
          const {nodes, nextOp} = parseLine(lineMatch[1] + type + value, op, i === last);
          appendNodes(ast, ...nodes);
          op = nextOp;
        }

        // Comment
        else if (type === '#') {
          appendNodes(ast, {op: 'comment', value});
        }

        // Escaped expression
        else if (type === '=') {
          appendNodes(ast, {op: 'escape', value});
          if (i !== last) appendNodes(ast, {op: 'text', value: '\n'});
        }

        // Expression
        else if (type === '==') {
          appendNodes(ast, {op: 'expression', value});
          if (i !== last) appendNodes(ast, {op: 'text', value: '\n'});
        }

        // Code
        else {
          appendNodes(ast, {op: 'code', value});
        }

        // Newline
        appendNodes(ast, {op: 'end', value: ''}, {op: 'line', value: ''});
        op = 'text';
        continue;
      }
    }

    // Empty line
    else if (line === '') {
      appendNodes(ast, {op, value: ''}, {op: 'line', value: ''});
      continue;
    }

    // Mixed line
    const {nodes, nextOp} = parseLine(line, op, i === last);
    appendNodes(ast, ...nodes, {op: 'line', value: ''});
    op = nextOp;
  }

  return ast;
}

function sanitizeExpr(expr: string): string {
  return expr.replace(/;\s*$/, '');
}

function throwWithContext(error: Error, source: Source): void {
  const {lines, name} = source;

  const stack = error.stack ?? '';
  const stackMatch = stack.match(STACK_RE);
  if (stackMatch === null) throw error;
  const line = parseInt(stackMatch[1]) - 2;

  const start = Math.max(line - 3, 0);
  const end = Math.min(line + 2, lines.length);

  const context = [];
  const snippet = lines.slice(start, end);
  for (let i = 0; i < snippet.length; i++) {
    const num = start + 1 + i;
    context.push((num === line ? ' >> ' : '    ') + `${num}| ${snippet[i]}`);
  }

  error.message = `${name}:${line}\n${context.join('\n')}\n\n${error.message}`;

  throw error;
}
