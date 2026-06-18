/**
 * SQL injection prevention utilities for MCP tools.
 *
 * These validators are used in tools that construct SQL queries from user input
 * where the tool's purpose is NOT arbitrary SQL execution (e.g., list_table,
 * list_columns, list_indexes). These tools must sanitize inputs to prevent
 * SQL injection attacks.
 */

/**
 * Validates a PostgreSQL identifier (schema name, table name, column name, etc.).
 * Only allows alphanumeric characters and underscores, starting with a letter or underscore.
 * Rejects any input that could be used for SQL injection.
 *
 * @param identifier - The identifier to validate
 * @param paramName - The parameter name for error messages
 * @throws Error if the identifier is invalid or potentially malicious
 */
export function validateSqlIdentifier(identifier: string, paramName: string = 'identifier'): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error(`Invalid ${paramName}: must be a non-empty string`);
  }

  // PostgreSQL identifier rules: start with letter or underscore,
  // followed by letters, numbers, or underscores
  const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  if (!VALID_IDENTIFIER.test(identifier)) {
    throw new Error(
      `Invalid ${paramName}: "${identifier}" contains invalid characters. ` +
      `Only alphanumeric characters and underscores are allowed, and it must start with a letter or underscore.`
    );
  }

  // Maximum length check (PostgreSQL limit is 63 bytes for identifiers)
  if (identifier.length > 63) {
    throw new Error(`Invalid ${paramName}: "${identifier}" exceeds maximum length of 63 characters`);
  }

  return identifier;
}

/**
 * Validates an array of schema names, rejecting any that contain SQL injection patterns.
 *
 * @param schemas - Array of schema names to validate
 * @returns The validated array of schema names
 * @throws Error if any schema name is invalid
 */
export function validateSchemaNames(schemas: string[]): string[] {
  if (!Array.isArray(schemas)) {
    throw new Error('schemas must be an array of strings');
  }

  return schemas.map((schema, index) =>
    validateSqlIdentifier(schema, `schemas[${index}]`)
  );
}

/**
 * Escapes a string for safe use as a SQL literal value using PostgreSQL's
 * quote_literal convention. This should be used as a defense-in-depth measure
 * alongside parameterized queries or input validation.
 *
 * Note: Prefer validateSqlIdentifier() for identifiers and use this only
 * when you must embed a value in a query string.
 *
 * @param value - The value to escape
 * @returns The escaped value safe for embedding in SQL
 */
export function escapeSqlLiteral(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }

  // PostgreSQL quote_literal convention: wrap in single quotes,
  // escape internal single quotes by doubling them, and escape backslashes
  return "'" + value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''") + "'";
}

/**
 * Escapes a string for safe use as a PostgreSQL identifier using
 * double-quote quoting convention.
 *
 * @param identifier - The identifier to escape
 * @returns The escaped identifier wrapped in double quotes
 */
export function escapeSqlIdentifier(identifier: string): string {
  if (typeof identifier !== 'string') {
    throw new Error('Identifier must be a string');
  }

  // Replace double quotes with double double quotes
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Validates a SQL query string for read-only operations.
 * Checks that the query appears to be a SELECT or read-only operation.
 * This is a best-effort check and should NOT be relied upon as the
 * sole defense — always use database-level read-only transactions.
 *
 * @param sql - The SQL query to check
 * @throws Error if the query appears to contain write operations
 */
export function assertReadOnlyQuery(sql: string): void {
  const normalizedSql = sql.toUpperCase().trim();

  // Remove string literals and comments to avoid false positives
  const cleanedSql = normalizedSql
    .replace(/'(?:[^']*|'')*'/g, '')     // Remove string literals (handles escaped quotes)
    .replace(/\$\$[\s\S]*?\$\$/g, '')       // Remove dollar-quoted strings
    .replace(/\$[a-zA-Z_]\w*\$[\s\S]*?\$[a-zA-Z_]\w*\$/g, '') // Remove tagged dollar-quotes
    .replace(/--.*$/gm, '')              // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // Remove multi-line comments
    .trim();

  const WRITE_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',
    'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE',
    'COPY', 'VACUUM', 'REINDEX', 'CLUSTER',
  ];

  // Check for write keywords at word boundaries
  for (const keyword of WRITE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(cleanedSql)) {
      throw new Error(
        `Write operation detected in SQL query. Keyword "${keyword}" is not allowed in read-only mode. ` +
        `Use the --write flag to enable write operations.`
      );
    }
  }
}

