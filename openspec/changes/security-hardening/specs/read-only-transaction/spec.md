## ADDED Requirements

### Requirement: Default read-only mode
The MCP server SHALL start in read-only mode by default. The `--read-only` CLI flag SHALL default to `true`.

#### Scenario: Server starts without explicit read-only flag
- **WHEN** the MCP server is started without `--read-only` or `--write` flags
- **THEN** the server SHALL operate in read-only mode

#### Scenario: Server starts with --write flag
- **WHEN** the MCP server is started with the `--write` flag
- **THEN** the server SHALL operate in write mode regardless of the `--read-only` flag value

### Requirement: Transaction wrapping for SQL execution
When in read-only mode, the `execute_sql` and `execute_sql_file` tools SHALL wrap all user SQL in a read-only transaction: `BEGIN; SET LOCAL transaction_read_only = on; <user_sql>; ROLLBACK;`.

#### Scenario: SELECT query in read-only mode
- **WHEN** a SELECT query is submitted while in read-only mode
- **THEN** the server SHALL wrap the query in a read-only transaction and return the query results

#### Scenario: INSERT query in read-only mode
- **WHEN** an INSERT query is submitted while in read-only mode
- **THEN** the server SHALL wrap the query in a read-only transaction and the database SHALL reject it with error code 25006

#### Scenario: DROP TABLE query in read-only mode
- **WHEN** a DROP TABLE query is submitted while in read-only mode
- **THEN** the server SHALL wrap the query in a read-only transaction and the database SHALL reject it with error code 25006

#### Scenario: Semicolon handling before ROLLBACK
- **WHEN** user SQL does not end with a semicolon
- **THEN** the server SHALL append a semicolon before the ROLLBACK statement to avoid SQL syntax errors

### Requirement: apply_migration disabled in read-only mode
When in read-only mode, the `apply_migration` tool SHALL be disabled and reject any migration requests.

#### Scenario: apply_migration in read-only mode
- **WHEN** a migration is requested while in read-only mode
- **THEN** the tool SHALL return an error indicating migrations are not allowed in read-only mode
