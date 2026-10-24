import assert from 'node:assert/strict';
import {tmpl} from '@mojojs/template';

const output: string = await tmpl`Hello <%= name %>!`.render({name: 'TypeScript'});
assert.equal(output, 'Hello TypeScript!');

console.log('TypeScript consumer works');
