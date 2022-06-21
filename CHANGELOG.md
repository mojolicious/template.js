
# Changelog

## v2.1.0 (2022-06-21)

### Features

  * Switched to [@mojojs/util](https://www.npmjs.com/package/@mojojs/util) for utility functions.

## v2.0.0 (2022-06-10)

### Breaking Changes

  * Renamed `mt` template literal to `tmpl`.

## v1.7.0 (2022-02-26)

### Features

  * Made `SafeString` a proper subclass of `String`.

## v1.6.0 (2022-02-15)

### Features

  * Made whitespace trimming significantly smarter.

## v1.5.0 (2022-02-14)

### Features

  * Added support for generating template blocks with `<{{helloBlock}}>Hello World!<{{/helloBlock}}>`.

## v1.4.0 (2022-02-13)

### Features

  * Made template blocks easier to reuse by wrapping them in `SafeString` objects.

## v1.3.0 (2022-02-12)

### Features

  * Added support for reusable template blocks (`<{helloBlock}>Hello World!<{/helloBlock}>`).

## v1.2.0 (2022-01-01)

### Features

  * Added `mt` tagged template literal support.

## v1.1.0 (2021-12-31)

### Features

  * Added support for newline trimming.

## v1.0.0 (2021-12-30)

First major release. This package strictly follows [Semantic Versioning](https://semver.org).
