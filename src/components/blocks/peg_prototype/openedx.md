This is LLM-generated, based on an inspection of pieces of Open edX source and documentation. It may be accurate or entirely hallucinated, but in either case, describes a reasonable OLX-style XML structure for drag-and-drop problems. We aren't following this verbatim right now, and this is good enough where we are in the design process, but please check accuracy before relying on this.

## 1. The OLX Format for Authoring Drag-n-Drop Items (as currently exists)

**OLX** (Open Learning XML) is the XML-based language used to define course content in Open edX. For Drag and Drop, the XBlock is called `drag-and-drop-v2` (the legacy one was `drag-and-drop`).

### Example: Current OLX for DragAndDropV2

```xml
<drag-and-drop-v2
    url_name="dnd_example"
    display_name="Drag and Drop Example"
    problem_title="Match the items"
    prompt="Drag the items to the correct targets."
    feedback="true"
    max_attempts="2"
>
    <targets>
        <target
            id="target_1"
            label="Target 1"
            zone="100,100,200,200"
            img="images/target1.png"
            drop_behavior="lock"
        />
        <target
            id="target_2"
            label="Target 2"
            zone="300,100,400,200"
            img="images/target2.png"
            drop_behavior="lock"
        />
    </targets>
    <items>
        <item
            id="item_1"
            label="Item 1"
            img="images/item1.png"
            target="target_1"
            x="50"
            y="400"
        />
        <item
            id="item_2"
            label="Item 2"
            img="images/item2.png"
            target="target_2"
            x="250"
            y="400"
        />
    </items>
    <background img="images/background.png"/>
</drag-and-drop-v2>
```

**Key components:**
- `<drag-and-drop-v2>`: Root element for the block.
- Attributes: `display_name`, `problem_title`, `prompt`, `feedback`, etc.
- `<targets>`: List of drop zones. Each has `id`, `label`, `zone` (bounding box), etc.
- `<items>`: List of draggable items. Each has `id`, `label`, `img`, `target` (which target is correct), etc.
- `<background>`: The background image (optional).

**OLX is verbose.** The format is not especially friendly to hand-authoring, but is precise and covers all needed data.

---

## 2. The JSON / Mongo Format (when OLX is compiled)

When Open edX ingests OLX, it stores parsed XBlock fields in MongoDB as JSON documents.

**Example: DragAndDropV2 JSON (Mongo) Representation**

```json
{
  "_id": "block-v1:demo+course+type@drag-and-drop-v2+block@dnd_example",
  "category": "drag-and-drop-v2",
  "display_name": "Drag and Drop Example",
  "problem_title": "Match the items",
  "prompt": "Drag the items to the correct targets.",
  "feedback": true,
  "max_attempts": 2,
  "background": {
    "img": "images/background.png"
  },
  "targets": [
    {
      "id": "target_1",
      "label": "Target 1",
      "zone": [100, 100, 200, 200],
      "img": "images/target1.png",
      "drop_behavior": "lock"
    },
    {
      "id": "target_2",
      "label": "Target 2",
      "zone": [300, 100, 400, 200],
      "img": "images/target2.png",
      "drop_behavior": "lock"
    }
  ],
  "items": [
    {
      "id": "item_1",
      "label": "Item 1",
      "img": "images/item1.png",
      "target": "target_1",
      "x": 50,
      "y": 400
    },
    {
      "id": "item_2",
      "label": "Item 2",
      "img": "images/item2.png",
      "target": "target_2",
      "x": 250,
      "y": 400
    }
  ]
}
```

**Notes:**
- All XML attributes become JSON key-value pairs.
- `<targets>` and `<items>` become arrays of objects.
- Images, coordinates, etc. are preserved.
