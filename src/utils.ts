import path from "path";
import ts from "typescript";
import { parse, Spec } from "comment-parser";

export function removeCommentsFromCode(code: string): string {
  const printer = ts.createPrinter({ removeComments: true });
  const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return printer.printFile(sourceFile);
}

export function findBasePath(filePath: string, folderPaths: string[]): string {
  // Resolve all paths to absolute for consistent comparison
  const absoluteFilePath = path.resolve(filePath);
  for (const folderPath of folderPaths) {
    const absoluteFolderPath = path.resolve(folderPath);
    if (absoluteFilePath.startsWith(absoluteFolderPath)) {
      return absoluteFolderPath;
    }
  }
  return "";
}

export function getPathName(filePath: string, baseDir: string): string {
  // Resolve paths to absolute for consistent relative path computation
  const absoluteFilePath = path.resolve(filePath);
  const absoluteBaseDir = path.resolve(baseDir);
  const relativePath = path.relative(absoluteBaseDir, absoluteFilePath);
  const dirName = path.dirname(relativePath);
  const extenstion = path.extname(filePath);
  const baseName = path.basename(relativePath, extenstion);

  // Always include base folder name as prefix for unique titles
  const folderName = path.basename(absoluteBaseDir);

  if (baseName === "index") {
    // If dirName is "." (file at root), use just the folder name
    if (dirName === ".") {
      return folderName.replace(/\\/g, "/");
    }
    return path.join(folderName, dirName).replace(/\\/g, "/");
  }

  if (dirName === ".") {
    return path.join(folderName, baseName).replace(/\\/g, "/");
  }
  return path.join(folderName, dirName, baseName).replace(/\\/g, "/");
}
export function extractMethodFromCode(code: string, methodName: string): string {
  const sourceFile = ts.createSourceFile(
    "temp.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let methodNode: ts.MethodDeclaration | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isMethodDeclaration(node) &&
      node.name &&
      node.name.getText() === methodName
    ) {
      methodNode = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!methodNode) {
    return code;
  }
  const start = methodNode.getStart(sourceFile);
  const end = methodNode.end;
  return code.slice(start, end).trim();
}
// Escape HTML tags to prevent MDX parsing errors
function escapeHtmlTags(str:string) {
  return str
    .replace(/[-`]/g, '\\$&')   // \- and \`
    .replace(/[{}]/g, '\\$&')   // \{ and \}
    .replace(/</g, '&lt;')      // <
    .replace(/>/g, '&gt;');     // >
}

export function formatJsDocComment(raw: string): string {
  const trimmedRaw = raw.trim();
  // Return plain strings unchanged (non JSDoc comments)
  if (!trimmedRaw.startsWith('/**')) {
    return trimmedRaw;
  }
  // Parse the raw JSDoc comment
  const { description = '', tags = [] } = parse(trimmedRaw)?.[0] || {};

  // Group tags by their `tag` field
  const grouped = tags.reduce((acc, t) => {
    (acc[t.tag] = acc[t.tag] ?? []).push(t);
    return acc;
  }, {} as Record<string, Spec[]>);

  // Render the JSDoc description as a Markdown block-quote
  const quotedDescription = description
    .trim()
    .split('\n')
    .map(line => `> ${escapeHtmlTags(line)}`)
    .join('\n');

  let mdx = quotedDescription + '\n\n';

  // Parameters
  if (grouped.param) {
    const paramsBlock = grouped.param
      .map(t => `- \`${t.name}\` ${t.type ? `*${escapeHtmlTags(t.type)}*` : ''} — ${escapeHtmlTags(t.description.trim().replace(/^-/g, '').trim())}`)
      .join('\n');
    mdx += `#### Parameter:\n\n${paramsBlock}\n`;
  }

  // Returns
  const returnsGroup = grouped.returns || grouped.return;
  if (returnsGroup) {
    const { type = '', description: retDesc = '' } = returnsGroup[0];
    mdx += `#### Returns:\n${type ? `\`${escapeHtmlTags(type)}\`` : ''}  ${escapeHtmlTags(retDesc)}\n`;
  }

  // Example
  if (grouped.example && grouped.example.length > 0) {
    mdx += `#### Example:\n`
    
    grouped.example.forEach(e => {
      const { description: exDesc = '', name: exName = '', source = [] } = e;
      
      // Prefer raw source tokens because they keep the original line breaks
      const rawLines = source
        .filter(line => typeof line.source === 'string')
        .slice(1,-1)
        .map(line => line.source.replace(/^\s*\*\s?/, '')); // strip leading "* "
      
      // Drop the first line that still contains "@example"
      const codeLines =
        rawLines.length > 1
          ? rawLines                   // use tokens if present
          : exDesc.split('\n');                        // fallback to description
      
      const exampleCode = codeLines.join('\n');
      
      mdx += `\`\`\`ts\n${exampleCode}\n\`\`\`\n`;
    })
  }

  // Fallback for other tags
  // Skip tags that don't add value in MDX output
  const skipTags = ['param', 'return', 'returns', 'example', 'memberof', 'subcategory', 'module', 'fileoverview'];
  Object.entries(grouped).forEach(([tagName, tagList]) => {
    if (skipTags.includes(tagName)) return;

    const heading = tagName.charAt(0).toUpperCase() + tagName.slice(1);
    const lines = tagList
      .map(t =>
        t.name
          ? `- \`${t.name}\`${t.type ? ` *${escapeHtmlTags(t.type)}*` : ''} — ${escapeHtmlTags(t.description)}`
          : escapeHtmlTags(t.description),
      )
      .join('\n');

    mdx += `#### ${heading}:\n${lines}\n`;
  });

  return mdx.trim();
}

