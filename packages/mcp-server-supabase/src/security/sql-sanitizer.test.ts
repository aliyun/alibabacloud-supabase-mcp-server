import { describe, expect, test } from 'vitest';
import {
  validateSqlIdentifier,
  validateSchemaNames,
  escapeSqlLiteral,
  escapeSqlIdentifier,
  assertReadOnlyQuery,
  assertNoTransactionControl,
  wrapInReadOnlyTransaction,
  validateSqlFilePath,
} from './sql-sanitizer.js';

// ---------------------------------------------------------------------------
// validateSqlIdentifier
// ---------------------------------------------------------------------------

describe('validateSqlIdentifier', () => {
  test('accepts valid identifiers', () => {
    expect(validateSqlIdentifier('users')).toBe('users');
    expect(validateSqlIdentifier('_private')).toBe('_private');
    expect(validateSqlIdentifier('table_123')).toBe('table_123');
    expect(validateSqlIdentifier('CamelCase')).toBe('CamelCase');
  });

  test('rejects empty or non-string input', () => {
    expect(() => validateSqlIdentifier('')).toThrow('must be a non-empty string');
    expect(() => validateSqlIdentifier(null as unknown as string)).toThrow('must be a non-empty string');
  });

  test('rejects identifiers with special characters', () => {
    expect(() => validateSqlIdentifier('user; DROP TABLE')).toThrow('invalid characters');
    expect(() => validateSqlIdentifier("admin'--")).toThrow('invalid characters');
    expect(() => validateSqlIdentifier('test`')).toThrow('invalid characters');
    expect(() => validateSqlIdentifier('a$b')).toThrow('invalid characters');
    expect(() => validateSqlIdentifier('a b')).toThrow('invalid characters');
  });

  test('rejects identifiers starting with a digit', () => {
    expect(() => validateSqlIdentifier('1table')).toThrow('invalid characters');
    expect(() => validateSqlIdentifier('9users')).toThrow('invalid characters');
  });

  test('rejects identifiers exceeding 63 characters', () => {
    const longName = 'a'.repeat(64);
    expect(() => validateSqlIdentifier(longName)).toThrow('maximum length');
  });

  test('accepts identifier at exactly 63 characters', () => {
    const maxName = 'a'.repeat(63);
    expect(validateSqlIdentifier(maxName)).toBe(maxName);
  });

  test('uses paramName in error messages', () => {
    expect(() => validateSqlIdentifier('', 'schema')).toThrow('Invalid schema');
  });
});

// ---------------------------------------------------------------------------
// validateSchemaNames
// ---------------------------------------------------------------------------

