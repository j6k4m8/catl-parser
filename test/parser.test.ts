import { describe, it, expect } from "vitest";
import { parseCATL } from "../src/index";

describe("CATL parser", () => {
    it("parses chord specs with prefix name + suffix annotation", () => {
        const src = `"Gmin7":3x332x:"Nice chord!"\n`;
        const ast = parseCATL(src);

        expect(ast.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);

        const line = ast.lines[0];
        expect(line.kind).toBe("StatementLine");

        // @ts-expect-error narrow
        const el = line.elements[0];
        expect(el.kind).toBe("ChordSpec");
        // @ts-expect-error narrow
        expect(el.name).toBe("Gmin7");
        // @ts-expect-error narrow
        expect(el.voicing).toBe("3x332x");
        // @ts-expect-error narrow
        expect(el.annotation?.text).toBe("Nice chord!");
    });

    it("parses headers and named-string events with labels", () => {
        const src = `{eBGDAE}\n0A:"When" 0D 5e:"you"\n`;
        const ast = parseCATL(src);

        expect(ast.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);

        expect(ast.lines[0].kind).toBe("HeaderLine");
        // @ts-expect-error narrow
        expect(ast.lines[0].header.stringIds.join("")).toBe("eBGDAE");

        const stmt = ast.lines[1];
        expect(stmt.kind).toBe("StatementLine");
        // @ts-expect-error narrow
        const e0 = stmt.elements[0];
        expect(e0.kind).toBe("EventSpec");
        // @ts-expect-error narrow
        expect(e0.group.events[0].kind).toBe("NamedEvent");
        // @ts-expect-error narrow
        expect(e0.group.events[0].fret).toBe(0);
        // @ts-expect-error narrow
        expect(e0.group.events[0].stringId).toBe("A");
        // @ts-expect-error narrow
        expect(e0.annotation?.text).toBe("When");
    });

    it("parses indexed-string events and simultaneity", () => {
        const src = `{eBGDAE}\n3@1+0@4:"fall in love"\n`;
        const ast = parseCATL(src);

        expect(ast.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);

        const stmt = ast.lines[1];
        expect(stmt.kind).toBe("StatementLine");
        // @ts-expect-error narrow
        const spec = stmt.elements[0];
        expect(spec.kind).toBe("EventSpec");
        // @ts-expect-error narrow
        expect(spec.group.events).toHaveLength(2);
        // @ts-expect-error narrow
        expect(spec.group.events[0].kind).toBe("IndexedEvent");
        // @ts-expect-error narrow
        expect(spec.group.events[0].fret).toBe(3);
        // @ts-expect-error narrow
        expect(spec.group.events[0].stringIndex).toBe(1);
        // @ts-expect-error narrow
        expect(spec.annotation?.text).toBe("fall in love");
    });

    it("parses bars and repeats", () => {
        const src = `|: X554X5 | X554X5 :|\n`;
        const ast = parseCATL(src);

        expect(ast.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);

        const stmt = ast.lines[0];
        expect(stmt.kind).toBe("StatementLine");
        // @ts-expect-error narrow
        const kinds = stmt.elements.map(e => e.kind);
        expect(kinds).toEqual([
            "RepeatBegin",
            "ChordSpec",
            "Bar",
            "ChordSpec",
            "RepeatEnd"
        ]);
    });

    it("produces diagnostics on bad input", () => {
        const src = `"Gmin7":3x332x:"unterminated\n`;
        const ast = parseCATL(src);

        expect(ast.diagnostics.length).toBeGreaterThan(0);
    });
});
