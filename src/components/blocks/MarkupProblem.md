# Markup Problem

We would like to implement a problem similar to Open edX markup problems. This format appears to be defined in:

https://github.com/openedx/frontend-app-authoring/blob/208b0c9195c6bce628cf67e490bb866e82c02a9a/src/editors/utils/convertMarkdownToXML.js

A short description:

https://edx.readthedocs.io/projects/open-edx-building-and-running-a-course/en/open-release-ginkgo.master/exercises_tools/multiple_choice.html

This file defines the translation layer in Open edX. It's a mess of regular expressions, and this document is our current understanding of what's done in the file.

## General

- Blank lines separate paragraphs.
- Each problem component is separated by a line containing `---` (three dashes).
- All XML output is ultimately wrapped in a single `<problem>...</problem>` block.
- Each problem block becomes a major "grader type" (e.g., multiple choice, option grader, string grader, etc). In Open edX and LON-CAPA, this was called a "response type."

---

## 1. Headers

- Create a level-3 header by writing a line of text directly above a line consisting of `===` (three or more equal signs):

  ```
  Topic Title
  ===
  ```

  This is converted to:

  ```xml
  <h3 class="hd hd-2 problem-header">Topic Title</h3>
  ```

---

## 2. Questions & Descriptions

- Use the following syntax to specify a question (and optionally, a description):

  ```
  >>What is 2+2?<<
  >>What is 2+2?||This question tests basic arithmetic.<<
  ```

  This converts to:

  ```xml
  <label>What is 2+2?</label>
  <description>This question tests basic arithmetic.</description>
  ```

---

## 3. Demand Hints

- To add a demand hint (displayed as a hint when students request it), use:

  ```
  || This is a hint ||
  ```

  Multiple hints can be listed on separate lines. These will be collected and wrapped at the end in:

  ```xml
  <demandhint>
    <hint>This is a hint</hint>
  </demandhint>
  ```

---

## 4. Inline Hints

- To add an inline hint, use double curly braces `{{ ... }}`.
- To label a hint (for multiple hints), use `label::` before the hint:

  ```
  Answer {{ This is a hint }}
  Answer {{ label::This is a hint }}
  ```

- For options or choices, you can attach hints the same way.

---

## 5. Option Grader

- **Old style, single-line**:  
  List options separated by commas; enclose the correct answer in parentheses:

  ```
  [[ red, (blue), green ]]
  ```

  Converts to:

  ```xml
  <OptionGrader>
    <optioninput options="('red','blue','green')" correct="blue"></optioninput>
  </OptionGrader>
  ```

- **New style, multi-line**:  
  Each line inside `[[ ... ]]` is an option.  
  Parentheses around the option denote the correct answer.

  ```
  [[
  red
  (blue)
  green
  ]]
  ```

  Converts to:

  ```xml
  <OptionGrader>
    <optioninput>
      <option correct="False">red</option>
      <option correct="True">blue</option>
      <option correct="False">green</option>
    </optioninput>
  </OptionGrader>
  ```

- Hints for options:  
  ```
  (blue) {{ This is a hint }}
  ```

---

## 6. Multiple Choice (Single or Multiple Answer)

- Each option starts with a parenthesized code, e.g., `(x)` for correct, `( )` for incorrect.

  - `(x)` or `(X)` = correct
  - `( )` = incorrect
  - `(x@)` = correct and fixed (not shuffled)
  - `(!)` in any option enables shuffle for all

  Example:

  ```
  (x) Apple {{ selected: Good! , unselected: Remember apple is a fruit. }}
  ( ) Carrot
  ( ) Banana
  ```

  Converts to:

  ```xml
  <MultipleChoiceGrader>
    <choicegroup type="MultipleChoice">
      <choice correct="true">Apple
        <choicehint selected="true">Good!</choicehint>
        <choicehint selected="false">Remember apple is a fruit.</choicehint>
      </choice>
      ...etc
    </choicegroup>
  </MultipleChoiceGrader>
  ```

---

## 7. Checkbox Group (Multiple Selection)

- Each line starts with `[ ]` for incorrect or `[x]` for correct.

  ```
  [x] Apple
  [ ] Carrot
  [x] Banana
  ```

  Converts to:

  ```xml
  <ChoiceGrader>
    <checkboxgroup>
      <choice correct="true">Apple</choice>
      <choice correct="false">Carrot</choice>
      <choice correct="true">Banana</choice>
    </checkboxgroup>
  </ChoiceGrader>
  ```

- **Hints for choices**:  
  Attach using `{{ selected: ..., unselected: ... }}` inside a choice.

---

## 8. Compound Hints (Checkbox)

