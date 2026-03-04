/**
 * Strips common leading whitespace from multi-line strings.
 * Useful for processing indented content in XML/OLX that should render without the indent.
 *
 * @param {string} text - The text to strip indent from
 * @returns {string} - Text with common indent removed
 */
export function stripIndent(text) {
  if (typeof text !== 'string') {
    const errorMsg = `stripIndent expects a string input, but received ${typeof text}`;
    const preview = text === null ? 'null' :
                    text === undefined ? 'undefined' :
                    typeof text === 'object' ? `object with keys: ${Object.keys(text).slice(0, 5).join(', ')}` :
                    String(text).slice(0, 100);
    throw new Error(`${errorMsg}. Value preview: ${preview}`);
  }

  if (!text.trim()) {
    return '';
  }

  const lines = text.split('\n');

  // Remove leading and trailing empty lines
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  if (!lines.length) {
    return '';
  }

  // Find the minimum indentation (ignoring empty lines)
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim()) { // Skip empty lines
      const match = line.match(/^(\s*)/);
      const indent = match ? match[1].length : 0;
      minIndent = Math.min(minIndent, indent);
    }
  }

  // If no common indent found, return as-is
  if (minIndent === Infinity || minIndent === 0) {
    return lines.join('\n');
  }

  // Strip the common indent from all lines
  return lines.map(line =>
    line.length >= minIndent ? line.slice(minIndent) : line
  ).join('\n');
}