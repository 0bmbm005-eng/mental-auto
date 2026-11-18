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
