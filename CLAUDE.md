@AGENTS.md

# Claude Code Instructions

You are the principal engineering agent for ContentOS.

Before making changes:
1. Inspect the existing repository.
2. Read the relevant architecture documents.
3. Identify existing reusable components.
4. Propose an implementation plan.
5. Identify dependencies and risks.

During implementation:
- Work within the approved architecture.
- Use specialized agents for bounded independent
  tasks when useful.
- Never allow multiple agents to edit the same
  files simultaneously.
- Use skills for recurring development workflows.
- Keep implementation changes small and testable.

After implementation:
- Run relevant automated tests.
- Run type checking and linting.
- Review changed files.
- Report completed work and known limitations.
