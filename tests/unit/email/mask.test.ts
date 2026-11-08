/**
 * Mock-gate and retention follow-ups (9 Nov), part 7 -- Sri's live test: the wrong-account invite page said "You're
 * signed in as l***@gmail.com. This invite is for l***@gmail.com." for two different addresses
 * (lakshmi.kom08@… and lakshmi.komman2001+invite2@…). One masking helper (lib/email/mask.ts) now keeps the first 3
 * and last 2 characters before the @, keeps a short local part mostly hidden, and -- where two addresses share a
 * screen -- shows one more character on each until they differ.
 */
import { describe, expect, it } from "vitest";
import * as mask from "@/lib/email/mask";
import { NON_TEST_ROOTS, sourceFiles } from "../../helpers/source-files";

const SIGNED_IN = "lakshmi.kom08@gmail.com";
const INVITED = "lakshmi.komman2001+invite2@gmail.com";

describe("two different addresses never read the same", () => {
  it("Sri's two addresses mask differently, alone and together", () => {
    expect(mask.maskEmail(SIGNED_IN)).toBe("lak…08@gmail.com");
    expect(mask.maskEmail(INVITED)).toBe("lak…e2@gmail.com");
    expect(mask.maskEmailsDistinct(SIGNED_IN, INVITED)).toEqual([
      "lak…08@gmail.com",
      "lak…e2@gmail.com",
    ]);
  });

  it("when the usual masks would match, one more character on each until they differ", () => {
    expect(mask.maskEmail("lakxyz12@gmail.com")).toBe(mask.maskEmail("lakabc12@gmail.com"));
    const [a, b] = mask.maskEmailsDistinct("lakxyz12@gmail.com", "lakabc12@gmail.com");
    expect(a).not.toBe(b);
    expect([a, b]).toEqual(["lak…z12@gmail.com", "lak…c12@gmail.com"]);
  });
});

describe("never the whole address", () => {
  it("a 2-character local part hides at least one character; a 1-character one hides it", () => {
    expect(mask.maskEmail("ab@example.com.au")).toBe("a…@example.com.au");
    expect(mask.maskEmail("a@example.com.au")).toBe("…@example.com.au");
    // Telling "ab" and "ac" apart would show all of one: they stay hidden.
    expect(mask.maskEmailsDistinct("ab@x.com.au", "ac@x.com.au")).toEqual([
      "a…@x.com.au",
      "a…@x.com.au",
    ]);
  });

  it("a short local part stays mostly hidden; a long one shows 3 and 2", () => {
    expect(mask.maskEmail("person@example.com")).toBe("pe…n@example.com");
    expect(mask.maskEmail("sri@vunnara.com.au")).toBe("s…@vunnara.com.au");
    expect(mask.maskEmail("sri.owner@vunnara.com.au")).toBe("sri…er@vunnara.com.au");
    expect(mask.maskEmail("not-an-address")).toBe("…");
  });

  it("an address already masked stays as it is (a message masked twice on its way to the log)", () => {
    expect(mask.maskEmail("sri…er@vunnara.com.au")).toBe("sri…er@vunnara.com.au");
  });
});

describe("one masking helper", () => {
  it("no other code masks an address: no other mask function, no hand-built x***@", () => {
    const offenders = sourceFiles(NON_TEST_ROOTS)
      .filter((f) => f.path !== "lib/email/mask.ts")
      .flatMap((f) => {
        const found: string[] = [];
        // A database URL's masked password ("//***@") isn't an address; a letter or a template before *** is.
        if (/(?:\w|\})\*\*\*@/.test(f.text))
          found.push(`${f.path}: builds a masked address by hand`);
        for (const m of f.text.matchAll(/(?:function\s+|const\s+)(mask\w*)\s*(?:=\s*\(|\()/g)) {
          // maskEmailsIn (lib/email/send.ts) finds addresses in free text and hands each to maskEmail.
          if (m[1] === "maskEmailsIn" && /maskEmail\(m\)/.test(f.text)) continue;
          found.push(`${f.path}: defines ${m[1]}`);
        }
        return found;
      });
    expect(offenders).toEqual([]);
  });
});
