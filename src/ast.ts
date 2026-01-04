export type Span = {
    start: Position;
    end: Position;
};

export type Position = {
    offset: number;
    line: number;   // 1-based
    col: number;    // 1-based
};

export type Diagnostic = {
    message: string;
    span: Span;
    severity: "error" | "warning";
};

export type FileAST = {
    lines: LineNode[];
    diagnostics: Diagnostic[];
};

export type LineNode =
    | { kind: "HeaderLine"; header: HeaderNode; span: Span }
    | { kind: "StatementLine"; elements: ElementNode[]; span: Span }
    | { kind: "EmptyLine"; span: Span };

export type HeaderNode = {
    kind: "Header";
    stringIds: string[]; // in order high->low
    span: Span;
};

export type ElementNode =
    | { kind: "Bar"; span: Span }
    | { kind: "RepeatBegin"; span: Span }
    | { kind: "RepeatEnd"; span: Span }
    | ChordSpecNode
    | EventSpecNode;

export type LabelNode = {
    kind: "Label";
    text: string;
    span: Span;
};

export type ChordSpecNode = {
    kind: "ChordSpec";
    name?: string;              // prefix qstring
    voicing: string;            // raw token e.g. X(10)9(12)XX
    annotation?: LabelNode;     // suffix label
    span: Span;
};

export type EventSpecNode = {
    kind: "EventSpec";
    group: EventGroupNode;
    annotation?: LabelNode;
    span: Span;
};

export type EventGroupNode = {
    kind: "EventGroup";
    events: EventNode[];        // simultaneity set (from +)
    span: Span;
};

export type EventNode = NamedEventNode | IndexedEventNode;

export type NamedEventNode = {
    kind: "NamedEvent";
    fret: number;
    stringId: string;           // e.g. e, A, D
    span: Span;
};

export type IndexedEventNode = {
    kind: "IndexedEvent";
    fret: number;
    stringIndex: number;        // 1..N
    span: Span;
};
