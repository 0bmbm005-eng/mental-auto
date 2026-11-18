import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("restores locations before constructing semantic candidates and ignores invalid quotes", () => {
  const result = execFileSync("python3", ["-B", "-c", `
import importlib.util, json
spec = importlib.util.spec_from_file_location("patterns", "src/experimental_patterns.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Tokenizer:
    def tokenize(self, value):
        return []
days = [
    {"date": "2026-11-12", "content": "玄関の靴箱を拭いた。",
     "actions": [{"targetQuote": "玄関の靴箱", "action": "拭く"}]},
    {"date": "2026-11-13", "content": "勝手口の下駄箱を拭いた。",
     "actions": [{"targetQuote": "下駄箱", "action": "拭く"},
                 {"targetQuote": "存在しない机", "action": "拭く"}]}
]
print(json.dumps(module.repeated_patterns(days, Tokenizer(), True)))
`], { encoding: "utf8" });
  expect(JSON.parse(result)).toEqual({
    patterns: [],
    candidates: [{
      targets: ["玄関の靴箱", "勝手口の下駄箱"],
      summary: "玄関の靴箱を拭く",
      evidenceDates: ["2026-11-12", "2026-11-13"],
    }],
  });
});

it("keeps exact three-day evidence and creates only cross-day candidates", () => {
  const result = execFileSync("python3", ["-B", "-c", `
import importlib.util, json
spec = importlib.util.spec_from_file_location("patterns", "src/experimental_patterns.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Tokenizer:
    def tokenize(self, value):
        return []
targets = [["窓", "居間の机"], ["窓", "リビングの机"], ["窓", "寝室の机"]]
days = [
    {"date": f"2026-11-{12+i}", "content": "。".join(t + "を拭いた" for t in day),
     "actions": [{"targetQuote": t, "action": "拭く"} for t in day]}
    for i, day in enumerate(targets)
]
print(json.dumps(module.repeated_patterns(days, Tokenizer(), True)))
`], { encoding: "utf8" });
  const output = JSON.parse(result);
  expect(output.patterns).toEqual([{
    summary: "窓を拭く",
    evidenceDates: ["2026-11-12", "2026-11-13", "2026-11-14"],
  }]);
  expect(output.candidates).toEqual([
    { targets: ["居間の机", "リビングの机"], summary: "居間の机を拭く",
      evidenceDates: ["2026-11-12", "2026-11-13"] },
    { targets: ["居間の机", "寝室の机"], summary: "居間の机を拭く",
      evidenceDates: ["2026-11-12", "2026-11-14"] },
    { targets: ["リビングの机", "寝室の机"], summary: "リビングの机を拭く",
      evidenceDates: ["2026-11-13", "2026-11-14"] },
  ]);
});