/**
 * Checks whether user-supplied SQL contains transaction control statements
 * (BEGIN, START TRANSACTION, COMMIT, ROLLBACK, END) that could break out of
 * the read-only transaction wrapping. Strips string literals and comments
 * before checking to avoid false positives.
 *
 * @param sql - The SQL query to check
 * @throws Error if transaction control statements are detected
 */
export function assertNoTransactionControl(sql: string): void {
  const normalizedSql = sql.toUpperCase().trim();

  // Remove string literals and comments to avoid false positives
  const cleanedSql = normalizedSql
    .replace(/'(?:[^']*|'')*'/g, '')     // Remove string literals (handles escaped quotes)
    .replace(/\$\$[\s\S]*?\$\$/g, '')       // Remove dollar-quoted strings
    .replace(/\$[a-zA-Z_]\w*\$[\s\S]*?\$[a-zA-Z_]\w*\$/g, '') // Remove tagged dollar-quotes
    .replace(/--.*$/gm, '')              // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // Remove multi-line comments
    .trim();

  // Check for transaction control statements that could break read-only wrapping
  const TRANSACTION_CONTROL_PATTERN = /\b(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|END)\b/i;
  if (TRANSACTION_CONTROL_PATTERN.test(cleanedSql)) {
    throw new Error(
      'Transaction control statements (BEGIN/START TRANSACTION/COMMIT/ROLLBACK/END) ' +
      'are not allowed in read-only mode. The server will manage transaction boundaries automatically. ' +
      'Use the --write flag to enable write operations.'
    );
  }
}

/**
 * Wraps user SQL in a read-only transaction for safe execution.
 * Rejects SQL containing transaction control statements first,
 * then wraps in: BEGIN; SET LOCAL transaction_read_only = on; <sql>; ROLLBACK;
 *
 * @param sql - The user SQL to wrap
 * @returns The wrapped SQL string
 * @throws Error if the SQL contains transaction control statements
 */
export function wrapInReadOnlyTransaction(sql: string): string {
  // Step 1: Reject user-supplied transaction control that could break out
  assertNoTransactionControl(sql);

  // Step 2: Ensure user SQL ends with semicolon before appending ROLLBACK
  const trimmedSql = sql.trimEnd();
  const sqlWithSemicolon = trimmedSql.endsWith(';') ? trimmedSql : `${trimmedSql};`;

  // Step 3: Wrap in read-only transaction
  return `BEGIN;\nSET LOCAL transaction_read_only = on;\n${sqlWithSemicolon}\nROLLBACK;`;
}

/**
 * Validates a file path to prevent path traversal attacks.
 * The path must:
 * - End with .sql extension
 * - Be an absolute path
 * - Not contain directory traversal sequences (..)
 *
 * @param filePath - The file path to validate
 * @returns The validated file path
 * @throws Error if the path is invalid or contains traversal patterns
 */
export function validateSqlFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('file_path must be a non-empty string');
  }

  // Must end with .sql extension
  if (!filePath.endsWith('.sql')) {
    throw new Error(`Invalid file_path: "${filePath}" must have a .sql extension`);
  }

  // Must be an absolute path
  if (!filePath.startsWith('/')) {
    throw new Error(`Invalid file_path: "${filePath}" must be an absolute path starting with /`);
  }

  // Must not contain directory traversal
  if (filePath.includes('..')) {
    throw new Error(`Invalid file_path: "${filePath}" must not contain directory traversal sequences (..)`);
  }

  return filePath;
}
