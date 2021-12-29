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

type Op = 'comment' | 'code' | 'escape' | 'expression' | 'line' | 'text';

interface ASTNode {
  op: Op;
  value: string;
}

type AST = ASTNode[];

const DEBUG = process.env.MOJO_TEMPLATE_DEBUG === '1';

const LINE_RE = /^(\s*)%(%|#|={1,2})?(.+?)$/;
const START_RE = /(.*?)<%(%|#|={1,2})?/y;
const END_RE = /(.*?)%>/y;
const STACK_RE = /at eval.+eval at compile.+template\.ts:\d+:\d+.+<anonymous>:(\d+):\d+/;

export default class Template {
  _ast: AST;
  _escape: EscapeFunction;
  _source: Source;

  constructor(source: string, options: TemplateOptions = {}) {
    this._escape = options.escape ?? xmlEscape;
    const lines = source.split('\n');
    this._source = {lines, name: options.name ?? 'template'};
    this._ast = optimizeTemplate(parseTemplate(lines));
  }

  compile(): TemplateFunction {
    const code = compileTemplate(this._ast);
    const source = this._source;
    const escape = this._escape;

    if (DEBUG === true) console.log(`-- Template (${source.name})\n${code}`);

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

  static render(source: string, data: Record<string, any> = {}, options?: TemplateOptions): Promise<string> {
    return new Template(source, options).compile()(data);
  }
}

function compileTemplate(ast: AST): string {
  const lines = [];

  let line = [];
  for (const node of ast) {
    const op = node.op;
    if (op === 'text') {
      line.push("__output += '" + escapeText(node.value) + "';");
    } else if (op === 'escape') {
      line.push('__output += __escape(' + sanitizeExpr(node.value) + ');');
    } else if (op === 'expression') {
      line.push('__output += ' + sanitizeExpr(node.value) + ';');
    } else if (op === 'code') {
      line.push(node.value);
    } else if (op === 'line') {
      lines.push(line.join(''));
      line = [];
    }
  }

  let source = lines.join('\n');
  source = "let __output = '';" + source + 'return __output;';
  source = 'with(__locals){' + source + '}';
  source = 'try {' + source + '} catch (error) { __context(error, __source) }';

  return source;
}

function escapeText(text: string): string {
  return text.replaceAll("'", "\\'").replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\r', '\\r');
}

function optimizeTemplate(ast: AST): AST {
  const optimized: AST = [];

  // Combine consecutive nodes with same type
  for (const node of ast) {
    const position = optimized.length - 1;
    if (position >= 0 && optimized[position].op === node.op) {
      optimized[position].value += node.value;
    } else {
      optimized.push(node);
    }
  }

  return optimized;
}

function parseLine(line: string, op: Op, isLastLine: boolean): {nodes: ASTNode[]; nextOp: Op} {
  const nodes: ASTNode[] = [];

  const sticky = {offset: 0, value: line};
  while (line.length > sticky.offset) {
    if (op !== 'text') {
      const endMatch = stickyMatch(sticky, END_RE);
      if (endMatch !== null) {
        nodes.push({op, value: endMatch[1]});
        op = 'text';
        continue;
      } else {
        nodes.push({op, value: line.slice(sticky.offset)});
        sticky.offset = line.length;
      }
    } else {
      const startMatch = stickyMatch(sticky, START_RE);
      if (startMatch !== null) {
        const leftovers = startMatch[1];
        const type = startMatch[2];
        if (leftovers !== '') nodes.push({op, value: leftovers});

        if (type === '%') {
          nodes.push({op: 'text', value: '<%'});
        } else if (type === '#') {
          op = 'comment';
        } else if (type === '=') {
          op = 'escape';
        } else if (type === '==') {
          op = 'expression';
        } else {
          op = 'code';
        }
      } else {
        nodes.push({op, value: line.slice(sticky.offset)});
        sticky.offset = line.length;
      }
    }
  }

  if (op === 'text' && isLastLine === false) nodes.push({op, value: '\n'});

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

        if (type === '%') {
          const {nodes, nextOp} = parseLine(lineMatch[1] + type + value, op, i === last);
          ast.push(...nodes);
          op = nextOp;
        } else if (type === '#') {
          ast.push({op: 'comment', value});
        } else if (type === '=') {
          ast.push({op: 'escape', value});
          if (i !== last) ast.push({op: 'text', value: '\n'});
        } else if (type === '==') {
          ast.push({op: 'expression', value});
          if (i !== last) ast.push({op: 'text', value: '\n'});
        } else {
          ast.push({op: 'code', value});
        }

        ast.push({op: 'line', value: ''});
        op = 'text';
        continue;
      }
    }

    // Mixed line
    const {nodes, nextOp} = parseLine(line, op, i === last);
    ast.push(...nodes, {op: 'line', value: ''});
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
