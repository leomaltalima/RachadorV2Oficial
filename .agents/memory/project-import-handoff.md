---
name: Project import handoff
description: Where imported project files may appear after moving a conversation into a persistent project.
---

After a conversation is moved into a persistent project, the imported source can be preserved under `.local/conversation-workspace/files` instead of the active project root. Treat that directory as the source to restore, while leaving environment-managed `.local`, `.cache`, and agent state intact.

**Why:** The project handoff can initialize a fresh workspace scaffold and preserve the prior files separately, so assuming the root is already the imported repository can lead to working on the wrong codebase.

**How to apply:** Check `.local/conversation-workspace/files` immediately after a handoff when the expected repository is not present at the root; restore the project files, Git metadata, and relevant agent memory before continuing.