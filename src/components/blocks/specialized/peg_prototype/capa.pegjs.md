# CAPA Problem Markdown Format

This documents the Open edX markdown format for CAPA (Computer Assisted Personalized Approach) problems and the subset currently supported by our grammar.

## Full Open edX Syntax

The Open edX simple editor uses markdown-style formatting for problem authoring. The format is based on [LON-CAPA XML](https://openedx.atlassian.net/wiki/spaces/AC/pages/128090267/Capa+Problem+Architecture) but adapted for edX.

### Headers

```
Problem Title
=============
```

Underline text with `===` to create a header (h3).

### Questions/Prompts

```
>>What is the capital of France?<<
```

Wrap the question label in `>>` and `<<` markers.

### Multiple Choice

```
( ) Wrong answer
(x) Correct answer
( ) Another wrong answer
```

- `( )` marks a distractor (wrong answer)
- `(x)` marks the correct answer

### Checkbox (Multiple Select)

```
[ ] Wrong option
[x] Correct option 1
[x] Correct option 2
[ ] Another wrong option
```

- `[ ]` marks an incorrect option
- `[x]` marks a correct option (multiple allowed)

### Text Input

```
>>What African-American led the U.S. civil rights movement during the 1960s?<<
=Dr. Martin Luther King, Jr.
or=Dr. Martin Luther King, Junior
or=Martin Luther King, Jr.
or=Martin Luther King
```

- `=answer` marks the primary correct answer
- `or=answer` adds alternative correct answers
- `not=answer {{feedback}}` provides feedback for specific wrong answers

With feedback:
```
=Correct Answer {{Great job!}}
not=Common Wrong Answer {{Close, but think about...}}
```

### Numerical Input

```
= 42
= 3.14 +- 0.01
= [1, 5]
```

- Exact value: `= 42`
- With tolerance: `= 3.14 +- 0.01`
- Range: `= [1, 5]`

### Dropdown

```
[[wrong, (correct), also wrong]]
```

Double brackets with comma-separated options. Parentheses mark the correct answer.

### Hints

```
||This is a hint that appears when requested.||
```

Wrap hint text in `||` markers.

### Demand Hints (Sequential)

```
{{
This is the first hint.
====
This is the second hint.
====
This is the third hint.
}}
```

### Explanation

```
[explanation]
This explanation appears after the learner clicks "Show Answer".
It can contain multiple paragraphs and formatting.
[/explanation]
```

### Multiple Questions (in one component)

```
>>First question?<<
(x) Answer A
( ) Answer B

---

>>Second question?<<
( ) Answer C
(x) Answer D
```

Separate questions with `---` (three hyphens).

### Inline Feedback

```
( ) Wrong {{ Feedback for this wrong answer }}
(x) Correct {{ Feedback for selecting correct answer }}
```

Feedback in `{{ }}` after each option.

### Scripts and Variables

```
[code]
import random
x = random.randint(1, 10)
y = random.randint(1, 10)
answer = x + y
[/code]

>>What is $x + $y?<<
= $answer
```

Python code blocks for randomization, with `$variable` substitution.

---

## Currently Supported

Our `capa.pegjs` grammar supports most core features:

| Feature | Syntax | Supported |
|---------|--------|-----------|
| Headers | `Text` + newline + `===` | ✅ |
| Questions | `>>question<<` | ✅ |
| Multiple Choice | `(x)` / `( )` | ✅ |
| Checkbox | `[x]` / `[ ]` | ✅ |
| Text Input | `=answer`, `or=alt`, `not=wrong` | ✅ |
| Numerical Input | `=3.14`, `=3.14 +- 0.01`, `=[1,10]` | ✅ |
| Dropdown | `[[wrong, (correct), wrong]]` | ✅ |
| Inline Dropdown | `>>Question [[a, (b)]] more<<` | ✅ |
| Explanation | `[explanation]...[/explanation]` | ✅ |
| Multiple Questions | `---` separator | ✅ |
| Inline Feedback | `{{ feedback }}` | ✅ |
| Hints | `\|\|hint\|\|` | ✅ |
| Demand Hints | `{{ hint ==== hint ==== hint }}` | ✅ |
| Paragraphs | Plain text | ✅ |
| Scripts | `[code]...[/code]` | ❌ |
| Variable Substitution | `$variable` | ❌ |

### Comprehensive Example

```
Comprehensive CAPA Test
===

This example tests all supported syntax features.

>>Question 1: What is the capital of Japan?<<

( ) Beijing {{That's the capital of China.}}
( ) Seoul {{That's the capital of South Korea.}}
(x) Tokyo {{Correct!}}
( ) Bangkok {{That's the capital of Thailand.}}

||Think about the island nation in East Asia.||

---

>>Question 2: Select all even numbers.<<

[x] 2
[ ] 3
[x] 4
[ ] 5
[x] 6

---

>>Question 3: What is the chemical formula for table salt?<<

=NaCl
or=nacl
or=Sodium Chloride

---

>>Question 4: What is the speed of light in m/s?<<

=299792458 +- 1000

---

>>Question 5: The Earth is [[round, flat, (spherical), cubic]].<<

[explanation]
The Earth is an oblate spheroid - slightly flattened at the poles
and bulging at the equator due to its rotation.
[/explanation]
```

### AST Output

The parser produces a flat array of typed block objects:

```json
[
  { "type": "h3", "content": "Comprehensive CAPA Test" },
  { "type": "p", "content": "This example tests all supported syntax features." },
  { "type": "question", "label": "Question 1: What is the capital of Japan?" },
  { "type": "choices", "options": [
    { "selected": false, "text": "Beijing", "feedback": "That's the capital of China." },
    { "selected": true, "text": "Tokyo", "feedback": "Correct!" },
    ...
  ]},
  { "type": "hint", "content": "Think about the island nation in East Asia." },
  { "type": "separator" },
  { "type": "question", "label": "Question 2: Select all even numbers." },
  { "type": "checkboxes", "options": [
    { "checked": true, "text": "2" },
    { "checked": false, "text": "3" },
    ...
  ]},
  { "type": "separator" },
  { "type": "question", "label": "Question 3: What is the chemical formula for table salt?" },
  { "type": "textInput", "answer": "NaCl", "alternatives": ["nacl", "Sodium Chloride"] },
  { "type": "separator" },
  { "type": "question", "label": "Question 4: What is the speed of light in m/s?" },
  { "type": "numericalInput", "value": 299792458, "tolerance": 1000 },
  { "type": "separator" },
  { "type": "question", "label": ["Question 5: The Earth is ", {"type": "dropdown", "options": [...]}, "."] },
  { "type": "explanation", "content": "The Earth is an oblate spheroid..." }
]
```

---

## References

- [CAPA Problem Architecture](https://openedx.atlassian.net/wiki/spaces/AC/pages/128090267/Capa+Problem+Architecture)
- [Working with Problem Components](https://edx.readthedocs.io/projects/open-edx-building-and-running-a-course/en/open-release-lilac.master/course_components/create_problem.html)
- [Upcoming Markdown and OLX Changes](https://openedx.org/course-staff/upcoming-markdown-and-olx-changes-capa-problems/)
- [Problem Components OLX Reference](https://github.com/openedx/edx-documentation/blob/master/en_us/olx/source/components/problem-components.rst)
- [Text Input Problems](https://edx.readthedocs.io/projects/open-edx-building-and-running-a-course/en/open-release-olive.master/exercises_tools/text_input.html)
