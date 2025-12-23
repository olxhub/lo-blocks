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

### Multiple Choice (radio)

```olx:playground
<MarkupProblem id="markup_radio" title="Geography Quiz">
What is the capital of France?
===
( ) London
(x) Paris
( ) Berlin
</MarkupProblem>
```

### Checkboxes (multi-select)

```xml
<MarkupProblem id="markup_checkbox">
Select all prime numbers:
===
[x] 2
[x] 3
[ ] 4
[x] 5
[ ] 6
</MarkupProblem>
```

### Text Input

```xml
<MarkupProblem id="markup_text">
What color is the sky?
===
= blue
or= Blue
</MarkupProblem>
```

### Numerical Input

```xml
<MarkupProblem id="markup_numerical">
What is pi to two decimal places?
===
= 3.14 +- 0.01
</MarkupProblem>
```
