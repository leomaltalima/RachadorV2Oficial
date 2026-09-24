---
name: GitHub sync and Replit environment
description: Safety rule for syncing Replit workspaces to public GitHub repositories.
---

When mirroring a Replit workspace to a public GitHub repository, do not publish values stored in `.replit`'s `[userenv.shared]` section. Keep the local Replit configuration intact; preserve the safe remote `.replit` file or ask before a sanitized configuration migration.

**Why:** GitHub push protection rejected this file for containing environment values. Removing them automatically could change the Replit runtime configuration.

**How to apply:** Before syncing, inspect the `.replit` diff without displaying environment values. If it contains shared environment values, exclude that file from the public snapshot and verify the resulting tree differs only by the approved `.replit` exception.