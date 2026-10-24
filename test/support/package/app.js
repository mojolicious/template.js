import assert from 'node:assert/strict';
import Template from '@mojojs/template';

assert.equal(await Template.render('Hello <%= name %>!', {name: 'JavaScript'}), 'Hello JavaScript!');

console.log('JavaScript consumer works');
