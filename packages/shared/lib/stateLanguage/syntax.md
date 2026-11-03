# State Language Syntax

This document defines the syntax for the state language expression system.
Lines starting with `>>>` are test cases. The following lines (until blank or next `>>>`)
are the expected AST output. Lines starting with `!!!` are the opposite: input
that MUST NOT parse, because the spelling is reserved for a future meaning or
because it is malformed.

## Sigil References

We use the `@` sigil as shorthand for component state (Redux runtime values):

>>> @essay
{ "type": "SigilRef", "sigil": "@", "id": "essay", "fields": [] }

>>> @quiz.done
{ "type": "SigilRef", "sigil": "@", "id": "quiz", "fields": ["done"] }

>>> @quiz.answer.text
{ "type": "SigilRef", "sigil": "@", "id": "quiz", "fields": ["answer", "text"] }

Namespace-qualified refs use `ns/id` syntax (no quotes needed).
Namespaces support dotted segments matching id-grammar.ts:

>>> @CONTENT/quiz
{ "type": "SigilRef", "sigil": "@", "id": "CONTENT/quiz", "fields": [] }

>>> @ee101/hw1.done
{ "type": "SigilRef", "sigil": "@", "id": "ee101/hw1", "fields": ["done"] }

>>> @edu.mit.eecs6002/resistorProblem
{ "type": "SigilRef", "sigil": "@", "id": "edu.mit.eecs6002/resistorProblem", "fields": [] }

>>> @x/y
{ "type": "SigilRef", "sigil": "@", "id": "x/y", "fields": [] }

Sigil refs accept DefinitionRef-shaped IDs only (ns/leafId). For scoped
StateRef paths like `CONTENT/list:#0:answer`, use quoted syntax:

>>> @"CONTENT/list:#0:answer".value
{ "type": "SigilRef", "sigil": "@", "id": "CONTENT/list:#0:answer", "fields": ["value"] }

For full paths (cross-course references, etc.), also use quoted syntax:

>>> @"/mit.edu/pmitros/electronics/hw1/problem3"
{ "type": "SigilRef", "sigil": "@", "id": "/mit.edu/pmitros/electronics/hw1/problem3", "fields": [] }

>>> @"/mit.edu/pmitros/electronics/hw1/problem3".value
{ "type": "SigilRef", "sigil": "@", "id": "/mit.edu/pmitros/electronics/hw1/problem3", "fields": ["value"] }

>>> @"/shared/components/intro-quiz".done
{ "type": "SigilRef", "sigil": "@", "id": "/shared/components/intro-quiz", "fields": ["done"] }

The `#` sigil references static OLX content:

>>> #assignment
{ "type": "SigilRef", "sigil": "#", "id": "assignment", "fields": [] }

>>> #"/mit.edu/shared/rubrics/essay-rubric"
{ "type": "SigilRef", "sigil": "#", "id": "/mit.edu/shared/rubrics/essay-rubric", "fields": [] }

The `$` sigil references global/RCT variables:

>>> $condition
{ "type": "SigilRef", "sigil": "$", "id": "condition", "fields": [] }

## Comparison Operators

Standard comparison operators return BinaryOp nodes:

>>> @x > 5
{ "type": "BinaryOp", "op": ">", "left": { "type": "SigilRef", "sigil": "@", "id": "x", "fields": [] }, "right": { "type": "Number", "value": 5 } }

>>> @x.done === completion.done
{ "type": "BinaryOp", "op": "===", "left": { "type": "SigilRef", "sigil": "@", "id": "x", "fields": ["done"] }, "right": { "type": "MemberAccess", "object": { "type": "Identifier", "name": "completion" }, "property": "done" } }

Other comparison operators (these just need to parse, AST structure is similar):

>>> @x !== completion.notStarted
>>> @x < 5
>>> @x >= 5
>>> @x <= 5
>>> @count >= 100
>>> @score <= 0.8

## Boolean Operators

Logical AND and OR:

>>> @a && @b
{ "type": "BinaryOp", "op": "&&", "left": { "type": "SigilRef", "sigil": "@", "id": "a", "fields": [] }, "right": { "type": "SigilRef", "sigil": "@", "id": "b", "fields": [] } }

>>> @a || @b
{ "type": "BinaryOp", "op": "||", "left": { "type": "SigilRef", "sigil": "@", "id": "a", "fields": [] }, "right": { "type": "SigilRef", "sigil": "@", "id": "b", "fields": [] } }

Logical NOT:

>>> !@x
{ "type": "UnaryOp", "op": "!", "argument": { "type": "SigilRef", "sigil": "@", "id": "x", "fields": [] } }

