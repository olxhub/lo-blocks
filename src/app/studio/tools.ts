// src/lib/editor/tools.ts
//
// LLM tools for the editor assistant.
//
// Tool names and parameters match Claude Code SDK conventions for familiarity.
// Uses the storage provider abstraction for file operations.
//
// TOOL SUMMARY
// ------------
// Edit         - Modify current file using search-and-replace
// Read         - Read files from storage
// Write        - Create or overwrite files
// Glob         - Find files by pattern
// Grep         - Search file contents
// OpenFile     - Open a file in the editor
// GetBlockInfo - Get documentation for OLX blocks (custom, not SDK)
//

import { parseOLX } from '@/lib/content/parseOLX';
import { isPEGContentExtension, getParserForExtension } from '@/generated/parserRegistry';
import { NetworkStorageProvider } from '@/lib/lofs/providers/network';
import { type StorageProvider, toOlxRelativePath } from '@/lib/lofs/types';
import type { ProvenanceURI } from '@/lib/types';

// Default storage provider for client-side use
const defaultStorage = new NetworkStorageProvider();

interface EditorToolsParams {
  /** Called with new content string when LLM applies an edit */
  onApplyEdit?: (content: string) => void;
  /** Called to open a file in the editor */
  onOpenFile?: (path: string) => void;
  /** Returns current file content */
  getCurrentContent?: () => string;
  /** Returns current file type (e.g., 'olx', 'chatpeg') */
  getFileType?: () => string;
  /** Returns current file path */
  getCurrentPath?: () => string;
  /** Storage provider for file operations (defaults to NetworkStorageProvider) */
  storage?: StorageProvider;
}

/**
 * Create the tools array for useChat().
 */
