## ADDED Requirements

### Requirement: API key minimum length
API keys SHALL be at least 32 characters long. Keys shorter than 32 characters SHALL be rejected at server startup.

#### Scenario: Valid API key accepted
- **WHEN** the server is started with `--api-key` flag set to a 32+ character alphanumeric string
- **THEN** the server SHALL start successfully with a validation-passed message

#### Scenario: Short API key rejected
- **WHEN** the server is started with `--api-key` flag set to a 10-character string
- **THEN** the server SHALL exit with an error about minimum key length

### Requirement: API key pattern validation
API keys SHALL NOT be purely numeric or consist of a single repeating character. These weak patterns SHALL be rejected at server startup.

#### Scenario: Purely numeric key rejected
- **WHEN** the server is started with `--api-key` set to `12345678901234567890123456789012`
- **THEN** the server SHALL exit with an error about purely numeric keys

#### Scenario: Repeating character key rejected
- **WHEN** the server is started with `--api-key` set to `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- **THEN** the server SHALL exit with an error about repeating characters

### Requirement: API key via environment variable
The API key SHALL also be accepted via the `MCP_API_KEY` environment variable. The `--api-key` CLI flag takes precedence over the environment variable.

#### Scenario: API key from environment variable
- **WHEN** the `MCP_API_KEY` environment variable is set to a valid key and no `--api-key` flag is provided
- **THEN** the server SHALL validate the key from the environment variable and start successfully

#### Scenario: CLI flag overrides environment variable
- **WHEN** both `MCP_API_KEY` environment variable and `--api-key` flag are set
- **THEN** the server SHALL use the value from the `--api-key` flag

### Requirement: Timing-safe key comparison
When comparing API keys during request authentication, the server SHALL use constant-time comparison to prevent timing attacks.

#### Scenario: Key comparison timing
- **WHEN** an API key is compared against the configured key
- **THEN** the comparison SHALL use constant-time comparison regardless of how many characters match
