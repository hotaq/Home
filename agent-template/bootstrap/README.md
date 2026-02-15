# Bootstrap Tools

This folder contains helper tools to create new agent workspaces quickly.

## `new-agent.sh`

Generate a ready-to-use agent folder with:
- core operating rules skill
- selected role pack skill
- thread card template
- onboarding checklist
- per-agent README

### Usage

From repository root:

```bash
bash agent-template/bootstrap/new-agent.sh <agent-name> <role-pack>
```

Example:

```bash
bash agent-template/bootstrap/new-agent.sh nanta-01 nanta
bash agent-template/bootstrap/new-agent.sh arachia-01 arachia
```

Role pack options:
- `nanta`
- `arachia`
- `shoji`

Output path:
- `agents/<agent-name>/`
