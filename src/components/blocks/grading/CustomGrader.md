# CustomGrader

Execute custom JavaScript code for grading scenarios that can't be expressed with declarative graders.

## When to Use CustomGrader

Use CustomGrader when you need:
- **Partial credit** based on how close an answer is
- **Multiple valid formats** (e.g., "0.5", "1/2", "50%", "half")
- **Domain-specific validation** (e.g., standard resistor values, chemical formulas)
- **Complex multi-input logic** (e.g., two values that must satisfy a relationship)

For simple cases, prefer declarative graders:
- `StringGrader` - exact or regex text matching
- `NumericalGrader` - numeric answers with tolerance
- `RulesGrader` - multiple rules with different scores/feedback

## Basic Usage

```olx:playground
<CapaProblem id="ultimate-question" title="The Ultimate Question">
  <Markdown>What is the answer to life, the universe, and everything?</Markdown>
  <LineInput id="answer" />
  <CustomGrader target="answer"><![CDATA[
    const value = parseFloat(input);
    if (isNaN(value)) return { correct: 'invalid', message: 'Please enter a number' };
    if (value === 42) return { correct: 'correct', message: 'You found the answer!' };
    if (Math.abs(value - 42) < 5) {
      const hint = value < 42 ? 'a bit low' : 'a bit high';
      return { correct: 'partially-correct', score: 0.5, message: `Close! That's ${hint}.` };
    }
    const hint = value < 42 ? 'Too low' : 'Too high';
    return { correct: 'incorrect', message: `${hint}. Try again.` };
  ]]></CustomGrader>
</CapaProblem>
```

**Note:** CapaProblem automatically provides Submit/Reset buttons and wires them to the grader.

## Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Unique identifier for the grader |
| `target` | Yes | Comma-separated IDs of input blocks to grade |
| `src` | No | Path to external `.js` file containing grading code |

**Note:** Unlike other graders, `target` is required because CustomGrader's children contain code, not input blocks.

## Available Variables

Your code has access to:

| Variable | Type | Description |
|----------|------|-------------|
| `input` | any | The value from the first (or only) input |
| `inputs` | array | Array of all input values (for multi-input grading) |
| `CORRECTNESS` | object | Enum with `CORRECT`, `INCORRECT`, `PARTIALLY_CORRECT`, etc. |
| `Math` | object | Standard JavaScript Math object |

## Return Value

Your code must return an object with:

```javascript
{
  correct: 'correct' | 'incorrect' | 'partially-correct' | 'invalid' | 'unsubmitted',
  message: 'Optional feedback string',
  score: 0.5  // Optional, 0-1, defaults based on correct value
}
```

**Shortcuts:**
- Return `true` → `{ correct: 'correct' }`
- Return `false` → `{ correct: 'incorrect' }`

## Examples

### Flexible Format Acceptance

Accept multiple representations of the same value:

```olx:playground
<CapaProblem id="half-value" title="Expressing One-Half">
  <Markdown>Enter one-half in any format (0.5, 1/2, 50%, half):</Markdown>
  <LineInput id="half" />
  <CustomGrader target="half"><![CDATA[
    const s = (input || '').toLowerCase().trim();
    if (!s) return { correct: 'unsubmitted' };

    // Accept various formats
    if (s === '0.5' || s === '.5') return { correct: 'correct', message: 'Decimal form' };
    if (s === '1/2') return { correct: 'correct', message: 'Fraction form' };
    if (s === '50%') return { correct: 'correct', message: 'Percentage form' };
    if (s === 'half' || s === 'one half') return { correct: 'correct', message: 'Word form' };

    // Check numeric equivalence
    const n = parseFloat(s);
    if (!isNaN(n) && Math.abs(n - 0.5) < 0.001) return { correct: 'correct' };

    return { correct: 'incorrect', message: 'Try a different format' };
  ]]></CustomGrader>
</CapaProblem>
```

### Multi-Input Validation

Grade two inputs that must satisfy a relationship:

```olx:playground
<CapaProblem id="voltage-divider" title="Voltage Divider Design">
  <Markdown>Design a voltage divider to produce 0.2V from 1V. Enter R1 and R2:</Markdown>
  <Markdown>R1 (top resistor):</Markdown>
  <LineInput id="r1" />
  <Markdown>R2 (bottom resistor):</Markdown>
  <LineInput id="r2" />
  <CustomGrader target="r1, r2"><![CDATA[
    const [r1, r2] = inputs.map(parseFloat);
    if (isNaN(r1) || isNaN(r2)) return { correct: 'invalid', message: 'Enter numbers' };

    const ratio = r2 / (r1 + r2);
    const target = 0.2;

    if (Math.abs(ratio - target) / target <= 0.05) {
      return { correct: 'correct', message: `Ratio = ${ratio.toFixed(3)}` };
    }
    return { correct: 'incorrect', message: `Ratio is ${ratio.toFixed(3)}, need ${target}` };
  ]]></CustomGrader>