export function createEditorTools({
  onApplyEdit,
  onOpenFile,
  getCurrentContent,
  getFileType,
  getCurrentPath,
  storage = defaultStorage,
}: EditorToolsParams) {
  return [
    // =========================================================================
    // Edit - Modify current file using search-and-replace
    // =========================================================================
    {
      type: "function",
      function: {
        name: "Edit",
        description: "Edit the current file using search-and-replace. The old_string must be unique in the file (include surrounding context if needed). Use replace_all: true for global renames. Only use when asked to modify content.",
        parameters: {
          type: "object",
          properties: {
            old_string: {
              type: "string",
              description: "Exact text to find and replace. Must be unique unless replace_all is true."
            },
            new_string: {
              type: "string",
              description: "Replacement text."
            },
            replace_all: {
              type: "boolean",
              description: "If true, replace ALL occurrences. Default: false."
            }
          },
          required: ["old_string", "new_string"]
        }
      },
      callback: async ({ old_string, new_string, replace_all = false }: {
        old_string: string;
        new_string: string;
        replace_all?: boolean;
      }) => {
        // Validate old_string is not empty
        if (!old_string || old_string.trim() === '') {
          return 'Error: old_string cannot be empty.';
        }

        const currentContent = getCurrentContent?.() || '';
        const fileType = getFileType?.() || 'olx';

        // Count occurrences
        const occurrences = currentContent.split(old_string).length - 1;

        if (occurrences === 0) {
          return 'Error: Could not find text to replace. Ensure old_string exactly matches.';
        }

        if (occurrences > 1 && !replace_all) {
          return `Error: Found ${occurrences} occurrences. Include more context to make unique, or set replace_all: true.`;
        }

        // Apply the edit
        const newContent = replace_all
          ? currentContent.replaceAll(old_string, new_string)
          : currentContent.replace(old_string, new_string);

        // Validate content by parsing it
        if (fileType === 'olx' || fileType === 'xml') {
          try {
            const { errors } = await parseOLX(newContent, ['editor://' as ProvenanceURI]);
            if (errors.length > 0) {
              const messages = errors.map(e => e.message).join('\n\n---\n\n');
              return `Error (${errors.length} issue${errors.length > 1 ? 's' : ''}):\n\n${messages}`;
            }
          } catch (err: any) {
            return `Error: ${err.message}`;
          }
        } else if (isPEGContentExtension(fileType)) {
          const parser = getParserForExtension(fileType);
          if (parser) {
            try {
              parser.parse(newContent);
            } catch (err: any) {
              const loc = err.location?.start;
              const locStr = loc ? ` (line ${loc.line}, col ${loc.column})` : '';
              return `Error${locStr}: ${err.message}`;
            }
          }
        }

        // Apply the edit
        if (onApplyEdit) {
          onApplyEdit(newContent);
        }
        return replace_all
          ? `Replaced ${occurrences} occurrences`
          : 'Edit applied';
      }
    },

    // =========================================================================
    // Read - Read file contents
    // =========================================================================
    {
      type: "function",
      function: {
        name: "Read",
        description: "Read a file from the content library. Use to see how other files are structured.",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Path to the file, e.g. 'sba/psychology/psychology_sba.olx'"
            }
          },
          required: ["file_path"]
        }
      },
      callback: async ({ file_path }: { file_path: string }) => {
        try {
          const result = await storage.read(toOlxRelativePath(file_path, 'Read tool'));
          return `# ${file_path}\n\n\`\`\`\n${result.content}\n\`\`\``;
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      }
    },

    // =========================================================================
    // Glob - Find files by pattern
    // =========================================================================
    {
      type: "function",
      function: {
        name: "Glob",
        description: "Find files matching a glob pattern. Use to discover content structure.",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Glob pattern, e.g. '**/*.olx', 'sba/**/*psychology*'"
            },
            path: {
              type: "string",
              description: "Base path to search from. Default: content root."
            }
          },
          required: ["pattern"]
        }
      },
      callback: async ({ pattern, path }: { pattern: string; path?: string }) => {
        try {
          const basePath = path ? toOlxRelativePath(path) : undefined;
          const files = await storage.glob(pattern, basePath);
          if (files.length === 0) {
            return 'No files found matching pattern.';
          }
          return `Found ${files.length} files:\n${files.join('\n')}`;
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      }
    },

    // =========================================================================
    // Grep - Search file contents
    // =========================================================================
    {
      type: "function",
      function: {
        name: "Grep",
        description: "Search file contents for a pattern. Returns matching lines with file and line number.",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Search pattern (regex supported)."
            },
            path: {
              type: "string",
              description: "Base path to search. Default: content root."
            },
            include: {
              type: "string",
              description: "Glob pattern for files to include, e.g. '*.olx'"
            }
          },
          required: ["pattern"]
        }
      },
      callback: async ({ pattern, path, include }: {
        pattern: string;
        path?: string;
        include?: string;
      }) => {
        try {
          const basePath = path ? toOlxRelativePath(path) : undefined;
          const matches = await storage.grep(pattern, { basePath, include });
          if (matches.length === 0) {
            return 'No matches found.';
          }
          const formatted = matches
            .slice(0, 50)
            .map(m => `${m.path}:${m.line}: ${m.content}`)
            .join('\n');
          const suffix = matches.length > 50 ? `\n\n... and ${matches.length - 50} more` : '';
          return `Found ${matches.length} matches:\n\n${formatted}${suffix}`;
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      }
    },

    // =========================================================================
    // Write - Create or overwrite a file
    // =========================================================================
    {
      type: "function",
      function: {
        name: "Write",
        description: "Create a new file or overwrite an existing file in the content library.",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Path for the file, e.g. 'courses/studio_sba.olx'"
            },
            content: {
              type: "string",
              description: "File content to write."
            }
          },
          required: ["file_path", "content"]
        }
      },
      callback: async ({ file_path, content }: { file_path: string; content: string }) => {
        try {
          await storage.write(toOlxRelativePath(file_path, 'Write tool'), content);
          return `File created: ${file_path}`;
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      }
    },

    // =========================================================================
    // OpenFile - Open a file in the editor
    // =========================================================================
    {
      type: "function",
      function: {
        name: "OpenFile",
        description: "Open a file in the editor. Use this after creating a new file, or when asked to open/show a file.",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Path to the file to open"
            }
          },
          required: ["file_path"]
        }
      },
      callback: async ({ file_path }: { file_path: string }) => {
        if (!onOpenFile) {
          return `Cannot open file: editor integration not available.`;
        }
        try {
          // Verify file exists first
          await storage.read(toOlxRelativePath(file_path, 'OpenFile tool'));
          onOpenFile(file_path);
          return `Opened: ${file_path}`;
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      }
    },

    // =========================================================================
    // GetBlockInfo - Get OLX block documentation (custom tool)
    // =========================================================================
    {
      type: "function",
      function: {
        name: "GetBlockInfo",
        description: "Get detailed documentation for an OLX block, including examples.",
        parameters: {
          type: "object",
          properties: {
            block_name: {
              type: "string",
              description: "Block name, e.g. 'Markdown', 'CapaProblem', 'Chat', 'LLMFeedback'"
            }
          },
          required: ["block_name"]
        }
      },
      callback: async ({ block_name }: { block_name: string }) => {
        try {
          const res = await fetch(`/api/docs/${block_name}`);
          if (!res.ok) {
            return `Block '${block_name}' not found.`;
          }
          const data = await res.json();
          if (!data.ok) {
            return `Block '${block_name}' not found.`;
          }

          const block = data.block;
          let result = `# ${block.name}\n\n`;

          if (block.description) {
            result += `${block.description}\n\n`;
          }

          if (block.readme?.content) {
            result += `## Documentation\n${block.readme.content}\n\n`;
          }

          if (block.examples?.length > 0) {
            result += `## Examples\n`;
            for (const ex of block.examples) {
              result += `### ${ex.filename}\n\`\`\`xml\n${ex.content}\n\`\`\`\n\n`;
            }
          }

          return result;
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      }
    },
  ];
}
