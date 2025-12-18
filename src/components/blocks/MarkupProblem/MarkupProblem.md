# MarkupProblem

Simple markup language for authoring interactive problems. Uses edX-style syntax
that's easier to write than full OLX.

## Syntax

### Headers
```
Question Title
===
```

### Question Labels
```
>>What is the answer?<<
```

### Multiple Choice
```
( ) Wrong answer
(x) Correct answer
( ) Another wrong answer
```

### Checkboxes (multi-select)
```
[ ] Unchecked option
[x] Checked correct option
[x] Another checked option
```

### Text Input
```
= correct answer
or= alternative correct answer
not= wrong answer {{feedback for this wrong answer}}
```

### Numerical Input
```
= 3.14
= 3.14 +- 0.01
= [1, 10]
```

### Hints
```
||Hint text shown inline||
```

### Demand Hints (progressive)
```
{{
First hint
====
Second hint
====
Third hint
}}
```

### Explanations
```
[explanation]
Shown after correct answer
[/explanation]
```

## Examples

See the demo file for complete examples.
