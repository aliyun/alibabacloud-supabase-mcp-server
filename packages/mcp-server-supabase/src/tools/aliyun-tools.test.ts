import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SupabasePlatform } from '../platform/types.js';
import { getAliyunTools } from './aliyun-tools.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Aliyun tools smoke test', () => {
  test('all advertised tools execute with valid local inputs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const platform = new Proxy(
      {},
      {
        get: (_target, property) => {
          if (property === 'downloadStorageFileViaUrl') {
            return async () => new Blob(['hello'], { type: 'text/plain' });
          }
          if (property === 'executeSqlViaUrl') {
            return async () => [];
          }
          if (property === 'listAuthUsersViaUrl') {
            return async () => ({ users: [], total: 0 });
          }
          return async () => ({ ok: true });
        },
      }
    ) as SupabasePlatform;

    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const tools = await getAliyunTools({
      platform,
      readOnly: false,
      aliyunProjectId: 'project-1',
      aliyunRegionId: 'cn-hangzhou',
    });

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'aliyun-tools-'));
    const sqlFile = join(temporaryDirectory, 'query.sql');
    await writeFile(sqlFile, 'SELECT 1');

    const connection = {
      url: 'https://test.supabase.co',
      api_key: 'test-api-key',
    };

    const calls: Array<[string, Record<string, unknown>]> = [
      ['list_aliyun_supabase_projects', { max_results: 10 }],
      ['get_supabase_project', {}],
      ['get_supabase_project_api_keys', {}],
      [
        'modify_supabase_project_security_ip_list',
        { security_ip_list: '127.0.0.1,10.0.0.0/8' },
      ],
      [
        'reset_supabase_project_password',
        { account_password: 'ValidPassword1!' },
      ],
      [
        'create_supabase_project',
        {
          project_name: 'test_project',
          zone_id: 'cn-hangzhou-a',
          account_password: 'ValidPassword1!',
          security_ip_list: '127.0.0.1',
          vpc_id: 'vpc-test',
          v_switch_id: 'vsw-test',
          project_spec: '1C1G',
        },
      ],
      ['delete_supabase_project', {}],
      ['describe_regions', {}],
      ['describe_rds_vpcs', {}],
      [
        'describe_rds_vswitches',
        { zone_id: 'cn-hangzhou-a', vpc_id: 'vpc-test' },
      ],
      ['execute_sql', { ...connection, sql: 'SELECT 1' }],
      ['execute_sql_file', { ...connection, file_path: sqlFile }],
      ['list_table', { ...connection, schemas: ['public'] }],
      ['list_columns', { ...connection, table_name: 'users' }],
      ['list_indexes', connection],
      ['list_extensions', connection],
      [
        'deploy_edge_function',
        {
          ...connection,
          slug: 'hello-world',
          name: 'hello-world',
          file_content: 'Deno.serve(() => new Response("ok"));',
        },
      ],
      ['list_edge_functions', connection],
      [
        'invoke_edge_function',
        {
          ...connection,
          function_name: 'hello-world',
          data: { hello: 'world' },
        },
      ],
      ['delete_edge_function', { ...connection, function_name: 'hello-world' }],
      ['list_auth_users', connection],
      ['get_auth_user', { ...connection, user_id: 'user-1' }],
      [
        'create_auth_user',
        { ...connection, email: 'user@example.com', password: 'Password1!' },
      ],
      ['delete_auth_user', { ...connection, user_id: 'user-1' }],
      [
        'update_auth_user',
        { ...connection, user_id: 'user-1', email: 'updated@example.com' },
      ],
      ['list_storage_buckets', connection],
      ['create_storage_bucket', { ...connection, name: 'files' }],
      ['delete_storage_bucket', { ...connection, bucket_name: 'files' }],
      ['list_storage_files', { ...connection, bucket_name: 'files' }],
      [
        'upload_storage_file',
        {
          ...connection,
          bucket_name: 'files',
          file_path: 'hello.txt',
          file_content: 'hello',
          content_type: 'text/plain',
        },
      ],
      [
        'download_storage_file',
        { ...connection, bucket_name: 'files', file_path: 'hello.txt' },
      ],
      [
        'delete_storage_file',
        { ...connection, bucket_name: 'files', file_path: 'hello.txt' },
      ],
    ];

    try {
      expect(Object.keys(tools)).toHaveLength(calls.length);

      for (const [name, args] of calls) {
        const selectedTool = tools[name];
        expect(selectedTool, `${name} should be registered`).toBeDefined();

        const result = await selectedTool!.execute(args);
        expect(result, `${name} should return a result`).toBeDefined();
        expect(
          JSON.stringify(result),
          `${name} should not return an error`
        ).not.toContain('Error:');
      }

      expect(fetchMock).toHaveBeenCalledTimes(4);
      for (const [, requestOptions] of fetchMock.mock.calls) {
        expect(requestOptions).toEqual(
          expect.objectContaining({ redirect: 'manual' })
        );
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
