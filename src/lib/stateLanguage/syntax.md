# State Language Syntax

This document defines the syntax for the state language expression system.
Lines starting with `>>>` are test cases. The following lines (until blank or next `>>>`)
are the expected AST output.

## Sigil References

We use the `@` sigil as shorthand for component state (Redux runtime values):

>>> @essay
{ "type": "SigilRef", "sigil": "@", "id": "essay", "fields": [] }

>>> @quiz.done
{ "type": "SigilRef", "sigil": "@", "id": "quiz", "fields": ["done"] }

>>> @quiz.answer.text
{ "type": "SigilRef", "sigil": "@", "id": "quiz", "fields": ["answer", "text"] }

For full paths (cross-course references, etc.), use quoted syntax:

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