- To specify a hint for a particular combination of answers in a checkbox group:

  ```
  {{ ((A*B)) This is a hint if A and B are both selected }}
  ```

  Converts to:

  ```xml
  <compoundhint value="A*B">This is a hint if A and B are both selected</compoundhint>
  ```

---

## 9. String and Numerical Graders

**String Grader:**

- Start lines with `s=` or `=`.
- The first answer is the correct one.  
- `or=` adds additional correct answers.  
- `not=` specifies answers that should produce a specific hint.

  ```
  s= cat {{ Correct! }}
  or= feline {{ Good synonym! }}
  not= dog {{ Not quite. }}
  ```

  Converts to:

  ```xml
  <StringGrader answer="cat" type="ci">
    <correcthint>Correct!</correcthint>
    <additional_answer answer="feline">
      <correcthint>Good synonym!</correcthint>
    </additional_answer>
    <stringequalhint answer="dog">Not quite.</stringequalhint>
    <textline size="20"/>
  </StringGrader>
  ```

- To treat the answer as a regular expression, start with `|`:

  ```
  s= |cat[s]? {{ Accepts cat or cats }}
  ```

**Numerical Grader:**

- Start lines with `=`, optionally with tolerance: `= 5 +- 0.1`
- Ranges: `= [5,7)` or `= (5, 7]`
- `or=` for alternative correct answers.

  ```
  = 8
  or= 2*4
  = [5,7)
  ```

  Converts to:

  ```xml
  <NumericalGrader answer="8">
    <formulaequationinput />
  </NumericalGrader>
  ...
  <NumericalGrader answer="[5,7)">
    <formulaequationinput />
  </NumericalGrader>
  ```

---

## 10. Explanation Blocks

- To add a solution/explanation, use:

  ```
  [explanation]
  This is the explanation.
  [/explanation]
  ```

  Converts to:

  ```xml
  <solution>
    <div class="detailed-solution">
    Explanation

    This is the explanation.
    </div>
  </solution>
  ```

---

## 11. Code Blocks

- Wrap code in `[code] ... [/code]`:

  ```
  [code]
  print("Hello, world!")
  [/code]
  ```

  Converts to:

  ```xml
  <pre><code>print("Hello, world!")</code></pre>
  ```

---

## 12. Paragraphs

- Any text not in a block or special construct is wrapped as a paragraph:

  ```
  This is a paragraph.

  Another paragraph.
  ```

  Converts to:

  ```xml
  <p>This is a paragraph.</p>
  <p>Another paragraph.</p>
  ```

---

## 13. Separators

- Use `---` (on its own line) to separate different problem blocks (e.g., multiple questions in one problem).

---

## Summary Table

| Markdown Construct                   | XML Output            | Notes                          |
|-------------------------------------- |---------------------- |------------------------------- |
| `===` under text                     | `<h3>` header         |                                |
| `>>question<<`                       | `<label>`             |                                |
| `>>q||desc<<`                        | `<label>`, `<description>`|                            |
| `|| hint ||`                         | `<demandhint><hint>`  | At end of problem              |
| `[[ ... ]]`                          | `<OptionGrader>`    | Inline/multiline options       |
| `(x)`/`( )` lines                    | `<MultipleChoiceGrader>`| Single/multi select        |
| `[x]`/`[ ]` lines                    | `<ChoiceGrader>`    | Checkbox group                 |
| `{{ ... }}`                          | `<choicehint>` etc    | Inline hints                   |
| `=`, `s=`, `or=`, `not=` lines       | `<StringGrader>`, `<NumericalGrader>`| |
| `[code] ... [/code]`                 | `<pre><code>`         |                                |
| `[explanation] ... [/explanation]`   | `<solution>`          |                                |
| blank line                           | `<p>`                 | If not inside another tag      |
| `---`                                | Separate question     |                                |

---

## Additional Notes

- **Whitespace**: Extra blank lines are collapsed.
- **Order**: If a block contains both a question and a grader type, the question and description are inserted before the input type.
- **Labels in hints**: Use `label::` before the hint text to label a hint for a particular choice.

---

## Example Problem

```
>>What is 2+2?<<
[[ 3, (4), 5 ]]

[explanation]
The sum of 2 and 2 is 4.
[/explanation]
```

Result:

```xml
<problem>
  <label>What is 2+2?</label>
  <OptionGrader>
    <optioninput options="('3','4','5')" correct="4"></optioninput>
  </OptionGrader>
  <solution>
    <div class="detailed-solution">
    Explanation

    The sum of 2 and 2 is 4.
    </div>
  </solution>
</problem>
```
