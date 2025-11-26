# Chat Block

## Overview

The Chat block renders conversational content using a specialized PEG parser format. It displays dialogue in a modern SMS-like interface with support for character avatars, message grouping, and dynamic content integration.

## Technical Usage

### Basic Syntax
```xml
<Chat id="myChat" src="conversation.chatpeg" title="Learning Conversation" />
```

### Properties
- `id` (required): Unique identifier for the chat component
- `src` (required): Path to the .chatpeg file containing conversation content
- `title` (optional): Display title for the chat interface
- `clip` (optional): Specify which scenes/sections to display (e.g., "intro,main" or "scene1")

### ChatPEG Format
Chat content is written in a specialized .chatpeg format:

```
Title: My Learning Conversation
Author: Education Team
~~~~

Scene Name
----------

Character1: First message content
Character2: Response message

# [activity: type]
activity_id -> target_component

--- wait condition ---

Character1: Next message after activity completion
```

## Pedagogical Purpose

The Chat block was created to support **conversational learning** and **social constructivism**:

1. **Natural Dialogue**: Learning through realistic conversation mimics how knowledge is actually shared
2. **Character Perspectives**: Multiple viewpoints help learners see different approaches to problems
3. **Scaffolded Discovery**: Characters can guide learners through complex topics step-by-step
4. **Social Presence**: Conversational format increases engagement and reduces isolation

## Common Use Cases

### 1. Scenario-Based Assessments (SBAs)
Students join characters discussing real-world problems, contributing their own analysis and solutions.

### 2. Peer Learning Simulations
Characters represent different student perspectives, modeling collaborative problem-solving approaches.

### 3. Expert Consultations
Characters with different expertise levels guide learners through complex professional scenarios.

### 4. Socratic Dialogues
Question-driven conversations that lead learners to discover concepts through guided inquiry.

## Chat Integration Patterns

### With Sequential Blocks
```xml
<Sequential>
  <SplitPanel sizes="60,40">
    <LeftPane>
      <Chat src="discussion.chatpeg" clip="intro" />
    </LeftPane>
    <RightPane>
      <UseHistory target="student_input" />
    </RightPane>
  </SplitPanel>
</Sequential>
```

### Dynamic Content Integration
The Chat block integrates with other components through activity markers:
```
# [activity: constructed response]  
sidebar_component -> student_reflection

--- wait student_reflection ---

Character: Great insight! Let me build on what you said...
```

## Best Practices

- **Character Consistency**: Maintain distinct voices and perspectives for each character
- **Pacing Control**: Use activity breaks to prevent overwhelming learners with long conversations
- **Context Preservation**: When using clips, ensure each segment provides sufficient context
- **Mobile Responsiveness**: Test chat interface on various screen sizes

## Example File
See `Chat.olx` for a complete working example demonstrating conversation flow, character interaction, and activity integration.