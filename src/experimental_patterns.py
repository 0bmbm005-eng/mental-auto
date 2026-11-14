"""Postprocess optional daily targetQuote extraction with Janome."""
import json
import re
import sys
from importlib.metadata import version


def correct_tail(target, action, tokenizer):
    tokens = list(tokenizer.tokenize(target))
    candidates = []
    if "".join(token.surface for token in tokens) == target:
        for i in range(1, len(tokens) - 1):
            particle, verb, *rest = tokens[i:]
            if (
                particle.surface == "を"
                and particle.part_of_speech.split(",")[:2] == ["助詞", "格助詞"]
                and verb.part_of_speech.startswith("動詞,")
                and verb.base_form == action
                and all(token.part_of_speech.startswith("助動詞,") for token in rest)
            ):
                candidates.append("".join(token.surface for token in tokens[:i]))
    return candidates[0] if len(candidates) == 1 else target


def expand_left(target, content):
    positions = [i for i in range(len(content)) if content.startswith(target, i)]
    if len(positions) == 1:
        modifier = re.search(r"[一-龯々〆ヶァ-ヿー]+の$", content[:positions[0]])
        if modifier:
            return modifier[0] + target
    return target


def repeated_patterns(days, tokenizer):
    groups = {}
    for day in days:
        content = day["content"]
        for pair in day["actions"]:
            target, action = pair["targetQuote"], pair["action"]
            if not target.strip() or not action.strip() or target == action or target not in content:
                continue
            target = correct_tail(target, action, tokenizer)
            if not target.strip() or target == action:
                continue
            target = expand_left(target, content).strip()
            action = action.strip()
            groups.setdefault((target, action), set()).add(day["date"])

    retained = {key: set(dates) for key, dates in groups.items() if len(dates) >= 2}
    for (target, action), dates in groups.items():
        other = groups.get((target + "の上", action), set())
        if any(left != right for left in dates for right in other):
            retained.setdefault((target, action), set()).update(dates | other)
    return [
        {"summary": target + "を" + action, "evidenceDates": sorted(dates)}
        for (target, action), dates in sorted(retained.items())
    ]


def main():
    try:
        if version("Janome") != "0.5.0":
            raise ImportError()
        from janome.tokenizer import Tokenizer
    except ImportError:
        sys.exit("Experimental repeatedPatterns requires Janome 0.5.0 for python3 (python3 -m pip install Janome==0.5.0)")
    if sys.argv[1:] != ["--check"]:
        print(json.dumps(repeated_patterns(json.load(sys.stdin), Tokenizer()), ensure_ascii=False))


if __name__ == "__main__":
    main()
