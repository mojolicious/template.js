<p align="center">
  <a href="https://mojojs.org">
    <img src="https://github.com/mojolicious/mojo.js/blob/main/docs/images/logo.png?raw=true" style="margin: 0 auto;">
  </a>
</p>

[![](https://github.com/mojolicious/template.js/workflows/test/badge.svg)](https://github.com/mojolicious/template.js/actions)
[![npm](https://img.shields.io/npm/v/@mojojs/template.svg)](https://www.npmjs.com/package/@mojojs/template)

A very fast embedded JavaScript template engine. Written in TypeScript.

```js
import Template from '@mojojs/template';

// One-off
const result = await Template.render('Hello <%= name %>!', {name: 'World'});

// Compile a function for reuse
const template = new Template('Hello <%= name%>!');
const fn = template.compile();
const result = await fn({name: 'World'});
```

## Installation

All you need is Node.js 16.0.0 (or newer).

```
$ npm install @mojojs/template
```
