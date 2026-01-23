# envfill

Interactive CLI to populate `.env` files from templates.

## Install

```bash
npx envfill
```

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

| Value                | Behavior                     |
| -------------------- | ---------------------------- |
| `PORT=3000`          | Default value                |
| `KEY=`               | Prompt (no default)          |
| `` UID=`id -u` ``    | Shell command as default     |
| `SECRET=<secret:32>` | Auto-generate                |
| `ENV=<a\|b\|*c>`     | Options (`*` = default)      |
| `URL=<required>`     | Must provide                 |
| `URL=<url>`          | URL validation               |
| `EMAIL=<email>`      | Email validation             |
| `PORT=<port>`        | Port validation              |
| `DEBUG=<boolean>`    | Yes/no toggle                |
| `KEY=<if:VAR>`       | Only prompt if VAR is truthy |
| `B=${A}_suffix`      | Variable interpolation       |
| `KEY=<regex:/^pattern$/>`| Custom regex validation  |
| `KEY=<regex:/^pattern$/i:error>`| Regex with flags and custom error |

Combine with comma: `<required,url>` or `<if:ENABLED,required>`

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
