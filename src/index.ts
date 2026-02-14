import { lex } from "./lexer";
import { parse } from "./parser";
import { FileAST } from "./ast";
export * from "./ast";

export function parseCATL(input: string): FileAST {
    const { tokens, diagnostics } = lex(input);
    return parse(tokens, diagnostics);
}
