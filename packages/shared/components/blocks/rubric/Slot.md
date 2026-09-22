# Slot

One line on the answer sheet: a check the grader is asked about, in the order
they are asked.

## Attributes

| attribute | meaning |
|---|---|
| `key` | the check's name on the sheet |
| `label` | human label shown in feedback |
| `verdicts` | verdicts it may take, `|`-separated or `@name` for a shared vocabulary |
| `pts` | what it is worth; omit for a check that reports rather than scores |
| `seg` | how the answer is collected, when it is not a plain verdict |
| `gate` | an unsatisfied gate is the whole story for the item |
| `charge` | the deduction charged when this gate is unsatisfied |
| `because` | the reason given when `charge` is charged |
| `codes` | which deduction each failing verdict charges, `verdict=CODE,verdict=CODE` |
| `rule` | extra judging text |
| `reported` | the model reports this value rather than being judged on it |
| `gates` | this CREDIT line gates the item — a different fact from `gate` |
| `free` | verdicts that are not satisfying and still cost nothing |

## A gate that charges

`gate="true"` says an unsatisfied check ends the item. `charge` and `because`
say what that costs and why:

```xml
<Slot key="states_a_contingency" gate="true" charge="NOT_OC"
      because="No contingency is stated: nothing is granted or withheld on a condition."/>
```

The charging gates run **in slot order**, and the first one that fails ends the
item there. That is not a convention this block imposes — it is what the corpus
already did, on every item that has them, which is why they are slots and not a
separate ordered list.

`because` cannot move onto the `<Deduction>`. One code is charged by five
different gates with five different reasons; the deduction's own text says what
the code means, and `because` says which gate produced it.

## Why `charge` is not `codes`

`codes` maps a VERDICT to a code, because which deduction applies depends on how
a check failed. A gate has no verdict — it is satisfied or it is not — so there
is nothing to key a mapping on.

## Related blocks

- [Item](./Item.md) — what a slot belongs to
- [Verdicts](./Verdicts.md) — the shared vocabularies `verdicts="@name"` reaches
- [Deduction](./Deduction.md) — what `charge` names
