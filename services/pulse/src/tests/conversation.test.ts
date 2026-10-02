import { describe, expect, it } from "vitest";
import {
  customerSafeStatusReply,
  extractBriefHints,
  explainServiceLimitation,
  newConversationState,
  nextPhaseAfterBrief,
} from "../lib/conversation.js";

describe("pulse conversation orchestration", () => {
  it("extracts untrusted hints without authorizing", () => {
    const hints = extractBriefHints("Need Ahmedabad OOH budget 500000 for April");
    expect(hints.cityHint).toBe("ahmedabad");
    expect(hints.budgetHint).toBe(500000);
  });

  it("moves brief → clarify/scenarios and explains limitations", () => {
    const state = { ...newConversationState(), phase: "COLLECT_BRIEF" as const };
    const next = nextPhaseAfterBrief(state, extractBriefHints("Surat roadside only"));
    expect(next.phase).toBe("CLARIFY");
    const ready = nextPhaseAfterBrief(state, extractBriefHints("Surat budget 200000"));
    expect(ready.phase).toBe("SHOW_SCENARIOS");
    expect(explainServiceLimitation("cms")).toMatch(/manual/i);
    expect(customerSafeStatusReply({ ...newConversationState(), phase: "AWAIT_LINK" })).toMatch(
      /not linked/i
    );
  });
});
