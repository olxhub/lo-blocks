// src/lib/editor/tools.js
//
// Tools for the editor LLM assistant.
//

/**
 * Create the tools array for useChat().
 *
 * @param {object} params
 * @param {function} params.onProposeEdit - Called when LLM proposes an edit
 * @param {string} params.currentContent - Current file content (for validation)
 */
export function createEditorTools({ onProposeEdit }) {
  return [
    {
      type: "function",
      function: {
        name: "applyEdit",
        description: "Apply an edit to the current file. The edit is applied immediately. Only use this when the user explicitly asks you to modify, change, add, or fix something in the file. Do NOT use this for summarizing, explaining, or answering questions about the content.",
        parameters: {
          type: "object",
          properties: {
            oldText: {
              type: "string",
              description: "The exact text to find and replace. Must be non-empty and must exist in the file."
            },
            newText: {
              type: "string",
              description: "The replacement text"
            },
            explanation: {
              type: "string",
              description: "Brief explanation of why this change is being made"
            }
          },
          required: ["oldText", "newText"]
        }
      },
      callback: async ({ oldText, newText, explanation }) => {
        // Validate oldText is not empty
        if (!oldText || oldText.trim() === '') {
          return 'Error: oldText cannot be empty. You must specify exact text to replace.';
        }

        if (onProposeEdit) {
          onProposeEdit({ oldText, newText, explanation });
        }
        return `Edit applied: ${explanation || 'change made'}`;
      }
    },
    {
      type: "function",
      function: {
        name: "getBlockInfo",
        description: "Get detailed documentation for a specific OLX block, including examples.",
        parameters: {
          type: "object",
          properties: {
            blockName: {
              type: "string",
              description: "The block name, e.g. 'Markdown', 'ChoiceInput', 'MasteryBank'"
            }
          },
          required: ["blockName"]
        }
      },
      callback: async ({ blockName }) => {
        try {
          const res = await fetch(`/api/docs/${blockName}`);
          if (!res.ok) {
            return `Block '${blockName}' not found.`;
          }
          const data = await res.json();
          if (!data.ok) {
            return `Block '${blockName}' not found.`;
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
        } catch (err) {
          return `Error fetching block info: ${err.message}`;
        }
      }
    }
  ];
}