</CapaProblem>
```

### Partial Credit

Award partial credit based on answer quality:

```olx:playground
<CapaProblem id="pi-estimate" title="Estimate Pi">
  <Markdown>What is the value of pi (to at least 2 decimal places)?</Markdown>
  <LineInput id="estimate" />
  <CustomGrader target="estimate"><![CDATA[
    const answer = parseFloat(input);
    const correct = 3.14159;

    if (isNaN(answer)) return { correct: 'invalid', message: 'Please enter a number' };

    const error = Math.abs(answer - correct) / correct;

    if (error < 0.001) return { correct: 'correct', score: 1, message: 'Excellent precision!' };
    if (error < 0.01) return { correct: 'partially-correct', score: 0.8, message: 'Good approximation' };
    if (error < 0.1) return { correct: 'partially-correct', score: 0.5, message: 'Rough estimate' };
    return { correct: 'incorrect', message: 'Too far off' };
  ]]></CustomGrader>
</CapaProblem>
```

### Domain-Specific Validation

Validate against domain constraints (e.g., standard resistor values):

```olx:playground
<CapaProblem id="e24-check" title="Standard Resistor Value">
  <Markdown>Enter any standard E24 resistor value (e.g., 1k, 2.2k, 4.7k):</Markdown>
  <LineInput id="resistor" />
  <CustomGrader target="resistor"><![CDATA[
    const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
                 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

    function isStandard(r) {
      let n = r;
      while (n >= 10) n /= 10;
      while (n < 1) n *= 10;
      return E24.some(std => Math.abs(n - std) / std < 0.02);
    }

    const value = parseFloat(input);
    if (isNaN(value)) return { correct: 'invalid', message: 'Please enter a number' };
    if (!isStandard(value)) return { correct: 'incorrect', message: 'Not a standard E24 value' };
    return { correct: 'correct', message: `${value} is a valid E24 value` };
  ]]></CustomGrader>
</CapaProblem>
```

## Handling Special Characters

JavaScript code frequently uses `<`, `>`, and `&` which are special in XML. Three options:

### Option 1: XML Entity Escaping

| Character | Escape |
|-----------|--------|
| `<` | `&lt;` |
| `>` | `&gt;` |
| `&` | `&amp;` |

```xml
<CustomGrader target="answer">
  if (x &lt; 5 &amp;&amp; y &gt; 0) return { correct: 'correct' };
</CustomGrader>
```

### Option 2: CDATA Section (Recommended for complex code)

CDATA sections let you write code without escaping:

```olx:playground
<CapaProblem id="range-check" title="Range Check">
  <Markdown>Enter a number between 0 and 5:</Markdown>
  <LineInput id="answer" />
  <CustomGrader target="answer"><![CDATA[
    const x = parseFloat(input);
    if (isNaN(x)) return { correct: 'invalid', message: 'Enter a number' };
    if (x > 0 && x < 5) {
      return { correct: 'correct', message: 'In range!' };
    }
    return { correct: 'incorrect', message: 'Out of range' };
  ]]></CustomGrader>
</CapaProblem>
```

### Option 3: External File with src=

For complex graders, keep code in a separate `.js` file:

```xml
<CustomGrader target="answer" src="./graders/voltage-divider.js" />
```

The file path is resolved relative to the OLX file location. This keeps your OLX clean and allows reusing grading code across problems.

## Security and Portability

CustomGrader executes JavaScript code using `new Function()`. This has security implications:

- **Browser-only**: CustomGrader is disabled in Node.js environments and will throw an exception
- **Author trust**: Code runs with browser privileges; malicious code could access cookies, make requests, etc.
- **Not sandboxed**: Future versions may add sandboxing via Web Workers or SES

For maximum security in multi-tenant deployments, consider using declarative graders where possible.

### Write Portable Code

**Important:** The execution environment may change. Future versions may run grading code in:
- A Web Worker (no DOM access)
- A sandboxed JavaScript environment (SES/Lockdown)
- Server-side in an isolated VM

**Do not rely on browser-specific APIs.** For example, this will break:

```javascript
// BAD: Uses DOM APIs - will fail in sandbox/server
function isValidCSSColor(color) {
  const s = new Option().style;
  s.color = color;
  return s.color !== "";
}
```

**Stick to vanilla JavaScript:** Use only standard JS features like `Math`, `String`, `Array`, `parseFloat`, `RegExp`, etc. If you need browser APIs, your grader may stop working in future versions.

## Tips

1. **Handle empty input**: Check for `!input` or empty strings early
2. **Normalize input**: Use `.toLowerCase().trim()` for text comparison
3. **Parse carefully**: Always check `isNaN()` after `parseFloat()`
4. **Provide feedback**: Clear messages help students learn
5. **Test edge cases**: Empty input, wrong types, boundary values
