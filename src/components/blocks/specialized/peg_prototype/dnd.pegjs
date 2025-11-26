/*
 * Drag-and-Drop Problem Format Grammar
 * ------------------------------------
 * This grammar defines a clean, teacher-friendly, and machine-parseable format
 * for authoring drag-and-drop activities in educational content. Designed with
 * simplicity and readability in mind, it allows instructional designers to
 * define problems visually tied to an image, where learners drag items (images
 * or text) onto predefined targets.
 *
 * The format supports:
 * - An image declaration (e.g. Image: body_diagram.png)
 * - An optional prompt to guide the learner
 * - Simple key-value metadata (e.g. Difficulty: Easy)
 * - A list of targets (with rectangular coordinates and optional metadata)
 * - Sources (text, images, or special items) that can be matched to targets
 * - Distractor items (sources with no target)
 * - Comments and whitespace-tolerant formatting
 *
 * Each item (target or source) can be:
 * - An image file (e.g. Head.png, ending in .png/.jpg/.jpeg/.gif)
 * - A quoted text label (e.g. "Stomach")
 * - A special UI element (e.g. [textarea label="Notes"])
 *
 * Target definitions use the format:
 *   Item -> [x1, y1, x2, y2]
 * followed by optional metadata lines:
 *   key: value
 *
 * Example:
 *
 *   Image: anatomy_diagram.png
 *   Prompt: "Label the parts of the body"
 *
 *   # Targets
 *   Head.png -> [100, 50, 180, 120]
 *     id: head
 *     label: "Human head"
 *     hint: "The head goes on top"
 *
 *   "Stomach" -> [250, 500, 310, 560]
 *   [textarea label="Notes"] -> [10, 10, 200, 50]
 *
 *   # Distractors
 *   Random_Label.png
 *   "Liver?"
 *
 * Future features may include:
 * - Grouped targets or zones
 * - Multi-target matching or partial credit
 * - Feedback-specific metadata (per item or overall)
 * - Conditional visibility or staged reveals
 * - Integrated hints, scoring weights, or constraints
 * - Multiple correct mappings (for advanced layouts)
 * - Inline feedback or explanations per target/item
 *
 * The goal is to empower educators to write accurate and expressive
 * drag-and-drop problems with minimal syntax, while enabling robust parsing
 * and rendering in learning platforms.
 */

// Entry point
Start
  = _ entries:(Entry (_ Entry)*)? _ {
      const flat = entries ? [entries[0], ...entries[1].map(e => e[1])] : [];
      return flat;
    }

// One line or block in the file
Entry
  = ImageLine
  / PromptLine
  / PropertyLine
  / TargetBlock
  / SourceOnly
  / CommentLine

// Lines
ImageLine
  = "Image:" _ value:Word _ { return { type: "image", value }; }

PromptLine
  = "Prompt:" _ text:QuotedText _ { return { type: "prompt", text }; }

PropertyLine
  = key:Word ":" _ value:Word _ { return { type: "property", key, value }; }

CommentLine
  = "#" (!Newline .)* Newline { return null; }

// Source item with no associated target
SourceOnly
  = item:(ImageFile / QuotedText / SpecialItem) _ { return { type: "source", item }; }

// Target with optional metadata
TargetBlock
  = head:TargetLine tail:(_ MetadataLine)* {
      const metadata = Object.fromEntries(tail.map(x => [x.key, x.value]));
      return { type: "target", ...head, ...metadata };
    }

// Target item with coordinates
TargetLine
  = item:(ImageFile / QuotedText / SpecialItem) _ "->" _ coords:Coords _ {
      return { item, coords };
    }

// Metadata for a target (e.g., id: foo)
MetadataLine
  = key:Word ":" _ value:QuotedText? Word? _ {
      return { key, value: value ?? null };
    }

// Coordinate array like [10, 20, 30, 40]
Coords
  = "[" _ x1:Number "," _ y1:Number "," _ x2:Number "," _ y2:Number _ "]" {
      return [x1, y1, x2, y2];
    }

// Image file ends in an image extension
ImageFile
  = name:Word "." ext:("png" / "jpg" / "jpeg" / "gif") {
      return name + "." + ext;
    }

// Text like "Stomach"
QuotedText
  = "\"" chars:([^"\n\r] / "\\\"")* "\"" {
      return chars.join("");
    }

// Special item like [textarea label="foo"]
SpecialItem
  = "[" name:Word attrs:(_ Attr)* "]" {
      const attrObj = {};
      for (const [, { key, value }] of attrs) {
        attrObj[key] = value;
      }
      return { type: "special", name, attrs: attrObj };
    }

Attr
  = key:Word "=" value:QuotedText {
      return { key, value };
    }

// Words and values
Word
  = [a-zA-Z0-9_./-]+ { return text(); }

Number
  = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

// Whitespace and control
Newline = "\r\n" / "\n" / "\r"
_ = [ \t]*  // Skip whitespace