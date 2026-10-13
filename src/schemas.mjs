import { z } from "zod";

const Example = z.object({
  input: z.string().describe("A concrete call or input, written as plain text."),
  output: z.string().describe("The observable result for that input."),
});

export const SpecCard = z.object({
  name: z.string().describe("The donor's name."),
  oneLiner: z.string().describe("One sentence: what the donor is for."),
  problem: z.string().describe("The user problem the donor solves."),
  capabilities: z
    .array(
      z.object({
        id: z.string().describe("Short kebab-case id, e.g. parse-duration."),
        name: z.string(),
        behavior: z.string().describe("Observable behavior in plain language. Never code."),
        inputs: z.string(),
        outputs: z.string(),
        edgeCases: z.array(z.string()),
        examples: z.array(Example),
      }),
    )
    .describe("2-6 distinct, transplantable capabilities."),
  designIdeas: z.array(z.string()).describe("Notable ideas worth inheriting (API style, ergonomics)."),
  limitations: z.array(z.string()),
  evidence: z.array(z.string()).describe("Donor file paths or REA evidence ids that support this card."),
});

export const Proposal = z.object({
  name: z.string().describe("npm-safe kebab-case package name for the creature. Must not reuse a donor's name."),
  tagline: z.string(),
  concept: z.string().describe("What the creature is and who would use it."),
  inheritsFromA: z.array(z.string()).describe("Capability ids taken from donor A."),
  inheritsFromB: z.array(z.string()).describe("Capability ids taken from donor B."),
  newCapability: z.string().describe("The capability that exists only because A and B were fused."),
  whyItIsNew: z.string(),
  api: z
    .array(
      z.object({
        name: z.string(),
        signature: z.string().describe("e.g. parseRate(text: string): { bytes: number, perMs: number }"),
        description: z.string(),
      }),
    )
    .describe("Named exports of src/index.mjs. 2-6 functions."),
  cliCommand: z.string().describe("The bin name."),
  cliExamples: z.array(z.string()),
});

export const FusionProposals = z.object({
  proposals: z.array(Proposal).describe("Exactly 3 distinct creature concepts, best first."),
});

const File = z.object({
  path: z.string().describe("Relative POSIX path inside the creature."),
  content: z.string(),
});

export const Contract = z.object({
  tests: z.array(File).describe("node:test files under test/contract/, ending in .test.mjs."),
  mapping: z.array(
    z.object({
      test: z.string().describe("The exact test name."),
      origin: z.enum(["A", "B", "fusion"]),
      capabilityIds: z.array(z.string()),
    }),
  ),
});

export const CreatureFiles = z.object({
  files: z.array(File),
  summary: z.string().describe("What was built or changed, in 1-3 sentences."),
});

export const Resolution = z.object({
  product: z.string().describe("The product the user meant, e.g. Spotify."),
  essence: z.string().describe("The core user-facing capabilities of that product, in one sentence."),
  candidates: z
    .array(
      z.object({
        repo: z.string().describe("GitHub owner/name of an existing open-source project."),
        why: z.string().describe("Which of the product's capabilities this project replicates."),
        language: z.string(),
        license: z.string().describe("SPDX id if known, else unknown."),
      }),
    )
    .describe("3-5 real, public GitHub repositories, best first. Prefer JavaScript/TypeScript, permissive licenses, and small focused codebases over huge monorepos."),
});
