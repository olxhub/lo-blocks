// src/lib/storage/providers/stacked.ts
//
// Stacked storage provider - layered content access with fallback chain.
//
// Enables content layering where higher-priority providers override lower ones:
// - User edits (highest priority)
// - Course-specific content
// - Institution content
// - Platform defaults (lowest priority)
//
// For read operations, tries each provider in order until content is found.
// Write operations go to the first provider that supports writes.
//

export class StackedStorageProvider {
  constructor(providers) {
    if (providers.length === 0) {
      throw new Error('StackedStorageProvider requires at least one provider');
    }
    this.providers = providers;
  }

  // Read from the first provider that has the file
  async read(path) {
    let lastError = null;

    for (const provider of this.providers) {
      try {
        return await provider.read(path);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error(`File not found in any provider: ${path}`);
  }

  // Write to the first provider
  async write(path, content) {
    return this.providers[0].write(path, content);
  }

  // Update in the first provider
  async update(path, content) {
    return this.providers[0].update(path, content);
  }

  // List files from first provider (TODO: merge from all)
  async listFiles(selection = {}) {
    return this.providers[0].listFiles(selection);
  }

  // Scan from first provider (TODO: merge from all)
  async loadXmlFilesWithStats(previous = {}) {
    return this.providers[0].loadXmlFilesWithStats(previous);
  }

  // Resolve path using first provider that works
  resolveRelativePath(baseProvenance, relativePath) {
    for (const provider of this.providers) {
      try {
        return provider.resolveRelativePath(baseProvenance, relativePath);
      } catch {
        // Continue to next provider
      }
    }
    throw new Error(`Cannot resolve path in any provider: ${relativePath}`);
  }

  // Check if image exists in any provider
  async validateImagePath(imagePath) {
    for (const provider of this.providers) {
      try {
        if (await provider.validateImagePath(imagePath)) {
          return true;
        }
      } catch {
        // Continue
      }
    }
    return false;
  }
}
