const { analyzeFolders } = require("./dist/analyzeFolders");
const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs");

module.exports = {
  // Function to modify Storybook configuration
  managerEntries: (entry = [], options = {}) => {
    // Read the configuration options passed to the preset
    const { folderPaths, extensions, outputDirectory } = options;

    // Set up file watchers for auto-regeneration
    if (folderPaths && extensions) {
      const watchPaths = [];
      folderPaths.forEach(folderPath => {
        extensions.forEach(ext => {
          watchPaths.push(path.join(process.cwd(), folderPath, `**/*.${ext}`));
        });
      });

      // Watch for file changes
      const watcher = chokidar.watch(watchPaths, {
        persistent: true,
        ignoreInitial: true
      });

      watcher.on('change', (changedFilePath) => {
        console.log(`File changed: ${changedFilePath}`);

        // Compute the MDX file path (either in outputDirectory or in-place)
        let mdxFilePath;
        if (outputDirectory) {
          // Find which folderPath this file belongs to
          const matchingFolder = folderPaths.find(fp =>
            changedFilePath.startsWith(path.join(process.cwd(), fp))
          );
          if (matchingFolder) {
            const relativePath = path.relative(
              path.join(process.cwd(), matchingFolder),
              changedFilePath
            );
            mdxFilePath = path.join(
              process.cwd(),
              outputDirectory,
              relativePath.replace(/\.[^/.]+$/, ".doc.mdx")
            );
          } else {
            mdxFilePath = changedFilePath.replace(/\.[^/.]+$/, ".doc.mdx");
          }
        } else {
          mdxFilePath = changedFilePath.replace(/\.[^/.]+$/, ".doc.mdx");
        }

        // Delete the existing MDX file if it exists
        if (fs.existsSync(mdxFilePath)) {
          fs.unlinkSync(mdxFilePath);
        }

        // Re-analyze the folder containing the changed file
        analyzeFolders([path.dirname(changedFilePath)], extensions, outputDirectory);
        console.log(`Regenerated MDX for: ${changedFilePath}`);
      });

      console.log('Watching for file changes...');
    }

    // Initial generation
    if (folderPaths && extensions) {
      analyzeFolders(folderPaths, extensions, outputDirectory);
    }

    return entry;
  },
};