## ADDED Requirements

### Requirement: File path validation for SQL execution
The `execute_sql_file` and `apply_migration` tools SHALL validate the provided file path before reading the file. The path MUST:
1. Be an absolute path starting with `/`
2. End with `.sql` extension
3. Not contain directory traversal sequences (`..`)

#### Scenario: Valid absolute .sql path accepted
- **WHEN** a tool receives file path `/home/user/migrations/001_create_table.sql`
- **THEN** the path SHALL pass validation and the tool SHALL proceed

#### Scenario: Relative path rejected
- **WHEN** a tool receives file path `migrations/001.sql`
- **THEN** the tool SHALL reject the path with an error about requiring an absolute path

#### Scenario: Non-.sql extension rejected
- **WHEN** a tool receives file path `/home/user/migrations/001_create_table.txt`
- **THEN** the tool SHALL reject the path with an error about requiring .sql extension

#### Scenario: Path traversal rejected
- **WHEN** a tool receives file path `/home/user/../../../etc/passwd.sql`
- **THEN** the tool SHALL reject the path with an error about directory traversal sequences

#### Scenario: Hidden traversal rejected
- **WHEN** a tool receives file path `/home/user/migrations/..%2F..%2Fetc%2Fpasswd.sql`
- **THEN** the tool SHALL reject the path (path contains `..` after any normalization)
