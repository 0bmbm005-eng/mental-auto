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
      summary: "玄関の靴箱を拭く", otherSummary: "勝手口の下駄箱を拭く",
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
  expect(output.candidates).toHaveLength(6);
  expect(output.candidates.filter((pair: { summary: string }) => pair.summary !== "窓を拭く")).toEqual([
    { targets: ["居間の机", "リビングの机"], summary: "居間の机を拭く", otherSummary: "リビングの机を拭く",
      evidenceDates: ["2026-11-12", "2026-11-13"] },
    { targets: ["居間の机", "寝室の机"], summary: "居間の机を拭く", otherSummary: "寝室の机を拭く",
      evidenceDates: ["2026-11-12", "2026-11-14"] },
    { targets: ["リビングの机", "寝室の机"], summary: "リビングの机を拭く", otherSummary: "寝室の机を拭く",
      evidenceDates: ["2026-11-13", "2026-11-14"] },
  ]);
});

it("normalizes past verbs while preserving negation and compound expressions", () => {
  const result = execFileSync("python3", ["-B", "-c", `
import importlib.util, json
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location("patterns", "src/experimental_patterns.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
def token(surface, pos, base):
    return SimpleNamespace(surface=surface, part_of_speech=pos, base_form=base)
class Tokenizer:
    def tokenize(self, value):
        return {
            "拭いた": [token("拭い", "動詞,自立", "拭く"), token("た", "助動詞,", "た")],
            "拭く": [token("拭く", "動詞,自立", "拭く")],
            "拭かない": [token("拭か", "動詞,自立", "拭く"), token("ない", "助動詞,", "ない")],
            "掃除した": [token("掃除", "名詞,サ変接続,", "掃除"), token("し", "動詞,自立", "する"), token("た", "助動詞,", "た")],
        }.get(value, [])
print(json.dumps([module.normalize_action(value, Tokenizer())
                  for value in ["拭いた", "拭く", "拭かない", "掃除した", "拭いていた"]]))
`], { encoding: "utf8" });
  expect(JSON.parse(result)).toEqual(["拭く", "拭く", "拭かない", "掃除する", "拭いていた"]);
});

it("classifies the eight fixed suffix pairs without making semantic decisions", () => {
  const result = execFileSync("python3", ["-B", "-c", `
import importlib.util, json
spec = importlib.util.spec_from_file_location("patterns", "src/experimental_patterns.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
pairs = [
    ["物置の収納ケース", "ケース"], ["ケース", "物置の収納ケース"],
    ["収納ケース", "ケース"], ["物置の収納ケース", "物置の収納ケース"],
    ["居間の机", "リビングの机"], ["玄関の靴箱", "勝手口の下駄箱"],
    ["棚", "棚の上"], ["玄関のごみ箱", "ごみ箱"],
]
print(json.dumps([module.lacks_target_information(*pair) for pair in pairs]))
`], { encoding: "utf8" });
  expect(JSON.parse(result)).toEqual([true, true, true, false, false, false, false, true]);
});
