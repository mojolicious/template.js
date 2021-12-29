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
const template = new Template('Hello <%= name%>!');
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
% JavaScript code line, treated as "<% line %>"
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

## Installation

All you need is Node.js 16.0.0 (or newer).

```
$ npm install @mojojs/template
```
