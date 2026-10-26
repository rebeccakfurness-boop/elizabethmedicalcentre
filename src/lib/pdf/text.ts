const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

/** The built-in PDF fonts only cover Latin-1, so ×10⁹/L would print as ×10y/L and SpO₂ as SpO?. */
export function pdfText(value: string): string {
  return value
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => '^' + [...m].map((c) => SUPERSCRIPT.indexOf(c)).join(''))
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String(SUBSCRIPT.indexOf(c)))
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[^\u0000-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/g, '');
}
