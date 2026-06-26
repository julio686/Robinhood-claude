// config.mjs — minimal YAML loader for THIS project's simple config files.
// Supports: comments (#), `key: value`, nested maps by 2-space indentation,
// `- item` lists, and scalar coercion (number / bool / null / string).
// It is intentionally tiny — not a general YAML parser. Keep config files simple.

import { readFileSync } from "node:fs";

export function loadYaml(path) {
  const text = readFileSync(path, "utf8");
  return parseYaml(text);
}

export function parseYaml(text) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\t/g, "  "))
    .filter((l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("#");
    })
    .map((l) => l.replace(/\s+#.*$/, "")); // strip trailing inline comments

  let idx = 0;
  function indentOf(l) {
    return l.length - l.trimStart().length;
  }
  function parseBlock(minIndent) {
    // Decide list vs map by the first line at this indent.
    const result = peekIsList(minIndent) ? [] : {};
    while (idx < lines.length) {
      const line = lines[idx];
      const ind = indentOf(line);
      if (ind < minIndent) break;
      if (ind > minIndent) {
        idx++;
        continue;
      } // safety (shouldn't normally hit)
      const content = line.trim();
      if (content.startsWith("- ")) {
        result.push(coerce(content.slice(2).trim()));
        idx++;
      } else if (content === "-") {
        idx++;
        result.push(parseBlock(minIndent + 2));
      } else {
        const ci = content.indexOf(":");
        const key = content.slice(0, ci).trim();
        const rest = content.slice(ci + 1).trim();
        idx++;
        if (rest === "" || rest === ">" || rest === "|") {
          // Nested block, or folded/literal scalar string.
          if (rest === ">" || rest === "|") {
            result[key] = readFoldedScalar(minIndent + 2);
          } else if (idx < lines.length && indentOf(lines[idx]) > minIndent) {
            result[key] = parseBlock(indentOf(lines[idx]));
          } else {
            result[key] = null;
          }
        } else {
          result[key] = coerce(rest);
        }
      }
    }
    return result;
  }
  function peekIsList(minIndent) {
    for (let j = idx; j < lines.length; j++) {
      const ind = indentOf(lines[j]);
      if (ind < minIndent) return false;
      if (ind === minIndent) return lines[j].trim().startsWith("-");
    }
    return false;
  }
  function readFoldedScalar(minIndent) {
    const parts = [];
    while (idx < lines.length && indentOf(lines[idx]) >= minIndent) {
      parts.push(lines[idx].trim());
      idx++;
    }
    return parts.join(" ");
  }

  return parseBlock(0);
}

function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  // strip surrounding quotes
  const m = v.match(/^"(.*)"$/) || v.match(/^'(.*)'$/);
  if (m) return m[1];
  if (v !== "" && !isNaN(Number(v))) return Number(v);
  return v;
}
