# @j6k4m8/catl-parser

![NPM Version](https://img.shields.io/npm/v/%40j6k4m8%2Fcatl-parser?style=for-the-badge) [![CATL Version](https://img.shields.io/badge/CATL-v0.1-blue?style=for-the-badge)](https://github.com/j6k4m8/catl)

> **Latest supported CATL version:** [v0.1](https://github.com/j6k4m8/catl)

A small TypeScript parser for [**CATL** (Chord and Tab Language)](https://github.com/j6k4m8/catl/): a compact text format for guitar chords and tab events.

This package provides:

-   a lexer + parser
-   an AST
-   diagnostics with spans (line/col)

## Install

```bash
npm i @j6k4m8/catl-parser
```

## Usage

```ts
import { parseCATL } from "@j6k4m8/catl-parser";

const src = `
# chords
"Gmin7":3x332x:"Nice chord!" | X554X5
|: X554X5 | X554X5 :|

# events
{eBGDAE}
0A:"When" 0D 5e:"you" 7B 3e+0D:"fall in love"
0@5 0@4 5@1 7@2 3@1+0@4
`;

const ast = parseCATL(src);

console.log(ast.diagnostics);
console.log(ast.lines);
```
