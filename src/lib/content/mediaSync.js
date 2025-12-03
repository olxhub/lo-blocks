// src/lib/content/mediaSync.js
//
// Media synchronization - copies content media files to Next.js public directory.
//
// Handles the automatic copying of media files from the content directory
// to the public directory where Next.js can serve them efficiently. This
// bridges Learning Observer's content storage system with Next.js's static
// file serving requirements.
//
// The sync process preserves directory structure and only copies actual
// media files, avoiding unnecessary files in the public directory.
//
import fs from 'fs/promises';
import path from 'path';

export async function copyMediaToPublic(provider) {
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff', '.tif'];
  const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'];
  const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.wma', '.aiff', '.ogg'];
  const documentExts = ['.pdf'];
  const mediaExts = [...imageExts, ...videoExts, ...audioExts, ...documentExts];
  const publicContentDir = './public/content';

  try {
    // Ensure public/content exists
    await fs.mkdir(publicContentDir, { recursive: true });

    // Walk content directory and copy media files
    await copyMediaRecursive(provider.baseDir, publicContentDir, mediaExts);

    console.log(`✅ Media files copied to ${publicContentDir}`);
  } catch (error) {
    console.warn('⚠️  Failed to copy media to public directory:', error.message);
  }
}

async function copyMediaRecursive(sourceDir, targetDir, mediaExts) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files and directories
    if (entry.name.startsWith('.')) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      // Only recurse into directories, but don't create target directory yet
      await copyMediaRecursive(sourcePath, targetPath, mediaExts);
    } else if (entry.isFile() && mediaExts.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      // Create target directory only when we have a media file to copy
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}