describe('validateSchemaNames', () => {
  test('accepts valid schema array', () => {
    expect(validateSchemaNames(['public', 'auth'])).toEqual(['public', 'auth']);
  });

  test('rejects non-array input', () => {
    expect(() => validateSchemaNames('public' as unknown as string[])).toThrow('must be an array');
  });

  test('rejects array with invalid schema', () => {
    expect(() => validateSchemaNames(['public', 'ev-il'])).toThrow('schemas[1]');
  });

  test('accepts empty array', () => {
    expect(validateSchemaNames([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// escapeSqlLiteral
// ---------------------------------------------------------------------------

describe('escapeSqlLiteral', () => {
  test('wraps simple string in single quotes', () => {
    expect(escapeSqlLiteral('hello')).toBe("'hello'");
  });

  test('escapes single quotes by doubling', () => {
    expect(escapeSqlLiteral("O'Brien")).toBe("'O''Brien'");
  });

  test('escapes backslashes', () => {
    expect(escapeSqlLiteral('path\\to\\file')).toBe("'path\\\\to\\\\file'");
  });

  test('handles empty string', () => {
    expect(escapeSqlLiteral('')).toBe("''");
  });

  test('escapes strings with both quotes and backslashes', () => {
    expect(escapeSqlLiteral("test'\\val")).toBe("'test''\\\\val'");
  });

  test('rejects non-string input', () => {
    expect(() => escapeSqlLiteral(123 as unknown as string)).toThrow('must be a string');
  });
});

// ---------------------------------------------------------------------------
// escapeSqlIdentifier
// ---------------------------------------------------------------------------

describe('escapeSqlIdentifier', () => {
  test('wraps identifier in double quotes', () => {
    expect(escapeSqlIdentifier('users')).toBe('"users"');
  });

  test('escapes internal double quotes by doubling', () => {
    expect(escapeSqlIdentifier('test"col')).toBe('"test""col"');
  });

  test('rejects non-string input', () => {
    expect(() => escapeSqlIdentifier(null as unknown as string)).toThrow('must be a string');
  });
});

// ---------------------------------------------------------------------------
// assertReadOnlyQuery
// ---------------------------------------------------------------------------

describe('assertReadOnlyQuery', () => {
  test('accepts simple SELECT', () => {
    expect(() => assertReadOnlyQuery('SELECT * FROM users')).not.toThrow();
  });

  test('accepts SELECT with CASE...END (no false positive)', () => {
    expect(() => assertReadOnlyQuery(`
      SELECT id,
        CASE WHEN status = 'active' THEN 1 ELSE 0 END AS is_active
      FROM users
    `)).not.toThrow();
  });

  test('accepts SELECT with nested CASE...END', () => {
    expect(() => assertReadOnlyQuery(`
      SELECT
        CASE
          WHEN x = 1 THEN
            CASE WHEN y = 2 THEN 'a' ELSE 'b' END
          ELSE 'c'
        END AS result
      FROM t
    `)).not.toThrow();
  });

  test('accepts WITH (CTE) queries', () => {
    expect(() => assertReadOnlyQuery('WITH cte AS (SELECT 1) SELECT * FROM cte')).not.toThrow();
  });

  test('accepts EXPLAIN and SHOW', () => {
    expect(() => assertReadOnlyQuery('EXPLAIN SELECT * FROM users')).not.toThrow();
    expect(() => assertReadOnlyQuery('SHOW server_version')).not.toThrow();
  });

  test('rejects INSERT', () => {
    expect(() => assertReadOnlyQuery('INSERT INTO users VALUES (1)')).toThrow('INSERT');
  });

  test('rejects UPDATE', () => {
    expect(() => assertReadOnlyQuery('UPDATE users SET name = "x"')).toThrow('UPDATE');
  });

  test('rejects DELETE', () => {
    expect(() => assertReadOnlyQuery('DELETE FROM users')).toThrow('DELETE');
  });

  test('rejects DROP', () => {
    expect(() => assertReadOnlyQuery('DROP TABLE users')).toThrow('DROP');
  });

  test('rejects CREATE', () => {
    expect(() => assertReadOnlyQuery('CREATE TABLE evil (id int)')).toThrow('CREATE');
  });

  test('rejects ALTER', () => {
    expect(() => assertReadOnlyQuery('ALTER TABLE users ADD COLUMN x int')).toThrow('ALTER');
  });

  test('rejects TRUNCATE', () => {
    expect(() => assertReadOnlyQuery('TRUNCATE TABLE users')).toThrow('TRUNCATE');
  });

  test('rejects GRANT', () => {
    expect(() => assertReadOnlyQuery('GRANT ALL ON users TO public')).toThrow('GRANT');
  });

  test('rejects COPY', () => {
    expect(() => assertReadOnlyQuery("COPY users FROM '/tmp/evil.csv'")).toThrow('COPY');
  });

  // --- Bypass attempts via string literals ---

  test('does NOT let write keyword inside string literal trigger rejection', () => {
    // "DROP" is inside a string literal, should be stripped before checking
    expect(() => assertReadOnlyQuery("SELECT 'DROP TABLE' AS hint")).not.toThrow();
  });

  test('does NOT let write keyword inside single-line comment trigger rejection', () => {
    expect(() => assertReadOnlyQuery('SELECT 1 -- INSERT INTO evil\n')).not.toThrow();
  });

  test('does NOT let write keyword inside multi-line comment trigger rejection', () => {
    expect(() => assertReadOnlyQuery('SELECT 1 /* DELETE FROM users */ ')).not.toThrow();
  });

  // --- Dollar-quoted string bypass attempts ---

  test('does NOT let write keyword inside untagged dollar-quoted string trigger rejection', () => {
    expect(() => assertReadOnlyQuery("SELECT $$ INSERT INTO evil VALUES(1) $$ AS payload")).not.toThrow();
  });

  test('does NOT let write keyword inside tagged dollar-quoted string trigger rejection', () => {
    expect(() => assertReadOnlyQuery("SELECT $tag$ DROP TABLE users $tag$ AS payload")).not.toThrow();
  });

  test('rejects write keyword hidden after dollar-quoted string', () => {
    expect(() => assertReadOnlyQuery("SELECT $$safe$$; DROP TABLE users")).toThrow('DROP');
  });

  test('dollar-quoted string with mismatched tags does not strip content', () => {
    // $a$ ... $b$ — different tags, content is NOT stripped, so DROP inside should be detected
    expect(() => assertReadOnlyQuery("SELECT $a$ DROP TABLE $b$ FROM users")).toThrow('DROP');
  });

  test('multiple dollar-quoted strings are all stripped', () => {
    expect(() => assertReadOnlyQuery("SELECT $$a$$ || $$b$$ || $$INSERT$$")).not.toThrow();
  });

  // --- Edge cases ---

  test('rejects MERGE', () => {
    // MERGE statements always contain INSERT/UPDATE/DELETE actions;
    // the first matching keyword in WRITE_KEYWORDS order is reported.
    expect(() => assertReadOnlyQuery('MERGE INTO target USING source ON 1=1 WHEN NOT MATCHED THEN INSERT VALUES (1)')).toThrow('Write operation detected');
  });

  test('rejects REINDEX', () => {
    expect(() => assertReadOnlyQuery('REINDEX TABLE users')).toThrow('REINDEX');
  });

  test('accepts query with write keyword as part of column name', () => {
    // "updated_at" contains "UPDATE" but word boundary check prevents false positive
    expect(() => assertReadOnlyQuery('SELECT updated_at FROM users')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertNoTransactionControl
// ---------------------------------------------------------------------------

describe('assertNoTransactionControl', () => {
  test('accepts normal SELECT', () => {
    expect(() => assertNoTransactionControl('SELECT * FROM users')).not.toThrow();
  });

  test('accepts CASE...END (no false positive on END)', () => {
    expect(() => assertNoTransactionControl(`
      SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t
    `)).not.toThrow();
  });

  test('rejects BEGIN', () => {
    expect(() => assertNoTransactionControl('BEGIN')).toThrow('Transaction control');
  });

  test('rejects COMMIT', () => {
    expect(() => assertNoTransactionControl('COMMIT')).toThrow('Transaction control');
  });

  test('rejects ROLLBACK', () => {
    expect(() => assertNoTransactionControl('ROLLBACK')).toThrow('Transaction control');
  });

  test('rejects START TRANSACTION', () => {
    expect(() => assertNoTransactionControl('START TRANSACTION')).toThrow('Transaction control');
  });

  test('rejects transaction control hidden after semicolon', () => {
    expect(() => assertNoTransactionControl('SELECT 1; COMMIT')).toThrow('Transaction control');
  });

  test('does NOT let BEGIN inside string literal trigger rejection', () => {
    expect(() => assertNoTransactionControl("SELECT 'BEGIN TRANSACTION' AS str")).not.toThrow();
  });

  test('does NOT let COMMIT inside dollar-quoted string trigger rejection', () => {
    expect(() => assertNoTransactionControl("SELECT $$COMMIT$$ AS str")).not.toThrow();
  });

  test('rejects transaction control hidden inside mismatched dollar-quoted tags', () => {
    // $a$ ... $b$ — different tags, content is NOT stripped
    expect(() => assertNoTransactionControl("SELECT $a$ COMMIT $b$ FROM t")).toThrow('Transaction control');
  });
});

// ---------------------------------------------------------------------------
// wrapInReadOnlyTransaction
// ---------------------------------------------------------------------------

describe('wrapInReadOnlyTransaction', () => {
  test('wraps a simple SELECT', () => {
    const result = wrapInReadOnlyTransaction('SELECT 1');
    expect(result).toContain('BEGIN;');
    expect(result).toContain('SET LOCAL transaction_read_only = on;');
    expect(result).toContain('SELECT 1;');
    expect(result).toContain('ROLLBACK;');
  });

  test('adds semicolon if missing', () => {
    const result = wrapInReadOnlyTransaction('SELECT 1');
    expect(result).toContain('SELECT 1;\nROLLBACK;');
  });

  test('does not duplicate semicolon if already present', () => {
    const result = wrapInReadOnlyTransaction('SELECT 1;');
    expect(result).not.toContain('SELECT 1;;');
  });

  test('throws on SQL containing BEGIN', () => {
    expect(() => wrapInReadOnlyTransaction('SELECT 1; BEGIN')).toThrow('Transaction control');
  });

  test('throws on SQL containing COMMIT', () => {
    expect(() => wrapInReadOnlyTransaction('SELECT 1; COMMIT')).toThrow('Transaction control');
  });

  test('allows CASE...END in wrapped SQL', () => {
    expect(() => wrapInReadOnlyTransaction(
      'SELECT CASE WHEN x = 1 THEN 2 ELSE 3 END FROM t'
    )).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateSqlFilePath
// ---------------------------------------------------------------------------

describe('validateSqlFilePath', () => {
  test('accepts valid absolute .sql path', () => {
    expect(validateSqlFilePath('/home/user/migration.sql')).toBe('/home/user/migration.sql');
  });

  test('rejects non-.sql extension', () => {
    expect(() => validateSqlFilePath('/home/user/migration.txt')).toThrow('.sql extension');
  });

  test('rejects relative path', () => {
    expect(() => validateSqlFilePath('migration.sql')).toThrow('absolute path');
  });

  test('rejects path with directory traversal', () => {
    expect(() => validateSqlFilePath('/home/../etc/passwd.sql')).toThrow('directory traversal');
  });

  test('rejects empty string', () => {
    expect(() => validateSqlFilePath('')).toThrow('non-empty string');
  });
});
