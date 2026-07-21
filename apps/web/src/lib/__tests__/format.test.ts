import { describe, expect, it } from "vitest";
import {
  isCompleteMobilePhone,
  isValidEmail,
  isValidFullName,
  sanitizeEmail,
  sanitizeName,
  titleCaseName,
} from "../format";

describe("sanitizeName", () => {
  it("strips digits and stray symbols, keeps letters/spaces/accents", () => {
    expect(sanitizeName("Rychard 12920")).toBe("Rychard ");
    expect(sanitizeName("João da Silva")).toBe("João da Silva");
    expect(sanitizeName("Ana-Clara D'Ávila")).toBe("Ana-Clara D'Ávila");
    expect(sanitizeName("a$b#1")).toBe("ab");
  });

  it("collapses inner spaces and drops leading space", () => {
    expect(sanitizeName("  Maria   Souza")).toBe("Maria Souza");
  });
});

describe("isValidFullName", () => {
  it("requires first + last name (each with letters)", () => {
    expect(isValidFullName("Rychard Souza")).toBe(true);
    expect(isValidFullName("Maria de Souza")).toBe(true);
  });

  it("rejects a single word, digits-only, or too-short parts", () => {
    expect(isValidFullName("Rychard")).toBe(false);
    expect(isValidFullName("Rychard 12920")).toBe(false); // digits stripped → one word
    expect(isValidFullName("A B")).toBe(false); // parts too short
    expect(isValidFullName("")).toBe(false);
  });
});

describe("titleCaseName", () => {
  it("title-cases and keeps pt-BR connectors lowercase (except leading)", () => {
    expect(titleCaseName("joão DA SILVA")).toBe("João da Silva");
    expect(titleCaseName("MARIA souza")).toBe("Maria Souza");
    expect(titleCaseName("  ana  de  souza ")).toBe("Ana de Souza");
  });
});

describe("sanitizeEmail", () => {
  it("removes spaces and lowercases", () => {
    expect(sanitizeEmail("  MARIA @Teste.com ")).toBe("maria@teste.com");
  });
});

describe("existing validators still hold", () => {
  it("email + phone", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isCompleteMobilePhone("67984299967")).toBe(true);
    expect(isCompleteMobilePhone("6798429")).toBe(false);
  });
});
