# 🤝 Contributing

Start with [AGENTS.md](AGENTS.md) and [the document map](README.md). Keep changes scoped and preserve mandatory release requirements. This repository currently contains a specification, not a running application.

## Documentation changes

Run `python3 scripts/validate_docs.py`. If contracts change, also run `python3 scripts/validate_contracts.py` with jsonschema installed. Keep limits, schemas, examples, product semantics and acceptance IDs synchronized. Native-language review cannot be replaced by an automated link check.

## Implementation changes

Reference requirement IDs, explain resulting behavior and include actual validation. Never commit production credentials, participant names, tracking IDs from private accounts or screenshots of user payloads. Treat generated assets and dependencies as licensed materials requiring attribution review.

PR descriptions: concrete problem/behavior, affected contracts, executed checks, remaining limitations and migration/rollback impact. No fabricated green badges. Use the repository PR template. Do not replace the chosen stack or expand product scope without a recorded decision.

No contribution license agreement or open-source license is established here; owner must select licensing before accepting external code under an assumed grant.
