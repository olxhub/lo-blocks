# MarkupProblem

Simple markup language for authoring interactive problems. Uses edX-style syntax that's easier to write than full OLX.

```olx:playground
<MarkupProblem id="demo" title="Quick Demo"><![CDATA[
>>What is 2 + 2?<<

( ) 3
(x) 4
( ) 5

||Think about counting on your fingers.||

[explanation]
2 + 2 = 4
[/explanation]
]]></MarkupProblem>
```

## Syntax Reference

### Headers
```
Problem Title
===
```

### Question Labels
```
>>What is the answer?<<
```

### Multiple Choice (radio)
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

### Inline Hints
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

## Examples by Type

### Multiple Choice

```olx:playground
<MarkupProblem id="mcq" title="Geography"><![CDATA[
>>What is the capital of France?<<

( ) London
(x) Paris
( ) Berlin

[explanation]
Paris is the capital and largest city of France.
[/explanation]
]]></MarkupProblem>
```

### Checkboxes

```olx:playground
<MarkupProblem id="checkbox" title="Math"><![CDATA[
>>Select all prime numbers:<<

[x] 2
[x] 3
[ ] 4
[x] 5

||A prime number is only divisible by 1 and itself.||
]]></MarkupProblem>
```

### Text Input

```olx:playground
<MarkupProblem id="text" title="Science"><![CDATA[
>>What color is the sky on a clear day?<<

= blue
or= Blue
not= red {{That's the color at sunset!}}
]]></MarkupProblem>
```

### Numerical Input

```olx:playground
<MarkupProblem id="numerical" title="Math"><![CDATA[
>>What is pi to two decimal places?<<

= 3.14 +- 0.01

{{
Pi is the ratio of a circle's circumference to its diameter.
====
It starts with 3.14159...
}}
]]></MarkupProblem>
```
