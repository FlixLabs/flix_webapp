import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parse as parseComponent } from "@vue/compiler-sfc";
import { baseParse } from "@vue/compiler-dom";

const root = fileURLToPath(new URL("../", import.meta.url));
const en = JSON.parse(readFileSync(resolve(root, "src/i18n/en.json"), "utf8"));
const fr = JSON.parse(readFileSync(resolve(root, "src/i18n/fr.json"), "utf8"));
const problems = [];
const parameters = (value) =>
  [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))]
    .sort()
    .join(",");
for (const key of new Set([...Object.keys(en), ...Object.keys(fr)])) {
  if (!en[key] || !fr[key]) problems.push(`Missing locale entry: ${key}`);
  else if (parameters(en[key]) !== parameters(fr[key]))
    problems.push(`Different placeholders: ${key}`);
}
function scan(code, file) {
  const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "t" &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const key = node.arguments[0].text;
      if (!(key in en)) problems.push(`${file}: missing message ${key}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!/\.(ts|vue)$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    if (file.endsWith(".ts")) {
      scan(source, file);
      continue;
    }
    const descriptor = parseComponent(source).descriptor;
    if (descriptor.scriptSetup) scan(descriptor.scriptSetup.content, file);
    if (!descriptor.template) continue;
    function template(node) {
      if (node.type === 5) scan(`(${node.content.content})`, file);
      if (node.type === 1)
        for (const prop of node.props) {
          if (prop.type === 7 && prop.exp) scan(`(${prop.exp.content})`, file);
          if (
            prop.type === 6 &&
            prop.value &&
            [
              "label",
              "aria-label",
              "placeholder",
              "title",
              "sentence",
            ].includes(prop.name) &&
            /[A-Za-z]/.test(prop.value.content)
          )
            problems.push(
              `${file}: untranslated ${prop.name}: ${prop.value.content}`,
            );
        }
      if (
        node.type === 2 &&
        /[A-Za-z]{2}/.test(node.content) &&
        !/^\s*mdi-/.test(node.content)
      )
        problems.push(`${file}: untranslated text: ${node.content.trim()}`);
      for (const child of node.children || []) template(child);
    }
    template(baseParse(descriptor.template.content));
  }
}
walk(resolve(root, "src"));
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Translations checked: ${Object.keys(en).length} messages, English/French catalogs and UI coverage.`,
  );
