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

```xml
<CapaProblem id="quiz1" title="The Ultimate Question">
  <LineInput id="answer" />
  <CustomGrader target="answer">
    if (input === 42) return { correct: 'correct', message: 'Perfect!' };
    if (Math.abs(input - 42) &lt; 5) return { correct: 'partially-correct', score: 0.5 };
    return { correct: 'incorrect', message: 'Try again' };
  </CustomGrader>
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

```xml
<CapaProblem id="half-value" title="Expressing One-Half">
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

```xml
<CapaProblem id="voltage-divider" title="Voltage Divider Design">
  <LineInput id="r1" />
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

```xml
<CapaProblem id="pi-estimate" title="Estimate Pi">
  <LineInput id="estimate" />
  <CustomGrader target="estimate"><![CDATA[
    const answer = parseFloat(input);
    const correct = 3.14159;

    if (isNaN(answer)) return { correct: 'invalid' };

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

```xml
<CapaProblem id="e24-check" title="Standard Resistor Value">
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
    if (isNaN(value)) return { correct: 'invalid' };
    if (!isStandard(value)) return { correct: 'incorrect', message: 'Not a standard E24 value' };
    return { correct: 'correct' };
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

```xml
<CustomGrader target="answer"><![CDATA[
  if (x < 5 && y > 0) {
    return { correct: 'correct', message: 'In range!' };
  }
  return { correct: 'incorrect' };
]]></CustomGrader>
```

### Option 3: External File with src=

For complex graders, keep code in a separate `.js` file:

```xml
<CustomGrader target="answer" src="./graders/voltage-divider.js" />
```

The file path is resolved relative to the OLX file location. This keeps your OLX clean and allows reusing grading code across problems.

## Security

CustomGrader executes JavaScript code using `new Function()`. This has security implications:

- **Browser-only**: CustomGrader is disabled in Node.js environments and will throw an exception
- **Author trust**: Code runs with browser privileges; malicious code could access cookies, make requests, etc.
- **Not sandboxed**: Future versions may add sandboxing via Web Workers or SES

For maximum security in multi-tenant deployments, consider using declarative graders where possible.

## Tips

1. **Handle empty input**: Check for `!input` or empty strings early
2. **Normalize input**: Use `.toLowerCase().trim()` for text comparison
3. **Parse carefully**: Always check `isNaN()` after `parseFloat()`
4. **Provide feedback**: Clear messages help students learn
5. **Test edge cases**: Empty input, wrong types, boundary values
