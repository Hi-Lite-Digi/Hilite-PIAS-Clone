import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const theme = readFileSync(path.join(projectRoot, "src/styles/theme.css"), "utf8");
const fonts = readFileSync(path.join(projectRoot, "src/styles/fonts.css"), "utf8");

function customProperty(source: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`--${escapedName}:\\s*([^;]+);`, "i"))?.[1].trim();
}

test("defines the approved HiHunt colour tokens exactly", () => {
  const expected = {
    bg: "#EFEEF3",
    surface: "#FFFFFF",
    "surface-2": "#F6F5F8",
    ink: "#141416",
    "ink-2": "#6E6E76",
    "ink-3": "#A6A6AE",
    line: "rgba(20,20,22,0.08)",
    accent: "#D9F04A",
    mint: "#DEEADF",
    cyan: "#C3E7EB",
    lavender: "#DCD8F0",
    danger: "#E5484D",
    warn: "#E9A23B",
  };

  for (const [name, value] of Object.entries(expected)) {
    const actual = customProperty(theme, name)?.replace(/\s/g, "");
    assert.equal(actual?.toUpperCase(), value.replace(/\s/g, "").toUpperCase(), `--${name}`);
  }
});

test("defines the approved type, radius, breakpoint, and shell foundation", () => {
  assert.equal(customProperty(theme, "radius-container"), "1.75rem");
  assert.equal(customProperty(theme, "radius-card"), "1.25rem");
  assert.equal(customProperty(theme, "radius-control"), "0.875rem");
  assert.equal(customProperty(theme, "radius-pill"), "9999px");
  assert.equal(customProperty(theme, "radius-sm"), "var(--radius-control)");
  assert.equal(customProperty(theme, "radius-md"), "var(--radius-control)");
  assert.equal(customProperty(theme, "radius-lg"), "var(--radius-control)");
  assert.equal(customProperty(theme, "breakpoint-xl"), "75rem");
  assert.match(customProperty(theme, "font-sans") ?? "", /DM Sans/);
  assert.match(theme, /html\s*\{[^}]*font-size:\s*16px;/s);
  assert.doesNotMatch(theme, /\.dark\s*\{/);
  assert.doesNotMatch(theme, /#2563EB/i);
  assert.doesNotMatch(theme, /font-weight:\s*800/);
});

test("loads DM Sans from a vendored variable font with its own license", () => {
  assert.match(fonts, /font-family:\s*["']DM Sans["']/);
  assert.match(fonts, /DMSans-Variable\.ttf/);
  assert.match(fonts, /font-weight:\s*100 1000/);
  assert.doesNotMatch(fonts, /fonts\.googleapis\.com[^;]*DM\+Sans/i);
  assert.ok(existsSync(path.join(projectRoot, "src/assets/fonts/DMSans-Variable.ttf")));
  assert.ok(existsSync(path.join(projectRoot, "src/assets/fonts/OFL-DMSans.txt")));
});
