## ADDED Requirements

### Requirement: SQL identifier validation
All MCP tools that accept SQL identifiers (schema names, table names, column names) as parameters SHALL validate those identifiers against the pattern `^[a-zA-Z_][a-zA-Z0-9_]*$`. Identifiers that do not match SHALL be rejected with an error message.

#### Scenario: Valid identifier accepted
- **WHEN** a tool receives a table name like `inventory`
- **THEN** the identifier SHALL pass validation and the tool SHALL proceed normally

#### Scenario: Identifier with semicolon rejected
- **WHEN** a tool receives a table name like `users; DROP TABLE users--`
- **THEN** the tool SHALL reject the identifier with an error message about invalid characters

#### Scenario: Identifier with quote rejected
- **WHEN** a tool receives a schema name like `public' OR '1'='1`
- **THEN** the tool SHALL reject the identifier with an error message about invalid characters

#### Scenario: Identifier exceeding length limit rejected
- **WHEN** a tool receives an identifier longer than 63 characters
- **THEN** the tool SHALL reject the identifier with an error message about maximum length

### Requirement: Schema array validation
Tools that accept an array of schema names (e.g., `schemas` parameter in `list_table`) SHALL validate each element using identifier validation rules.

#### Scenario: Valid schema array accepted
- **WHEN** `list_table` receives `schemas=["public", "auth"]`
- **THEN** all elements SHALL pass validation and the tool SHALL proceed normally

#### Scenario: Schema array with injection rejected
- **WHEN** `list_table` receives `schemas=["public", "'; DROP TABLE users--"]`
- **THEN** the tool SHALL reject the second element with an error about invalid characters

### Requirement: SQL literal escaping
The `escapeSqlLiteral` function SHALL produce valid PostgreSQL string literals by wrapping values in single quotes and escaping internal special characters.

#### Scenario: Simple string literal
- **WHEN** `escapeSqlLiteral("public")` is called
- **THEN** the result SHALL be `'public'`

#### Scenario: String with single quote
- **WHEN** `escapeSqlLiteral("it's")` is called
- **THEN** the result SHALL be `'it''s'`

#### Scenario: String with backslash
- **WHEN** `escapeSqlLiteral("path\\file")` is called
- **THEN** the result SHALL be `'path\\\\file'`
