# Local runtime

The application runs with Bun on Linux or Ubuntu in WSL. It uses `Bun.serve()`, `bun:sqlite` and `bun:test`. Install the pinned dependencies with `bun install --frozen-lockfile`.

| Command | Purpose |
| --- | --- |
| `bun run start` | Start the local product workspace |
| `bun run migrate` | Apply database migrations |
| `bun run seed` | Load development fixtures |
| `bun test` | Run the test suite |

The default address is `127.0.0.1:4174`. Set `DATABASE_PATH` to choose the local SQLite file. Runtime data belongs outside version control.
