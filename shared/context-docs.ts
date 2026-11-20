/** The brand's context documents, in the order the app lists them. The web checks ?doc= against this list. */
export type ContextDocKind = "product-information" | "marketing-strategy" | "competitor-analysis" | "brand-voice" | "content-strategy";

export const DOC_KINDS: readonly ContextDocKind[] = ["product-information", "marketing-strategy", "competitor-analysis", "brand-voice", "content-strategy"];
