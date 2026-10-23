# safescript-cli

Command-line tool for [SafeScript](https://github.com/SafeScript/safescript). Run, validate, and check `.safe` files from the terminal.

## Install

```bash
npm install -g safescript-cli
```

Or use without installing:

```bash
npx safescript-cli run handler.safe
```

## Commands

### `safescript run <file.safe>`

Run a `.safe` file and print its return value.

```bash
safescript run handler.safe
safescript run handler.safe --scope name=World
safescript run handler.safe --json-scope scope.json
```

Provides `Math`, `JSON`, `parseInt`, `parseFloat`, `isNaN`, `isFinite` by default. Extra scope entries via `--scope key=value` or `--json-scope file.json`.

### `safescript validate <file.safe|dir>`

Validate one or more `.safe` files without running them.

```bash
safescript validate handler.safe
safescript validate ./handlers/        # validates all .safe files recursively
```

### `safescript check <dir> [--manifest caps.json]`

Validate all `.safe` files in a directory and check that their `@needs` declarations can be satisfied by a capability manifest.

```bash
# manifest.json: { "db": "Database", "auth": "AuthService", "math": "Math" }
safescript check ./handlers --manifest manifest.json
```

Useful in CI to ensure all handlers will have their dependencies met at runtime.

### `safescript compile <file.safe>`

Print the compiled JavaScript output.

```bash
safescript compile handler.safe
```

### `safescript info <file.safe>`

Show the parsed header: version, env, needs, uses.

```bash
safescript info handler.safe
```

```
handler.safe:
  version: 0.2
  env:     node
  needs:
    - request: Request
    - db: Database
  uses:
    - logger: Logger
```

## License

MIT — Gregory Magarshak
