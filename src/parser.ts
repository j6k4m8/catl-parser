import {
    FileAST, LineNode, ElementNode, HeaderNode,
    ChordSpecNode, EventSpecNode, EventGroupNode, LabelNode,
    Diagnostic, Span
} from "./ast";
import { Token, TokenKind } from "./lexer";

export function parse(tokens: Token[], lexerDiagnostics: Diagnostic[] = []): FileAST {
    const diagnostics: Diagnostic[] = [...lexerDiagnostics];
    let i = 0;
    const DEFAULT_HEADER_STRING_IDS = ["e", "B", "G", "D", "A", "E"];

    const peek = (k = 0) => tokens[i + k] ?? tokens[tokens.length - 1];
    const at = (kind: TokenKind, k = 0) => peek(k).kind === kind;
    const next = () => tokens[i++] ?? tokens[tokens.length - 1];

    const error = (message: string, span: Span) => {
        diagnostics.push({ severity: "error", message, span });
    };

    const consume = (kind: TokenKind, message?: string): Token | null => {
        if (at(kind)) return next();
        error(message ?? `Expected ${kind} but found ${peek().kind}`, peek().span);
        return null;
    };

    const parseLabel = (): LabelNode | undefined => {
        if (!at("Colon")) return undefined;
        const colon = next();
        const qs = consume("QString", "Expected quoted string after ':' for label");
        if (!qs) return undefined;
        return { kind: "Label", text: qs.value ?? "", span: { start: colon.span.start, end: qs.span.end } };
    };

    const parseHeaderLine = (): HeaderNode | null => {
        // header = "{" string-id+ "}"
        const lb = consume("LBrace");
        if (!lb) return null;

        const stringIds: string[] = [];
        // v0.1: string-ids are Atom tokens, but could also be split; simplest: parse as Atom sequence until RBrace.
        while (!at("RBrace") && !at("EOF") && !at("Newline")) {
            const t = next();
            if (t.kind === "Atom") {
                // allow {eBGDAE} as one atom; split into chars
                const v = t.value ?? "";
                for (const ch of v) stringIds.push(ch);
            } else {
                error("Expected string identifiers in header", t.span);
            }
        }

        const rb = consume("RBrace", "Expected '}' to close header");
        if (!rb) return null;

        return {
            kind: "Header",
            stringIds,
            span: { start: lb.span.start, end: rb.span.end }
        };
    };

    const parseChordSpec = (): ChordSpecNode | null => {
        // chord-spec = [ qstring ":" ] chord-token [ label ]
        // qstring is a Token QString; chord-token is Atom
        const startTok = peek();

        let name: string | undefined;
        if (at("QString") && at("Colon", 1)) {
            const qs = next();
            next(); // colon
            name = qs.value ?? "";
        }

        // chord token should be Atom
        if (!at("Atom")) return null; // not a chord spec start
        const chordTok = next();
        const voicing = chordTok.value ?? "";

        // Optional suffix label
        const annotation = parseLabel();

        const endSpan = annotation?.span.end ?? chordTok.span.end;
        return {
            kind: "ChordSpec",
            name,
            voicing,
            annotation,
            span: { start: (name ? startTok.span.start : chordTok.span.start), end: endSpan }
        };
    };

    const parseEvent = () => {
        // event = named-event | indexed-event
        // named-event: <fret><stringId> packed in Atom like "12e" or "0A"
        // indexed-event: fret "@" string-index  (tokens: Atom digit(s), At, Atom digit(s))
        const start = peek().span.start;

        // Try indexed form first: Atom At Atom
        if (at("Atom") && at("At", 1) && peek(2).kind === "Atom") {
            const fretTok = next();
            next(); // @
            const idxTok = next();
            const fret = parseInt(fretTok.value ?? "", 10);
            const idx = parseInt(idxTok.value ?? "", 10);
            if (Number.isNaN(fret) || Number.isNaN(idx)) {
                error("Invalid indexed event; expected <fret>@<index>", { start, end: idxTok.span.end });
            }
            return {
                kind: "IndexedEvent" as const,
                fret,
                stringIndex: idx,
                span: { start, end: idxTok.span.end }
            };
        }

        // Named form: Atom like 12e
        if (!at("Atom")) return null;
        const atom = next();
        const raw = atom.value ?? "";
        const m = raw.match(/^(\d+)([A-Za-z])$/);
        if (!m) {
            // Not an event
            // Step back? We cannot easily; caller should have checked. Emit diagnostic and return null.
            error(`Invalid event token '${raw}' (expected e.g. 5e or 12A or 12@1)`, atom.span);
            return null;
        }
        const fret = parseInt(m[1], 10);
        const stringId = m[2];
        return {
            kind: "NamedEvent" as const,
            fret,
            stringId,
            span: atom.span
        };
    };

    const parseEventGroup = (): EventGroupNode | null => {
        // event-group = event ("+" event)*
        const startTok = peek();
        const events = [];

        const first = parseEvent();
        if (!first) return null;
        events.push(first);

        while (at("Plus")) {
            next(); // +
            const ev = parseEvent();
            if (!ev) break;
            events.push(ev);
        }

        const end = events[events.length - 1].span.end;
        return { kind: "EventGroup", events, span: { start: startTok.span.start, end } };
    };

    const parseEventSpec = (): EventSpecNode | null => {
        const startTok = peek();
        const group = parseEventGroup();
        if (!group) return null;

        const annotation = parseLabel();
        const endSpan = annotation?.span.end ?? group.span.end;

        return {
            kind: "EventSpec",
            group,
            annotation,
            span: { start: startTok.span.start, end: endSpan }
        };
    };

    const parseElement = (): ElementNode | null => {
        if (at("Bar")) {
            const t = next();
            return { kind: "Bar", span: t.span };
        }
        if (at("RepeatBegin")) {
            const t = next();
            return { kind: "RepeatBegin", span: t.span };
        }
        if (at("RepeatEnd")) {
            const t = next();
            return { kind: "RepeatEnd", span: t.span };
        }

        // Prefer chord-spec when it looks like chord (Atom that is chord voicing)
        // But event tokens can also be Atom. Disambiguate:
        // - If Atom matches /^\d+[A-Za-z]$/ => event
        // - If Atom (or QString:Atom pattern) => chord
        // We’ll attempt chord first only when:
        //   a) starts with QString ":" Atom  (prefix name), OR
        //   b) Atom contains X/x or "(" or has length >= 4 and not matching event.
        const t0 = peek();
        const t1 = peek(1);

        if (t0.kind === "QString" && t1.kind === "Colon") {
            const chord = parseChordSpec();
            if (chord) return chord;
        }

        // If it looks like an event, parse event-spec
        if (t0.kind === "Atom") {
            const raw = t0.value ?? "";
            const looksNamedEvent = /^(\d+)([A-Za-z])$/.test(raw);
            const looksIndexedEvent = /^\d+$/.test(raw) && t1.kind === "At";
            if (looksNamedEvent || looksIndexedEvent) {
                const ev = parseEventSpec();
                if (ev) return ev;
            }
        }

        // Otherwise try chord
        const chord = parseChordSpec();
        if (chord) return chord;

        // Finally try event
        const ev = parseEventSpec();
        if (ev) return ev;

        // Unknown token; consume and diagnose
        const bad = next();
        error(`Unexpected token '${bad.kind}'`, bad.span);
        return null;
    };

    const parseStatementLine = (): LineNode => {
        const start = peek().span.start;
        const elements: ElementNode[] = [];

        while (!at("Newline") && !at("EOF")) {
            const el = parseElement();
            if (el) elements.push(el);
            else break;
        }

        const end = (elements.length ? elements[elements.length - 1].span.end : peek().span.end);
        return { kind: "StatementLine", elements, span: { start, end } };
    };

    const lines: LineNode[] = [];

    while (!at("EOF")) {
        // Skip stray Newlines
        if (at("Newline")) {
            const nl = next();
            lines.push({ kind: "EmptyLine", span: nl.span });
            continue;
        }

        const startTok = peek();

        // Header line if starts with {
        if (at("LBrace")) {
            const header = parseHeaderLine();
            if (header) {
                lines.push({ kind: "HeaderLine", header, span: { start: startTok.span.start, end: header.span.end } });
                // Support one-liners where header and statement share a line.
                if (!at("Newline") && !at("EOF")) {
                    lines.push(parseStatementLine());
                }
                if (at("Newline")) next();
            } else {
                // Invalid header: consume the rest of the line to resync and emit an empty statement.
                while (!at("Newline") && !at("EOF")) next();
                const endTok = peek();
                if (at("Newline")) next();
                lines.push({ kind: "StatementLine", elements: [], span: { start: startTok.span.start, end: endTok.span.end } });
            }
            continue;
        }

        // Otherwise parse statement line
        const stmt = parseStatementLine();
        if (at("Newline")) next();
        lines.push(stmt);
    }

    const hasHeaderLine = lines.some((line) => line.kind === "HeaderLine");
    if (!hasHeaderLine) {
        const start = tokens[0]?.span.start ?? { offset: 0, line: 1, col: 1 };
        const defaultHeader: HeaderNode = {
            kind: "Header",
            stringIds: DEFAULT_HEADER_STRING_IDS,
            span: { start, end: start }
        };
        lines.unshift({
            kind: "HeaderLine",
            header: defaultHeader,
            span: { start, end: start }
        });
    }

    return { lines, diagnostics };
}
