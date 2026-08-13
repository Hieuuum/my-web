---
title: "Deploying and fixing agent harnesses"
date: "2026-08-13"
draft: "true"
---

I wanted to put my agent harnesses skills to the test, so I designed an automatic issue-fixing Github agent for Python repositories. Whenever an issue is tagged with `agent-fix`, the agent will be automatically deployed, and a pull request will be created when the issue is fixed.

I used LangGraph to design the agent harness. Below is a graph of how the agent operates.

```flowchart TD
    A[GitHub webhook] --> B[Clone / Setup]
    B --> C[Reproduce failure]
    C --> D[Code Agent]

    D --> E[Run Targeted Test]
    E -->|fails| F[Replan]
    F --> D

    E -->|passes| G[Run Full Tests]
    G -->|fails| F

    G -->|acceptable| H[Verify]

    H -->|publishable| I[Publish]
    H -->|verification fails, budget remains| J[Repair or Stop]
    J --> D

    H -->|hard failure / budget exhausted| K[Terminate]
    J -->|cannot continue| K

    I --> L[End]```

## Design decisions
In usual coding tools such as Claude Code, Codex, Cursor, etc., the agent is given a bash shell with restricted permissions. Since my agent focused on a narrow problem, I only gave it simple tools such as read_file, search_code, write_file, run_pytest, git_diff, git_status. This made it much easier to manage the agent's expected authority.

The agent is also only allowed to write a file after it has read it to prevent blind edits. write_file used a whole-file writing approach rather than a unified diff/patch approach, because it would require another subsystem that checks whether the edits targeted the right code parts or not, etc.

When the agent receives an issue, not all test cases would have passed. The verification system would ignore the unrelated failing ones, ensure that the targeted failed tests passed, and reject changes that failed previously passed ones.