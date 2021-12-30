import Template from '../lib/template.js';
import t from 'tap';

t.test('Template', async t => {
  await t.test('Empty template', async t => {
    const template = new Template('');
    const fn = template.compile();
    t.equal(await fn(), '');
    t.equal(await Template.render(''), '');
  });

  await t.test('String', async t => {
    t.equal(await Template.render('Just a <%= "test" %>'), 'Just a test');
    t.equal(await Template.render('Just a <%= await "test" %>'), 'Just a test');
  });

  await t.test('Expression', async t => {
    t.equal(await Template.render('<%= 1 + 1 %>'), '2');
    t.equal(await Template.render('<%== 1 + 1 %>'), '2');

    t.equal(await Template.render('%= 1 + 1'), '2');
    t.equal(await Template.render('%== 1 + 1'), '2');
    t.equal(await Template.render('  %= 1 + 1'), '2');
    t.equal(await Template.render('  %== 1 + 1'), '2');
  });

  await t.test('Code', async t => {
    t.equal(await Template.render('<% for (let i = 1; i <= 3; i++) { %><%= i %><% } %>'), '123');
  });

  await t.test('Replace code', async t => {
    t.equal(await Template.render('<%% 1 + 1 %>'), '<% 1 + 1 %>');
    t.equal(await Template.render('%% const foo = 23;'), '% const foo = 23;');
  });

  await t.test('Replace expression', async t => {
    t.equal(await Template.render('<%%= 1 + 1 %>'), '<%= 1 + 1 %>');
    t.equal(await Template.render(' lalala <%%= 1 + 1 %> 1234 '), ' lalala <%= 1 + 1 %> 1234 ');
    t.equal(await Template.render('lalala <%%= 1 +\n 1 %> 12\n34'), 'lalala <%= 1 +\n 1 %> 12\n34');

    t.equal(await Template.render('  %%= 1 + 1'), '  %= 1 + 1');
    t.equal(await Template.render('%%= 1 + 1'), '%= 1 + 1');
  });

  await t.test('Replace comment', async t => {
    t.equal(await Template.render('<%%# 1 + 1 %>'), '<%# 1 + 1 %>');
    t.equal(await Template.render('  %%# 1 + 1'), '  %# 1 + 1');
  });

  await t.test('Replace mixed', async t => {
    t.equal(
      await Template.render("%% const num = <%= 20 + 3%>;\nThe number is <%%= <%= 'n' %>um %>."),
      '% const num = 23;\nThe number is <%= num %>.'
    );
  });

  await t.test('Caught exception', async t => {
    t.equal(
      await Template.render("% try { throw new Error('test') } catch (error) {\n%= error.message\n% }"),
      'test\n'
    );
  });

  await t.test('Control structures', async t => {
    const control = `
% if (23 > 22) {
foo
% } else {
bar
% }
% if (23 > 22) {
bar
% }
% else {
foo
% }
`;
    t.equal(await Template.render(control), '\nfoo\nbar\n');
  });

  await t.test('Mixed tags', async t => {
    const control = `
<html foo="bar">
<%= num + 1 %> test <%== 2 + 2; %> lala <%# comment lalala %>
%# This is a comment!
% const i = 2;
%= i * 2;
</html>
`;
    t.equal(await Template.render(control, {num: 2}), '\n<html foo="bar">\n3 test 4 lala \n4\n</html>\n');
  });

  await t.test('Consecutive expressions', async t => {
    t.equal(await Template.render('<%== 1 + 1 %><%== 1 + 2 %>'), '23');
  });

  await t.test('Escaped multiline expression', async t => {
    t.equal(await Template.render('<%==\n"hello " \n+"world"\n%>'), 'hello world');
  });

  await t.test('Empty statement', async t => {
    t.equal(await Template.render('test\n\n123\n\n<% %>456\n789'), 'test\n\n123\n\n456\n789');
  });

  await t.test('Scoped variables', async t => {
    t.equal(await Template.render('% const foo = "bar";\n<%= foo %>\n'), 'bar\n');
  });

  await t.test('Syntax error', async t => {
    const exception = `
test
123
456
% if (true) {
%= 1 + 1
test
`;
    let result;
    try {
      await Template.render(exception);
    } catch (error) {
      result = error;
    }
    t.match(result, /SyntaxError: .+ in template/);
  });

  await t.test('Exception in template', async t => {
    const exception = `
test
123
456
  %# This dies
% throw new Error('oops!');
%= 1 + 1
test
`;
    let result;
    try {
      await Template.render(exception);
    } catch (error) {
      result = error;
    }
    t.match(result, /template:6/);
    t.match(result, / {4}4| 456/);
    t.match(result, / {4}5| {3}%# This dies/);
    t.match(result, / >> 6| % throw new Error('oops!');/);
    t.match(result, / {4}7| %= 1 + 1/);
    t.match(result, / {4}8| test/);
    t.match(result, /oops!/);
  });

  await t.test('Exception with multi-line expression', async t => {
    const exception = `
<%==
123 +
45
+ 6
%>
% throw new Error('oops!');
test
`;
    let result;
    try {
      await Template.render(exception);
    } catch (error) {
      result = error;
    }
    t.match(result, /template:7/);
    t.match(result, / {4}5| + 6/);
    t.match(result, / {4}6| %>/);
    t.match(result, / >> 7| % throw new Error('oops!');/);
    t.match(result, / {4}8| test/);
    t.match(result, / {4}9| /);
    t.match(result, /oops!/);
  });

  await t.test('Exception with escaped multi-line expression', async t => {
    const exception = `
<%=
123 +
45
+ 6
%>
% throw new Error('oops!');
test
`;
    let result;
    try {
      await Template.render(exception);
    } catch (error) {
      result = error;
    }
    t.match(result, /template:7/);
    t.match(result, / {4}5| + 6/);
    t.match(result, / {4}6| %>/);
    t.match(result, / >> 7| % throw new Error('oops!');/);
    t.match(result, / {4}8| test/);
    t.match(result, / {4}9| /);
    t.match(result, /oops!/);
  });

  await t.test('Exception with multi-line comment', async t => {
    const exception = `
<%#
123 +
45
+ 6
%>
% throw new Error('oops!');
test
`;
    let result;
    try {
      await Template.render(exception);
    } catch (error) {
      result = error;
    }
    t.match(result, /template:7/);
    t.match(result, / {4}5| + 6/);
    t.match(result, / {4}6| %>/);
    t.match(result, / >> 7| % throw new Error('oops!');/);
    t.match(result, / {4}8| test/);
    t.match(result, / {4}9| /);
    t.match(result, /oops!/);
  });

  await t.test('Exception with multi-line code', async t => {
    const exception = `
<%

const foo = 'bar';

%>
% throw new Error('oops!');
test
`;
    let result;
    try {
      await Template.render(exception);
    } catch (error) {
      result = error;
    }
    t.match(result, /template:7/);
    t.match(result, / {4}5| const foo = 'bar';/);
    t.match(result, / {4}6| /);
    t.match(result, / >> 7| % throw new Error('oops!');/);
    t.match(result, / {4}8| test/);
    t.match(result, / {4}9| /);
    t.match(result, /oops!/);
  });

  await t.test('Exception in function', async t => {
    const exception = `
test
123
456
% dies();
%= 1 + 1
test
`;
    let result;
    try {
      await Template.render(exception, {
        dies: () => {
          throw new Error('dies!');
        }
      });
    } catch (error) {
      result = error;
    }
    t.match(result, /template:5/);
    t.match(result, / {4}3| 123/);
    t.match(result, / {4}4| 456/);
    t.match(result, / >> 5| % dies()/);
    t.match(result, / {4}6| %= 1 + 1/);
    t.match(result, / {4}7| test/);
    t.match(result, /dies!/);
  });

  await t.test('Exception in first line', async t => {
    let result;
    try {
      await Template.render('% dies();', {
        dies: () => {
          throw new Error('dies!');
        }
      });
    } catch (error) {
      result = error;
    }
    t.match(result, / >> 1| % dies()/);
    t.match(result, /dies!/);
  });

  await t.test('Exception with different name', async t => {
    const template = new Template('<% throw new Error("works!"); %>', {name: 'src/template.mt'});
    const fn = template.compile();
    let result;
    try {
      await fn();
    } catch (error) {
      result = error;
    }
    t.match(result, / >> 1| <% throw new Error("works!") %>/);
    t.match(result, /src\/template\.mt/);
  });

  await t.test('Custom escape function', async t => {
    const template = new Template('<%= "hi" %>', {
      escape: function (input) {
        return `+${input}`;
      }
    });
    const fn = template.compile();
    t.equal(await fn(), '+hi');
  });
});
