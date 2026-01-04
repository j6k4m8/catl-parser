import { Position, Span, Diagnostic } from "./ast";

export type TokenKind =
    | "LBrace" | "RBrace"
    | "Bar" | "RepeatBegin" | "RepeatEnd"
    | "Colon" | "Plus" | "At"
    | "QString"
    | "Atom"
    | "Newline"
    | "EOF";

export type Token = {
    kind: TokenKind;
    value?: string;
    span: Span;
};

export function lex(input: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const tokens: Token[] = [];

    let offset = 0;
    let line = 1;
    let col = 1;

    const pos = (): Position => ({ offset, line, col });

    const advance = (n: number) => {
        for (let i = 0; i < n; i++) {
            const ch = input[offset];
            offset++;
            if (ch === "\n") { line++; col = 1; }
            else { col++; }
        }
    };

    const spanFrom = (start: Position, end: Position): Span => ({ start, end });

    const peek = (n = 0) => input[offset + n] ?? "";

    const emit = (kind: TokenKind, start: Position, end: Position, value?: string) => {
        tokens.push({ kind, span: spanFrom(start, end), value });
    };

    const isWS = (c: string) => c === " " || c === "\t" || c === "\r";
    const isNL = (c: string) => c === "\n";
    const isAtomChar = (c: string) =>
        c !== "" &&
        !isWS(c) &&
        !isNL(c) &&
        c !== "#" &&
        c !== "{" && c !== "}" &&
        c !== "|" &&
        c !== ":" &&
        c !== "+" &&
        c !== "@" &&
        c !== "\"";

    while (offset < input.length) {
        const start = pos();
        const ch = peek();

        // Comments
        if (ch === "#") {
            // skip to newline or EOF
            while (offset < input.length && peek() !== "\n") advance(1);
            continue;
        }

        // Whitespace
        if (isWS(ch)) { advance(1); continue; }

        // Newline
        if (isNL(ch)) {
            advance(1);
            emit("Newline", start, pos());
            continue;
        }

        // Multi-char tokens
        if (ch === "|" && peek(1) === ":") {
            advance(2);
            emit("RepeatBegin", start, pos());
            continue;
        }
        if (ch === ":" && peek(1) === "|") {
            advance(2);
            emit("RepeatEnd", start, pos());
            continue;
        }

        // Single-char tokens
        if (ch === "{") { advance(1); emit("LBrace", start, pos()); continue; }
        if (ch === "}") { advance(1); emit("RBrace", start, pos()); continue; }
        if (ch === "|") { advance(1); emit("Bar", start, pos()); continue; }
        if (ch === ":") { advance(1); emit("Colon", start, pos()); continue; }
        if (ch === "+") { advance(1); emit("Plus", start, pos()); continue; }
        if (ch === "@") { advance(1); emit("At", start, pos()); continue; }

        // QString
        if (ch === "\"") {
            advance(1); // consume opening quote
            let value = "";
            while (offset < input.length) {
                const c = peek();
                if (c === "\"") { // closing
                    const endBefore = pos();
                    advance(1);
                    emit("QString", start, pos(), value);
                    value = "";
                    break;
                }
                if (c === "\n" || c === "") {
                    diagnostics.push({
                        severity: "error",
                        message: "Unterminated string literal",
                        span: { start, end: pos() }
                    });
                    // emit what we have and stop string
                    emit("QString", start, pos(), value);
                    break;
                }
                if (c === "\\") {
                    const next = peek(1);
                    if (next === "\\" || next === "\"") {
                        value += next;
                        advance(2);
                        continue;
                    }
                    // unknown escape: keep char after backslash as-is, but diagnose
                    diagnostics.push({
                        severity: "warning",
                        message: `Unknown escape sequence \\${next}`,
                        span: { start: pos(), end: { ...pos(), offset: pos().offset + 2, col: pos().col + 2 } }
                    });
                    advance(1);
                    continue;
                }
                value += c;
                advance(1);
            }
            continue;
        }

        // Atom
        if (isAtomChar(ch)) {
            let s = "";
            while (isAtomChar(peek())) {
                s += peek();
                advance(1);
            }
            emit("Atom", start, pos(), s);
            continue;
        }

        // Unknown char
        diagnostics.push({
            severity: "error",
            message: `Unexpected character '${ch}'`,
            span: { start, end: { ...start, offset: start.offset + 1, col: start.col + 1 } }
        });
        advance(1);
    }

    // Ensure newline at EOF? Not required; but make parsing easier:
    const eofPos = pos();
    emit("EOF", eofPos, eofPos);

    return { tokens, diagnostics };
}
