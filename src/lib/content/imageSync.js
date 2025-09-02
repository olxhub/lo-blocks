// src/lib/content/imageSync.js
//
// Image synchronization - copies content images to Next.js public directory.
//
// Handles the automatic copying of image files from the content directory
// to the public directory where Next.js can serve them efficiently. This
// bridges Learning Observer's content storage system with Next.js's static
// file serving requirements.
//
// The sync process preserves directory structure and only copies actual
// image files, avoiding unnecessary files in the public directory.
//
import fs from 'fs/promises';
import path from 'path';

export async function copyImagesToPublic(provider) {
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
  const publicContentDir = './public/content';

  try {
    // Ensure public/content exists
    await fs.mkdir(publicContentDir, { recursive: true });

    // Walk content directory and copy images
    await copyImagesRecursive(provider.baseDir, publicContentDir, imageExts);

    console.log(`✅ Images copied to ${publicContentDir}`);
  } catch (error) {
    console.warn('⚠️  Failed to copy images to public directory:', error.message);
  }
}

async function copyImagesRecursive(sourceDir, targetDir, imageExts) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files and directories
    if (entry.name.startsWith('.')) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      // Only recurse into directories, but don't create target directory yet
      await copyImagesRecursive(sourcePath, targetPath, imageExts);
    } else if (entry.isFile() && imageExts.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      // Create target directory only when we have an image to copy
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}