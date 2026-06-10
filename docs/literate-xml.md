<h1> Literate OLX </h1>

<p> SGML, and later XML, were designed as <em>markup</em> languages --
human-friendly ways to annotate content with <i>italics</i>,
<b>bold</b>, and to break paragraphs.

<p> SGML even allowed us to imply closing tags!

<p> This was good. A second grader could author HTML 2.0.

<p> Enterprise programmers began to encode objects in XML, and we ended up
with horrible code like:

```
<object>
  <attribute>
     <key>
        font-style
     </key>
     <value>
       bold
     </value>
  </attribute>
</object>
```

And XML got a bad reputation as a result. Objects belong in JSON,
YAML, and similar object languages (which, despite popular opinion,
are not actually markup languages). Text belongs in markup
languages. Educational content is mostly text or text-like.

OLX is literate XML -- formatting is for humans, and indentation does
**not** follow XML hierarchies. To the contrary, markup languages
should be formatted to establish a visual hierarchy around the
**content**, not the syntax.

In general, text should **not** be indented, unless there's a good
content reason -- such as a blockquote or an LLM prompt. **Most** OLX
is flush-left.

We **do** indent when there's a good content reason for it. For
example, if we're organizing an MCQ, we might have:

```
<ChoiceInput id="strategyPoll">
<Markdown> **Which one of these possible strategies should we recommend to Annie's friend?** </Markdown>

  <Distractor id="collaborativeProblemSolving"> Collaborative Problem Solving     </Distractor>
  <Distractor id="empathyEmotionalSupport"    > Empathy and Emotional Support     </Distractor>
  <Distractor id="environmentalAdjustments"   > Environmental Adjustments         </Distractor>
  <Distractor id="flexibleBedtimeRoutines"    > Flexible Bedtime Routines         </Distractor>
  <Distractor id="gradualFading"              > Gradual Fading                    </Distractor>
  <Distractor id="naturalConsequencesLimits"  > Natural Consequences with Limits  </Distractor>
         <Key id="positiveReinforcement"      > Positive Reinforcement            </Key>
</ChoiceInput>
```

Notice how this is both compact, and the alignment makes it easy to
read the options, the IDs, and which one is the key.

However, if this were in the middle of a problem, there would
**still** be a better way to write this; we provide formal markdown
grammars to simplify authoring further:

```
<MarkupProblem id="strategyPoll">
Which one of these possible strategies should we recommend to Annie's friend?

( ) Collaborative Problem Solving
( ) Empathy and Emotional Support
( ) Environmental Adjustments
( ) Flexible Bedtime Routines
( ) Gradual Fading
( ) Natural Consequences with Limits
(x) Positive Reinforcement

</MarkupProblem>
```

In the XML version, notice the **semantic IDs**. That's nice for
downstream analytics from event streams. When developing educational
content, coming up with a clear, consistent, meaningful, semantic ID
scheme is helpful.

- **Stateful and action-oriented blocks** -- `SetFieldAction`,
  `LLMAction`, `Ref`, `Tabs`, `Sequential`, answer choices, anything
  that emits events or holds state -- should get explicit semantic IDs.
  These are the ones whose identity shows up in analytics, and the ones
  that collide (two identical elements hash to the same auto-generated
  ID, and the content loader rejects the duplicate).
- **Purely stateless presentation** -- `Markdown`, `Vertical`, layout
  wrappers -- *can* have IDs for clarity, but don't strictly need them.
  Their absence isn't a bug.