Parentheses for grouping (parse only):

>>> (@a || @b) && @c
>>> !(@a && @b)

## Ternary Operator

Conditional expressions:

>>> @cond ? @a : @b
{ "type": "Ternary", "condition": { "type": "SigilRef", "sigil": "@", "id": "cond", "fields": [] }, "then": { "type": "SigilRef", "sigil": "@", "id": "a", "fields": [] }, "else": { "type": "SigilRef", "sigil": "@", "id": "b", "fields": [] } }

More complex ternary (parse only):

>>> $condition === "treatment" ? @treatment.value : @control.value
>>> @score > 0.8 ? "pass" : "fail"

## Arithmetic

Basic arithmetic operators:

>>> @x + 1
{ "type": "BinaryOp", "op": "+", "left": { "type": "SigilRef", "sigil": "@", "id": "x", "fields": [] }, "right": { "type": "Number", "value": 1 } }

Other arithmetic (parse only):

>>> 1 + @x
>>> @x + @y
>>> @x - @y
>>> @x * @y
>>> @x / @y
>>> @correct / @total * 100

## Function Calls

Function calls produce Call nodes:

>>> wordcount(@essay.value)
{ "type": "Call", "callee": { "type": "Identifier", "name": "wordcount" }, "arguments": [{ "type": "SigilRef", "sigil": "@", "id": "essay", "fields": ["value"] }] }

Math functions use MemberAccess for the callee:

>>> Math.round(@x)
{ "type": "Call", "callee": { "type": "MemberAccess", "object": { "type": "Identifier", "name": "Math" }, "property": "round" }, "arguments": [{ "type": "SigilRef", "sigil": "@", "id": "x", "fields": [] }] }

More function calls (parse only):

>>> wordcount(@essay.value) >= 100
>>> Math.round(@correct / @total * 100)
>>> Math.floor(@score * 10)
>>> Math.ceil(@progress)
>>> Math.min(@a, @b)
>>> Math.max(@a, @b)

### id() — namespace-qualify a content id

Stored values that contain content ids (e.g. a checkbox group's list of
selected option ids) are namespace-qualified keys like
`psych/Part_3_finished`. For exact-match comparisons, `id()` qualifies a
bare name against the expression's own content namespace, so authors never
write the namespace by hand:

>>> id('Part_3_finished') in @completion.value

Already-qualified names pass through unchanged — a cross-namespace
comparison can use `id('ee101/hw1')` or simply the plain string literal
`'ee101/hw1'`.

(parse only):

>>> id('Part_3_finished') in @completion.value
>>> id(@picker.value) === @answer.value

### Value-state predicates

Four built-ins ask what a stored value MEANS. They are documented, with a
use-case table over real block values, in `valuePredicates.ts` and
`valuePredicates.test.ts`; these are the shapes they take in expressions.

`isFilled(x)` — did the student put something here? (blank string, `[]` and
`{}` are not filled; `0` and `false` are):

>>> isFilled(@essay.value)
{ "type": "Call", "callee": { "type": "Identifier", "name": "isFilled" }, "arguments": [{ "type": "SigilRef", "sigil": "@", "id": "essay", "fields": ["value"] }] }

>>> isFilled(@tabularMCQ.value) && isFilled(@essay.value)
>>> !isFilled(@answer.value)

`isMissing(x)` — is there no response here? `isFilled`'s blanks plus `NaN`,
which is what a cleared NumberInput reads as. This is the predicate the
aggregates skip on:

>>> isMissing(@score.value)
{ "type": "Call", "callee": { "type": "Identifier", "name": "isMissing" }, "arguments": [{ "type": "SigilRef", "sigil": "@", "id": "score", "fields": ["value"] }] }

>>> isMissing(@n.value) ? 0 : @n.value
>>> !isMissing(@a.value) && !isMissing(@b.value)

`isNumber(x)` — a real, finite number. Not `NaN`, not `Infinity`, and not the
string `"3"` (the language does not coerce):

>>> isNumber(@n.value)
{ "type": "Call", "callee": { "type": "Identifier", "name": "isNumber" }, "arguments": [{ "type": "SigilRef", "sigil": "@", "id": "n", "fields": ["value"] }] }

>>> isNumber(@n.value) && @n.value > 5
>>> isNumber(@slider.value) ? Math.round(@slider.value) : 0

`isTruthy(x)` — plain JavaScript truthiness, made explicit. Note `"0"` from a
LineInput is truthy and `0` from a NumberInput is not, so this is rarely the
one you want for gating:

>>> isTruthy(@flag.value)
{ "type": "Call", "callee": { "type": "Identifier", "name": "isTruthy" }, "arguments": [{ "type": "SigilRef", "sigil": "@", "id": "flag", "fields": ["value"] }] }

>>> isTruthy(@done.value) === @done.value

## Array Literals

A list written out by the author. Elements are full expressions, so refs,
nested literals and calls all work:

>>> [1, 2]
{ "type": "Array", "elements": [{ "type": "Number", "value": 1 }, { "type": "Number", "value": 2 }] }

>>> []
{ "type": "Array", "elements": [] }

>>> [[1, 2], [3]]
{ "type": "Array", "elements": [{ "type": "Array", "elements": [{ "type": "Number", "value": 1 }, { "type": "Number", "value": 2 }] }, { "type": "Array", "elements": [{ "type": "Number", "value": 3 }] }] }

A trailing comma is allowed (JS, not JSON) — these lists are hand-edited in
XML attributes and diffed line by line:

>>> [1, 2,]
{ "type": "Array", "elements": [{ "type": "Number", "value": 1 }, { "type": "Number", "value": 2 }] }

Refs inside a literal are ordinary elements, and are subscribed like any
other ref (references.ts walks the elements):

>>> [@s09.code, @s19.code]
{ "type": "Array", "elements": [{ "type": "SigilRef", "sigil": "@", "id": "s09", "fields": ["code"] }, { "type": "SigilRef", "sigil": "@", "id": "s19", "fields": ["code"] }] }

The literal is a Primary, so everything PostfixExpr already does works on
one — methods, `.length`, and `in` — with no new rules (parse only):

>>> [1, 2].length
>>> [@a.value, @b.value].map(v => v)
>>> [1, 2, 3].filter(v => v > 1).length
>>> @x.value in ["agree", "strongly_agree"]
>>> average([@s09.code, @s19.code], {weights: [1, 2]})
>>> {a: [1, 2]}
>>> [{a: 1}, {a: 2}]

An arrow is not a value in this language, only a call argument, so a bare
arrow in a literal is a syntax error:

!!! [v => v]

Indexing is RESERVED, not implemented. `x[0]` stays a parse error so the
spelling is free for whenever there is a use for it:

!!! a[0]
!!! @x.value[0]
!!! [1, 2][0]

Malformed literals are errors, not silent holes:

!!! [
!!! ]
!!! [1, 2
!!! [,]
!!! [1,,2]
!!! [1 2]

## Array Aggregation

Member access on arrays (e.g., caller-provided target lists):

>>> items.length
{ "type": "MemberAccess", "object": { "type": "Identifier", "name": "items" }, "property": "length" }

Array methods with arrow functions:

>>> items.every(c => c.done === completion.done)
{ "type": "Call", "callee": { "type": "MemberAccess", "object": { "type": "Identifier", "name": "items" }, "property": "every" }, "arguments": [{ "type": "ArrowFunction", "param": "c", "body": { "type": "BinaryOp", "op": "===", "left": { "type": "MemberAccess", "object": { "type": "Identifier", "name": "c" }, "property": "done" }, "right": { "type": "MemberAccess", "object": { "type": "Identifier", "name": "completion" }, "property": "done" } } }] }

More aggregation patterns (parse only):

>>> items.some(c => c.correct === correctness.correct)
>>> items.filter(c => c.correct === correctness.correct).length
>>> items.filter(c => c.correct === correctness.correct).length >= 3
>>> items.map(c => c.value)
>>> items.map(c => c.value).join(", ")
>>> !items.some(c => c.correct === correctness.incorrect)
>>> items.filter(c => c.id === @selected)
>>> items.find(c => c.id === @current).value

## Aggregates

`sum`, `countFilled` and `average` take ONE list and skip the elements the
student hasn't answered. "Unanswered" is `isMissing`: `isFilled`'s blanks
(`null`, `undefined`, `""`, whitespace-only, `[]`, `{}`) plus `NaN`, which is
what a cleared NumberInput reads as. All three share that one predicate, so
`sum` and `countFilled` can never disagree about which items exist.

The semantics are pinned, executably, in `aggregates.test.ts` — the
expectations there ARE the contract, and changing one re-scores every
archived response with no parse error anywhere. In summary:

```
sum([1, 2, 3])                        → 6
sum([1, @blank.value, 2])             → 3          missing skipped
sum([])                               → 0          identity
sum(["1", 2])                         → TypeError  no coercion
sum([true, 1])                        → TypeError  booleans are not numbers
sum(3)                                → TypeError  one list, not varargs

countFilled([@a.value, @blank.value, 0, false])  → 3   0 and false are VALUES
countFilled(["  ", [], {}])           → 0          isFilled's blanks
countFilled([])                       → 0

average([1, 2, 3, @blank.value])      → 2
average([])                           → undefined  absent, not NaN and not 0
average([1, 2, 3], {weights: [1, 1, 2]})     → 2.25
average([1, @blank.value, 3], {weights: [1, 5, 1]})  → 2   pair-dropped
average([1, 2], {weights: [1, 5, 1]}) → TypeError  length mismatch
average([1, 2], {weight: [1, 1]})     → TypeError  typos fail loudly
```

`.length` counts SLOTS (SQL's `COUNT(*)`); `countFilled` counts VALUES
(`COUNT(col)`). `[1, @blank.value].length` is 2 while
`countFilled([1, @blank.value])` is 1, and them disagreeing by the number of
blanks is the likeliest author bug in this kind of content.

For ONE CheckboxInput, the stored value is already the list of selected ids,
so "pick exactly 2" stays `@cb.value.length === 2`. `countFilled` is for
ACROSS inputs — "answered at least 3 of these 5" — where an unanswered
checkbox is one blank item.

The shapes these take in expressions (parse only):

>>> sum([@s09.code, @s19.code])
{ "type": "Call", "callee": { "type": "Identifier", "name": "sum" }, "arguments": [{ "type": "Array", "elements": [{ "type": "SigilRef", "sigil": "@", "id": "s09", "fields": ["code"] }, { "type": "SigilRef", "sigil": "@", "id": "s19", "fields": ["code"] }] }] }

>>> countFilled([@s09.value, @s19.value, @s06.value]) >= 2
>>> average([@s09.code, @s19.code, @s06.code])
>>> average([@s09.code, @s19.code], {weights: [1, 2]})
>>> Math.round(50 + 50 * average([@s09.code, @s19.code, @s06.code]) / 2)
>>> sum([@a.value, @b.value].map(v => v * 2))
>>> countFilled([@s09.code, @s19.code]) > 0 ? average([@s09.code, @s19.code]) : 50

`undefined` is a reserved word with no literal rule, so an absent average is
tested with `countFilled(...) > 0` (or left to the consumer — a
NumberLineInput `initial=` already falls back to its midpoint on `undefined`),
not compared against `undefined`:

!!! average([]) === undefined

There is NO unary minus in this language: codes live on the item
(`code="-1"`), so a negative number is written as a subtraction where one is
genuinely needed. A leading `-` is a syntax error:

!!! sum([-1, 1])
!!! -@x.value

## String Literals

Strings produce String nodes:

>>> "hello"
{ "type": "String", "value": "hello" }

>>> 'world'
{ "type": "String", "value": "world" }

Sigils inside strings are NOT expanded:

>>> "@notexpanded"
{ "type": "String", "value": "@notexpanded" }

## Template Literals

Template literals with expressions:

>>> `prefix ${@x} suffix`
{ "type": "TemplateLiteral", "parts": [{ "type": "TemplateText", "value": "prefix " }, { "type": "TemplateExpr", "expression": { "type": "SigilRef", "sigil": "@", "id": "x", "fields": [] } }, { "type": "TemplateText", "value": " suffix" }] }

>>> `Score: ${@correct}/${@total}`

## Real-World Examples

These are realistic expressions that should all parse:

>>> @quiz.correct === correctness.correct || @quiz.attemptsRemaining === 0
>>> @intro.done === completion.done && @quiz.done === completion.done
>>> (@quiz1.correct === correctness.correct || @quiz1.done === completion.closed) && @essay.done === completion.done
>>> wordcount(@essay.value) > 25
>>> $condition === "treatment" ? @treatment.value : @control.value
>>> Math.round(@correct / @total * 100)
>>> items.filter(c => c.correct === correctness.correct).length
>>> items.every(c => c.done === completion.done)

## Edge Cases

Simple identifiers:

>>> @id
{ "type": "SigilRef", "sigil": "@", "id": "id", "fields": [] }

>>> @_private
{ "type": "SigilRef", "sigil": "@", "id": "_private", "fields": [] }

>>> @quiz1
{ "type": "SigilRef", "sigil": "@", "id": "quiz1", "fields": [] }

Mixed sigils in one expression:

>>> @user + #greeting + $locale

Repeated references:

>>> @x + @x

## Numbers

>>> 42
{ "type": "Number", "value": 42 }

>>> 3.14
{ "type": "Number", "value": 3.14 }

>>> 0.5
{ "type": "Number", "value": 0.5 }
