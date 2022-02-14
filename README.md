<p align="center">
  <a href="https://mojojs.org">
    <img src="https://github.com/mojolicious/mojo.js/blob/main/docs/images/logo.png?raw=true" style="margin: 0 auto;">
  </a>
</p>

[![](https://github.com/mojolicious/template.js/workflows/test/badge.svg)](https://github.com/mojolicious/template.js/actions)
[![npm](https://img.shields.io/npm/v/@mojojs/template.svg)](https://www.npmjs.com/package/@mojojs/template)

A very fast embedded JavaScript template engine for [Node.js](https://nodejs.org/). Written in TypeScript.

```js
import Template from '@mojojs/template';

// One-off
const result = await Template.render('Hello <%= name %>!', {name: 'World'});

// Compile a function for reuse
const template = new Template('Hello <%= name %>!');
const fn = template.compile();
const result = await fn({name: 'World'});

// Use a custom escape function and name
const escape = function (input) { return `"${input}"` };
const template = new Template('Date: <%= date %>', {escape, name: 'now.mt'});
const fn = template.compile();
const result = await fn({date: new Date()});
```

For easier syntax highlighting of templates embedded in JavaScript and TypeScript code, there is also an `mt` tagged
template literal available.

```js
import {mt} from '@mojojs/template';

const template = mt`Hello <%= name %>!`;
const fn = template.compile();
const result = await fn({name: 'World'});
```

### Syntax

All templates are compiled to `async` functions, so you can safely use `await`.

```
<% JavaScript code %>
<%= JavaScript expression, replaced with XML escaped result %>
<%== JavaScript expression, replaced with result %>
<%# Comment, useful for debugging %>
<%% Replaced with "<%", useful for generating templates %>
% JavaScript code line, treated as "<% line =%>" (explained later)
%= JavaScript expression line, treated as "<%= line %>"
%== JavaScript expression line, treated as "<%== line %>"
%# Comment line, useful for debugging
%% Replaced with "%", useful for generating templates
```

JavaScript lines can be indented freely.

```
<!DOCTYPE html>
<html>
  <head>
    <title><%= title %></title>
    %== metaTags
  </head>
  <body>
    %= content
  </body>
</html
```

Expressions and code blocks can also be split up over multiple lines.

```
<div><%= 'Hello '
         + randomName + '!' %></div>
```

Whitespace characters around tags can be trimmed by adding an additional equal sign to the end of a tag.

```
<% for (let i = 1; i <= 3; i++) { =%>
  <%= 'The code blocks around this expression are not visible in the output' %>
<% } =%>
```

Code lines are automatically trimmed and always completely invisible in the output.

```
% for (let i = 1; i <= 3; i++) {
  <%= 'The code lines around this expression are not visible in the output' %>
% }
```

You can also capture whole template blocks as `async` functions for reuse later with `<{blockName}>` and
`<{/blockName}>` tags. Similar to code lines, these tags are automatically trimmed and invisible in the output. The use
of named parameters is optional.

```
<{helloBlock(name)}>
  Hello <%= name %>.
<{/helloBlock}>
<%= await helloBlock('Baerbel') %>
<%= await helloBlock('Wolfgang') %>
```

To generate template blocks you can use `<{{blockName}}>` and `<{{/blockName}}>` tags.

### Debugging

To help with debugging, all thrown exceptions are expanded with context information whenever possible. This does not
incur a performance penalty, and therfore does not need to be disabled in production.

```
Error: template:7
    5| </div>
    6| <div>
 >> 7| % throw new Error('Something went wrong...');
    8| <main>
    9|
Something went wrong...
    at eval (eval at compile (file:///home/kraih/repo/template.js/src/template.ts:53:18), <anonymous>:9:8)
    at file:///home/kraih/repo/template.js/src/template.ts:55:19
    at Function.render (file:///home/kraih/repo/template.js/src/template.ts:64:51)
    at Test.<anonymous> (file:///home/kraih/repo/template.js/test/template.js:191:24)
    at TapWrap.runInAsyncScope (node:async_hooks:199:9)
    ...
```

The generated code for template functions is usually quite efficient, but to avoid possible syntax errors it's good to
be aware of its general structure. Especially with regard to where the use of semicolons is required.

```
<% const message = 'World'; %>
Hello
<%= message %>!
```
```js
try { with(__locals){ let __output = ''; const message = 'World';
__output += 'Hello\n';
__output += __escape(message); __output += '!\n'; return __output; } } catch (error) { __context(error, __source) }
```

You can set the `MOJO_TEMPLATE_DEBUG=1` environment variable to get the generated code printed to `STDERR`.

### Editor Support

* [Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=kraih.javascript-mt-support)

## Installation

All you need is Node.js 16.0.0 (or newer).

```
$ npm install @mojojs/template
```
