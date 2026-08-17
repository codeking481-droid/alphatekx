# Agent Configuration Test

This file demonstrates the AlphaTekx agent configuration is working properly.

## Expected Behavior

When you run opencode in this directory, you should see:

1. **Chain of Thought Always Active**: The agent will show its reasoning process
2. **Professional Quality**: Work will be done thoroughly and verified
3. **Clear Communication**: You'll be informed at every step
4. **Proactive Planning**: Work will be planned before execution

## Test Commands

To test the agent configuration:

```bash
# Navigate to the project directory
cd C:\Users\user\Desktop\ALPHATEKX\alphatekx-main

# Run opencode
opencode
```

## What Should Happen

1. The agent should load with the AlphaTekx configuration
2. It should show its chain of thought by default
3. It should follow the work execution protocol
4. It should provide clear, professional-quality responses

## Configuration Files Created

- `.opencode/agent/alphatekx.md` - Agent definition with chain of thought
- `opencode.json` - Configuration pointing to the agent
- `AGENTS.md` - Agent instructions and protocols
- `CLAUDE.md` - Updated to reference agent configuration

The agent is now configured to maintain visible chain of thought unless explicitly closed by the user, and to follow professional work execution protocols.