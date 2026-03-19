# ErrorNode Block

## Overview

The ErrorNode block displays content loading and parsing errors in a user-friendly format. It's automatically created when the system encounters errors during OLX parsing or content loading.

## Technical Usage

### Automatic Creation
ErrorNode is typically created automatically when errors occur:
- XML parsing failures
- Missing required files
- Invalid block configurations
- PEG grammar errors

### Properties (set by system)
- `id`: Auto-generated identifier
- Error details stored in the node

### Display
ErrorNode shows:
- Error message
- Source location (if available)
- Suggestions for fixing (when possible)

## Purpose

ErrorNode supports debugging and error handling:

1. **User-Friendly Errors**: Clear error messages instead of crashes
2. **Development Support**: Helps authors find and fix content issues
3. **Graceful Degradation**: Rest of content still renders
4. **Error Isolation**: One error doesn't break everything

## When You'll See ErrorNode

### Missing Files
```xml
<Chat src="nonexistent.chatpeg" />
<!-- Creates ErrorNode: File not found -->
```

### Invalid Syntax
```xml
<NumberInput expected="not a number">
<!-- Creates ErrorNode: Invalid attribute value -->
```

### Unknown Blocks
```xml
<UnknownBlockType />
<!-- Creates ErrorNode: Unknown block type -->
```

## For Developers

ErrorNode helps identify issues during development. When you see an ErrorNode:
1. Check the error message for specifics
2. Look at the source location
3. Fix the underlying content issue
4. Refresh to see the corrected content

## Related Blocks
- All blocks can generate ErrorNodes when they fail to load
