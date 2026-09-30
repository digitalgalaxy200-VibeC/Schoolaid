import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractDocxText, sniffDocumentKind } from "../document-upload";

const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

const docx = (documentXml: string) => zipSync({ "word/document.xml": strToU8(documentXml) });

describe("sniffDocumentKind", () => {
  it("recognises a PDF by its signature", () => {
    expect(sniffDocumentKind(ascii("%PDF-1.7\n..."))).toBe("pdf");
  });

  it("recognises a .docx as a zip container", () => {
    expect(sniffDocumentKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toBe("docx");
  });

  it("recognises a legacy .doc (OLE container)", () => {
    expect(sniffDocumentKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toBe("legacy_doc");
  });

  it("refuses anything else", () => {
    expect(sniffDocumentKind(ascii("just some text"))).toBe("unknown");
    expect(sniffDocumentKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("unknown");
  });
});

describe("extractDocxText", () => {
  it("extracts paragraphs, joining runs and decoding entities", () => {
    const xml = [
      '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>',
      "<w:p><w:r><w:t>1. What is </w:t></w:r><w:r><w:t>5 &amp; 4?</w:t></w:r></w:p>",
      "<w:p><w:r><w:t>A. 9  B. 20  C. 25</w:t></w:r></w:p>",
      "</w:body></w:document>",
    ].join("");
    expect(extractDocxText(docx(xml))).toBe("1. What is 5 & 4?\nA. 9  B. 20  C. 25");
  });

  it("decodes numeric character references", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>caf&#233; &#x41;</w:t></w:r></w:p></w:body></w:document>";
    expect(extractDocxText(docx(xml))).toBe("café A");
  });

  it("ignores empty paragraphs and collapses blank runs", () => {
    const xml =
      "<w:document><w:body>" +
      "<w:p><w:r><w:t>A</w:t></w:r></w:p><w:p/><w:p/><w:p><w:r><w:t>B</w:t></w:r></w:p>" +
      "</w:body></w:document>";
    expect(extractDocxText(docx(xml))).toBe("A\nB");
  });

  it("does not decode &amp;lt; into a tag", () => {
    const xml = "<w:document><w:body><w:p><w:r><w:t>&amp;lt;</w:t></w:r></w:p></w:body></w:document>";
    expect(extractDocxText(docx(xml))).toBe("&lt;");
  });

  it("refuses a zip that is not a Word document", () => {
    const other = zipSync({ "x.txt": strToU8("hi") });
    expect(() => extractDocxText(other)).toThrow(/not a Word document/i);
  });
});
