# envfill

**Keep your `.env` in sync with `.env.template`**

Added a new env var to the template? `envfill` prompts your team for missing values, validates input, and generates secrets, so nobody runs the app with missing config.

```bash
npx envfill
```

- **Syncs** — only prompts for new/missing variables, keeps existing values
- **Validates** — URLs, emails, ports, custom regex
- **Generates** — secrets, passwords, tokens
- **Integrates** — shell commands for Vault, 1Password, AWS Secrets Manager

## Quick Start

Create `.env.template`:

```bash
# Database password
DB_PASSWORD=<secret:32>

# Your user ID
USER_ID=`id -u`

# App environment
NODE_ENV=<dev|staging|*prod>

# Public URL
PUBLIC_URL=<required,url>

# API key (32 alphanumeric chars)
API_KEY=<regex:/^[a-zA-Z0-9]{32}$/:Enter a 32-char alphanumeric key>
```

Run `npx envfill` and get prompted for each value.

## Template Syntax

| Value                             | Behavior                          |
| --------------------------------- | --------------------------------- |
| `PORT=3000`                       | Default value                     |
| `KEY=`                            | Prompt (no default)               |
| `` UID=`id -u` ``                 | Shell command as default          |
| `SECRET=<secret:32>`              | Auto-generate (alphanumeric)      |
| `TOKEN=<secret:16:alnum+special>` | Auto-generate with charset        |
| `ENV=<a\|b\|*c>`                  | Options (`*` = default)           |
| `URL=<required>`                  | Must provide                      |
| `URL=<url>`                       | URL validation                    |
| `EMAIL=<email>`                   | Email validation                  |
| `PORT=<port>`                     | Port validation                   |
| `COUNT=<integer:0:100>`           | Integer in range (min:max)        |
| `DEBUG=<boolean>`                 | Yes/no toggle                     |
| `KEY=<if:VAR>`                    | Only prompt if VAR is truthy      |
| `B=${A}_suffix`                   | Variable interpolation            |
| `KEY=<regex:/^pattern$/>`         | Custom regex validation           |
| `KEY=<regex:/^pattern$/i:error>`  | Regex with flags and custom error |
| `NAME=<lowercase>`                | Transform to lowercase            |
| `NAME=<uppercase>`                | Transform to uppercase            |
| `SLUG=<slugify>`                  | Slugify (lowercase + dashes)      |
| `NAME=<trim:->`                   | Trim chars from edges             |
| `NAME=<replace:/pat/repl/g>`      | Regex replace                     |

Combine with comma: `<required,url>` or `<if:ENABLED,required>`

### Secret Charsets

Control which characters are used in generated secrets:

| Preset    | Characters            |
| --------- | --------------------- |
| `alnum`   | `a-zA-Z0-9` (default) |
| `alpha`   | `a-zA-Z`              |
| `lower`   | `a-z`                 |
| `upper`   | `A-Z`                 |
| `num`     | `0-9`                 |
| `hex`     | `0-9a-f`              |
| `HEX`     | `0-9A-F`              |
| `special` | `!@#$%^&*()-_=+`      |

### Transform Directives

Transforms modify user input before storing. They apply left-to-right:

```bash
# Slugify: "My Cool App" → "my-cool-app"
PROJECT_SLUG=<slugify>

# Chain transforms: "  My App!  " → "my-app"
NAME=<lowercase,replace:/[^a-z0-9]+/-/g,trim:->

# Replace with regex: "hello world" → "hello_world"
SNAKE_CASE=<replace:/\s+/_/g>

# Combine with validation
PROJECT_ID=<slugify,required>
```

| Transform                   | Effect                                                | Example                           |
| --------------------------- | ----------------------------------------------------- | --------------------------------- |
| `<lowercase>`               | Convert to lowercase                                  | "Hello" → "hello"                 |
| `<uppercase>`               | Convert to uppercase                                  | "Hello" → "HELLO"                 |
| `<slugify>`                 | Lowercase + replace non-alnum with dash + trim dashes | "My App" → "my-app"               |
| `<trim:chars>`              | Remove chars from start/end                           | `<trim:->` on "-hello-" → "hello" |
| `<replace:/pat/repl/flags>` | Regex replace (`g`=global, `i`=case-insensitive)      | See above                         |

## Fetching Secrets

Use shell commands to fetch secrets from any secret manager:

```bash
# HashiCorp Vault
DB_PASSWORD=`vault kv get -field=db_password secret/data/myapp`

# 1Password CLI
API_KEY=`op read "op://Vault/API Key/password"`

# AWS Secrets Manager
SECRET=`aws secretsmanager get-secret-value --secret-id myapp --query SecretString --output text`
```

## CLI Options

```bash
envfill -i config.template -o .env.local
envfill --defaults    # Use all defaults
envfill --overwrite   # Re-prompt all (ignore existing)
envfill --dry-run     # Preview output
```

## Multi-Template Support

Layer templates with multiple `-i` flags (later overrides earlier):

```bash
envfill -i base.template -i prod.template -i secrets.template
```

Variables are replaced in-place; new ones appear under file section headers.

## Use in package.json

```json
{
  "scripts": {
    "setup": "envfill",
    "setup:ci": "envfill --defaults"
  }
}
```

Then run `npm run setup` to interactively fill your `.env`.

## License

MIT
