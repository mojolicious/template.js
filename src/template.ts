/*!
 * template.js
 * Copyright (C) 2021-2022 Sebastian Riedel
 * MIT Licensed
 */
import {AsyncFunction, SafeString, stickyMatch, xmlEscape} from './util.js';
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

type Op = 'blockStart' | 'blockEnd' | 'code' | 'comment' | 'end' | 'escape' | 'expression' | 'line' | 'text';

interface ASTNode {
  hints?: string;
  op: Op;
  value: string;
}

type AST = ASTNode[];

const DEBUG = process.env.MOJO_TEMPLATE_DEBUG === '1';

const LINE_RE = /^(\s*)%(%|#|={1,2})?(.*?)$/;
const START_RE = /(.*?)<%(%|#|={1,2})?/y;
const END_RE = /(.*?)(=)?%>/y;
const STACK_RE = /at eval.+eval at _compileFn.+template\.ts:\d+:\d+.+<anonymous>:(\d+):\d+/;

const BLOCK_NAME = '(/?)(\\w+)(?:\\s*\\(([^}]*)\\))?';
const BLOCK_RE = new RegExp(`^(.*?)<\\{${BLOCK_NAME}\\}>(.*?)$`);
const BLOCK_REPLACE_RE = new RegExp(`<\\{\\{${BLOCK_NAME}\\}\\}>`, 'g');

/**
 * Template class.
 */
export default class Template {
  _escape: EscapeFunction;
  _fn: TemplateFunction | undefined = undefined;
  _source: Source;

  constructor(template: string | Template, options: TemplateOptions = {}) {
    if (typeof template === 'string') {
      this._escape = options.escape ?? xmlEscape;
      this._source = {lines: template.split(/\r?\n/), name: options.name ?? 'template'};
    } else {
      this._escape = options.escape ?? template._escape;
      const source = template._source;
      this._source = {lines: source.lines, name: options.name ?? source.name};
    }
  }

  /**
   * Compile template to an async function.
   */
  compile(): TemplateFunction {
    if (this._fn === undefined) {
      const source = this._source;
      this._fn = this._compileFn(compileTemplate(parseTemplate(source.lines)), this._escape, source);
    }
    return this._fn;
  }

  /**
   * Render template.
   */
  render(data: Record<string, any> = {}): Promise<string> {
    return this.compile()(data);
  }

  /**
   * Render template.
   */
  static render(
    template: string | Template,
    data: Record<string, any> = {},
    options?: TemplateOptions
  ): Promise<string> {
    return new Template(template, options).compile()(data);
  }

  _compileFn(code: string, escape: EscapeFunction, source: Source): TemplateFunction {
    if (DEBUG === true) process.stderr.write(`-- Template (${source.name})\n${code}`);

    try {
      const fn = new AsyncFunction('__locals', '__source', '__context', '__escape', '__safe', code);
      return function (data = {}): Promise<string> {
        return fn.apply(null, [data, source, throwWithContext, escape, safe]);
      };
    } catch (error) {
      if (error instanceof SyntaxError) error.message += ` in ${source.name}`;
      throwWithContext(error as Error, source);
    }
  }
}

export function mt(strings: string[], ...values: string[]): Template {
  let template = '';
  for (let i = 0; i < strings.length; i++) {
    template += strings[i] ?? '' + values[i] ?? '';
  }
  return new Template(template);
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

function blockReplace(...match: RegExpMatchArray): string {
  return '<{' + match[1] + (match[3] === undefined ? match[2] : `${match[2]}(${match[3]})`) + '}>';
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

    // Block start
    else if (op === 'blockStart') {
      source += `const ${node.value} = async (${node.hints ?? ''}) => { let __output = '';`;
    }

    // Block end
    else if (op === 'blockEnd') {
      source += 'return __safe(__output); };';
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

function parseBlock(text: string, op: Op): AST {
  if (text === '') return [];
  if (op !== 'text') return [{op, value: text}];

  const blockMatch = text.match(BLOCK_RE);
  if (blockMatch === null) return [{op, value: text.replaceAll(BLOCK_REPLACE_RE, blockReplace)}];

  const node: ASTNode = {op: blockMatch[2] === '/' ? 'blockEnd' : 'blockStart', value: blockMatch[3]};
  if (blockMatch[4] !== '') node.hints = blockMatch[4];

  const prefix = blockMatch[1];
  const prefixNodes = prefix.match(/^\s*$/) ? [] : parseBlock(prefix, op);

  return [...prefixNodes, node, ...parseBlock(blockMatch[5], op)];
}

function parseLine(line: string, op: Op, isLastLine: boolean): {nodes: AST; nextOp: Op} {
  const nodes: AST = [];

  let trim = false;
  const length = line.length;
  const sticky = {offset: 0, value: line};
  while (length > sticky.offset) {
    // Tag end
    if (op !== 'text') {
      const endMatch = stickyMatch(sticky, END_RE);
      if (endMatch !== null) {
        if (endMatch[2] === '=' && length === sticky.offset) trim = true;
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
        if (leftovers !== '') appendNodes(nodes, ...parseBlock(leftovers, op));

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
        appendNodes(nodes, ...parseBlock(line.slice(sticky.offset), op));
        sticky.offset = line.length;
      }
    }
  }

  // Trim blocks
  if (nodes.length > 0) {
    const lastOp = nodes[nodes.length - 1].op;
    if (lastOp === 'blockStart' || lastOp === 'blockEnd') trim = true;
  }

  // Newline
  if (op === 'text' && trim === false && isLastLine === false) appendNodes(nodes, {op, value: '\n'});

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

function safe(safe: string): SafeString {
  return new SafeString(safe);
}

function sanitizeExpr(expr: string): string {
  return expr.replace(/;\s*$/, '');
}

function throwWithContext(error: Error, source: Source): never {
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
