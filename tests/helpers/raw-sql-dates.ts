import path from "node:path";
import ts from "typescript";

/**
 * Part 6 (13 Nov): every Drizzle `sql` tagged template (`sql` or `sql<T>`) whose interpolation's TYPE
 * includes Date -- by the TypeScript checker, not by a variable's name (a column, Date-typed in Drizzle's
 * types, isn't one: it renders as a column name). Returns "file:line  ${expression}" for each.
 */
export function dateInterpolationsInSql(rootFiles: readonly string[], repo: string): string[] {
  const configPath = ts.findConfigFile(repo, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json not found");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repo);
  const program = ts.createProgram([...rootFiles], parsed.options);
  const checker = program.getTypeChecker();
  const roots = new Set(rootFiles.map((f) => path.resolve(f)));

  const isDate = (type: ts.Type): boolean => {
    if (type.isUnion()) return type.types.some(isDate);
    if (type.getSymbol()?.getName() !== "Date") return false;
    return true;
  };
  const isColumn = (type: ts.Type) =>
    /^Pg[A-Z]\w*</.test(checker.typeToString(type)) || /PgColumn/.test(checker.typeToString(type));

  const found: string[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!roots.has(path.resolve(sf.fileName))) continue;
    const visit = (node: ts.Node) => {
      if (
        ts.isTaggedTemplateExpression(node) &&
        /^sql(<.*>)?$/s.test(node.tag.getText(sf)) &&
        ts.isTemplateExpression(node.template)
      ) {
        for (const span of node.template.templateSpans) {
          const type = checker.getTypeAtLocation(span.expression);
          if (isDate(type) && !isColumn(type)) {
            const { line } = sf.getLineAndCharacterOfPosition(span.expression.getStart(sf));
            found.push(
              `${path.relative(repo, sf.fileName).replace(/\\/g, "/")}:${line + 1}  \${${span.expression.getText(sf)}}`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}
