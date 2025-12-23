import { Project, SourceFile, Node, SyntaxKind } from "ts-morph";
import { findBasePath, getPathName } from "./utils";
import { getFunctionName } from "./astAnalysis";
import { createMdxContent } from "./mdxContent";
import fs from "fs";
import path from "path";
import type { JsDocComment } from "./types/common";

export function analyzeFolders(folderPaths: string[], extensions: string[], outputDirectory?: string): void {
  const project = new Project();
  folderPaths.forEach((folderPath: string) => {
    extensions.forEach((extension) => {
      project.addSourceFilesAtPaths(path.join(folderPath, `**/*.${extension}`));
    });
  });

  project.getSourceFiles().forEach((sourceFile) => analyzeSourceFile(sourceFile, folderPaths, outputDirectory));
}

export function analyzeSourceFile(sourceFile: SourceFile, folderPaths: string[], outputDirectory?: string): void {
  const baseDir = findBasePath(sourceFile.getFilePath(), folderPaths);
  const jsDocComments: JsDocComment[] = [];

  sourceFile.forEachChild((node) => processNode(node, jsDocComments));

  if (jsDocComments.length > 0) {
    const pathName = getPathName(sourceFile.getFilePath(), baseDir);
    const mdxContent = generateMdxContent(jsDocComments, pathName);
    const mdxFilePath = getMdxFilePath(sourceFile.getFilePath(), baseDir, outputDirectory);
    writeMdxFile(mdxFilePath, mdxContent);
  }
}

export function processNode(node: Node, jsDocComments: JsDocComment[]): void {
  if (Node.isJSDocable(node) && node.getJsDocs && typeof node.getJsDocs === "function") {
    const jsDocs = node.getJsDocs();
    if (jsDocs.length > 0) {
      const nodeName = getFunctionName(node);
      const commentText = jsDocs.map((doc) => doc.getFullText().trim()).join("\n");

      let nodeCode: string;
      if (Node.isMethodDeclaration(node) && Node.isClassDeclaration(node.getParent())) {
        nodeCode = node.getParentOrThrow().getText();
      } else {
        nodeCode = node.getText();
      }

      jsDocComments.push({ name: nodeName, type: node.getKindName(), comment: commentText, code: nodeCode });
    }
  }

  if (node.getKind() === SyntaxKind.ClassDeclaration) {
    node.forEachChild((child) => processNode(child, jsDocComments));
  }
}

export function generateMdxContent(jsDocComments: JsDocComment[], pathName: string): string {
  return createMdxContent(jsDocComments, pathName);
}

export function writeMdxFile(filePath: string, content: string): void {
  // Ensure the directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

function getMdxFilePath(filePath: string, baseDir: string, outputDirectory?: string): string {
  if (outputDirectory) {
    // Compute relative path from baseDir and output to outputDirectory
    // Resolve paths to absolute for consistent relative path computation
    const absoluteFilePath = path.resolve(filePath);
    const absoluteBaseDir = path.resolve(baseDir);
    const relativePath = path.relative(absoluteBaseDir, absoluteFilePath);
    const mdxRelativePath = relativePath.replace(/\.[^/.]+$/, ".doc.mdx");
    return path.join(outputDirectory, mdxRelativePath);
  }
  // Default: in-place next to source file
  return filePath.replace(/\.[^/.]+$/, ".doc.mdx");
}
