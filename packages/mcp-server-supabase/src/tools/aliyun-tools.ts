import type { SupabasePlatform } from '../platform/types.js';
import { type Tool, tool } from '@supabase/mcp-utils';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { injectableTool } from './util.js';

export type AliyunToolsOptions = {
  platform: SupabasePlatform;
  readOnly?: boolean;
  /**
   * The Aliyun project ID to scope tools to.
   * If specified, tools will automatically inject this project_id.
   */
  aliyunProjectId?: string;
  /**
   * The Aliyun region ID to scope tools to.
   * If specified, tools will automatically inject this region_id.
   */
  aliyunRegionId?: string;
};

/**
 * 对正则表达式中的特殊字符进行转义，防止正则注入。
 */
const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * 打印 fetch 失败的详细信息，便于排查网络层问题
 * （DNS、TLS、连接超时、代理、证书等）。
 */
const logFetchFailure = (err: unknown, context: string): void => {
  console.error(`=== Fetch failure in ${context} ===`);
  if (err instanceof Error) {
    console.error(`  name: ${err.name}`);
    console.error(`  message: ${err.message}`);
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object') {
      const c = cause as Record<string, unknown>;
      console.error(`  cause.name: ${String(c.name ?? '')}`);
      console.error(`  cause.message: ${String(c.message ?? '')}`);
      console.error(`  cause.code: ${String(c.code ?? '')}`);
      console.error(`  cause.errno: ${String(c.errno ?? '')}`);
      console.error(`  cause.syscall: ${String(c.syscall ?? '')}`);
      console.error(`  cause.hostname: ${String(c.hostname ?? '')}`);
      console.error(`  cause.address: ${String(c.address ?? '')}`);
      console.error(`  cause.port: ${String(c.port ?? '')}`);
      if (c.stack) console.error(`  cause.stack: ${String(c.stack)}`);
    } else if (cause !== undefined) {
      console.error(`  cause: ${String(cause)}`);
    }
    if (err.stack) console.error(`  stack: ${err.stack}`);
  } else {
    console.error(`  raw: ${String(err)}`);
  }
  console.error(`  env.HTTP_PROXY: ${process.env.HTTP_PROXY ?? '(unset)'}`);
  console.error(`  env.HTTPS_PROXY: ${process.env.HTTPS_PROXY ?? '(unset)'}`);
  console.error(`  env.ALL_PROXY: ${process.env.ALL_PROXY ?? '(unset)'}`);
  console.error(`  env.NO_PROXY: ${process.env.NO_PROXY ?? '(unset)'}`);
  console.error(`  env.http_proxy: ${process.env.http_proxy ?? '(unset)'}`);
  console.error(`  env.https_proxy: ${process.env.https_proxy ?? '(unset)'}`);
  console.error(`  node.version: ${process.version}`);
  console.error(`  platform: ${process.platform}`);
  console.error(`=== End fetch failure (${context}) ===`);
};

export async function getAliyunTools({ 
  platform, 
  readOnly,
  aliyunProjectId,
  aliyunRegionId,
}: AliyunToolsOptions): Promise<Record<string, Tool>> {
  
  const WRITE_KEYWORDS = [
    'CREATE', 'DROP', 'ALTER', 'TRUNCATE',
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE'
  ];

  // Prepare inject values for tools that need project_id and/or region_id
  const project_id = aliyunProjectId;
  const region_id = aliyunRegionId;

  return {
    list_aliyun_supabase_projects: injectableTool({
      description: 'Lists all Supabase projects deployed on the Aliyun platform. Use this to retrieve a list of existing projects with their basic information. If no projects are found in the default region (cn-hangzhou), try other regions obtained from the describe_regions tool.',
      parameters: z.object({
        region_id: z.string().optional().describe('Region ID (e.g., cn-hangzhou, cn-shanghai, cn-beijing, etc.)'),
        next_token: z.string().optional().describe('Next token for pagination'),
        max_results: z.number().optional().describe('Maximum number of results to return')
      }),
      inject: { region_id },
      execute: async (options) => {
        try {
          const result = await platform.listAliyunSupabaseProjects(options);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          // 类型检查确保 error 是 Error 实例
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    get_supabase_project: injectableTool({
      description: 'Gets details for a specific Supabase project on Aliyun platform.',
      parameters: z.object({
        project_id: z.string().describe('The ID of the Supabase project.'),
        region_id: z.string().optional().describe('Region ID'),
      }),
      inject: { project_id, region_id },
      execute: async (options) => {
        try {
          // 这里的 options 将是 { project_id: '...', region_id: '...' } (injected if provided)
          const result = await platform.getAliyunSupabaseProject(options);
          // 返回 JSON 格式的结果，让 AI 自己去解析和总结
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    // get_supabase_project_dashboard_account: tool({
    //   description: 'Gets the Supabase project dashboard account information.',
    //   parameters: z.object({
    //     project_id: z.string().describe('The Supabase instance ID.'),
    //     region_id: z.string().optional().describe('Region ID'),
    //   }),
    //   execute: async (options) => {
    //     try {
    //       const result = await platform.getAliyunSupabaseProjectDashboardAccount(options);
          
    //       return {
    //         content: [{
    //           type: 'text',
    //           text: JSON.stringify(result, null, 2)
    //         }]
    //       };
    //     } catch (error) {
    //       throw new Error(`Failed to get dashboard account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    //     }
    //   },
    // }),

    get_supabase_project_api_keys: injectableTool({
      description: 'Gets the Supabase project API keys including anon key and serviceRoleKey.',
      parameters: z.object({
        project_id: z.string().describe('The Supabase instance ID.'),
        region_id: z.string().optional().describe('The region ID where the instance is located.'),
      }),
      inject: { project_id, region_id },
      execute: async (options) => {
        try {
          const result = await platform.getAliyunSupabaseProjectApiKeys(options);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    modify_supabase_project_security_ip_list: injectableTool({
      description: 'Modify the IP whitelist for a Supabase project. You need to add the client IP address or IP address range to the whitelist before using the Supabase instance.',
      parameters: z.object({
        project_id: z.string().describe('The Supabase instance ID.'),
        region_id: z.string().optional().describe('Region ID. You can call the DescribeRegions API to view available region IDs.'),
        security_ip_list: z.string().describe('Comma-separated list of IP addresses or CIDR blocks to add to the whitelist. Up to 1000 entries. Format: 10.23.12.24 (IP) or 10.23.12.24/24 (CIDR)'),
      }),
      inject: { project_id, region_id },
      execute: async (options) => {
        try {
          const result = await platform.modifyAliyunSupabaseProjectSecurityIps({
            project_id: options.project_id,
            region_id: options.region_id,
            security_ip_list: options.security_ip_list.split(',').map(ip => ip.trim())
          });
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    reset_supabase_project_password: injectableTool({
      description: 'Reset the database password for a Supabase project.',
      parameters: z.object({
        project_id: z.string().describe('The Supabase instance ID.'),
        region_id: z.string().optional().describe('Instance region ID.'),
        account_password: z.string().describe('Database account password. Must contain at least three of the following: uppercase letters, lowercase letters, numbers, and special characters. Special characters include: !@#$%^&*()_+-=. Password length must be between 8 and 32 characters.'),
      }),
      inject: { project_id, region_id },
      execute: async (options) => {
        try {
          const result = await platform.resetAliyunSupabaseProjectPassword(options);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    create_supabase_project: injectableTool({
      description: 'Create a new Supabase project on Aliyun platform.',
      parameters: z.object({
        project_name: z.string().describe('Project name. Must be 1-128 characters long. Can only contain English letters, numbers, hyphens (-) and underscores (_). Must start with an English letter or underscore (_).'),
        zone_id: z.string().describe('Zone ID. You can call the DescribeRegions API to view available zone IDs.'),
        account_password: z.string().describe('Initial account password. Must contain at least three of the following: uppercase letters, lowercase letters, numbers, and special characters. Special characters include: !@#$%^&*()_+-=. Password length must be between 8 and 32 characters.'),
        security_ip_list: z.string().describe('IP whitelist. 127.0.0.1 means禁止任何外部 IP 访问, you can modify the IP whitelist after the instance is created by calling the ModifySecurityIps API.'),
        vpc_id: z.string().describe('VPC ID. You can call the DescribeRdsVpcs API to view available VPC IDs. This parameter is required.'),
        v_switch_id: z.string().describe('vSwitch ID. vSwitchId is required. The zone where the vSwitch is located must be consistent with ZoneId.'),
        project_spec: z.string().describe('Supabase instance specification, default is 1C1G.'),
        region_id: z.string().optional().describe('Region ID. You can call the DescribeRegions API to view available region IDs.'),
        storage_size: z.number().optional().describe('Storage space size in GB, default is 1GB.'),
        disk_performance_level: z.enum(['PL0', 'PL1']).optional().describe('Cloud disk PL level, default is PL0.'),
        client_token: z.string().optional().describe('Idempotency check. For more information, see How to Ensure Idempotency.'),
      }),
      inject: { region_id },
      execute: async (options) => {
        try {
          const result = await platform.createAliyunSupabaseProject(options);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    delete_supabase_project: injectableTool({
      description: 'Delete a Supabase project on Aliyun platform.',
      parameters: z.object({
        project_id: z.string().describe('Supabase project ID. You can log in to the console Supabase page to get the workspace ID.'),
        region_id: z.string().optional().describe('The region ID where the instance is located.'),
      }),
      inject: { project_id, region_id },
      execute: async (options) => {
        try {
          const result = await platform.deleteAliyunSupabaseProject(options);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    describe_regions: tool({
      description: 'Describe available regions and zones for Aliyun Supabase projects.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const result = await platform.describeRegions();
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    describe_rds_vpcs: injectableTool({
      description: 'Describe available VPCs in Aliyun for Supabase project deployment',
      parameters: z.object({
        region_id: z.string().optional().describe('Region ID. You can call the DescribeRegions API to view available region IDs.'),
      }),
      inject: { region_id },
      execute: async (options) => {
        try {
          const result = await platform.describeRdsVpcs(options);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    describe_rds_vswitches: injectableTool({
      description: 'Describe available vSwitches in Aliyun for Supabase project deployment',
      parameters: z.object({
        region_id: z.string().optional().describe('Region ID. You can call the DescribeRegions API to view available region IDs.'),
        zone_id: z.string().describe('Zone ID. Must be consistent with the zone where the Supabase instance will be deployed.'),
        vpc_id: z.string().describe('VPC ID. The VPC where the vSwitches are located.'),
      }),
      inject: { region_id },
      execute: async (options) => {
        try {
          const result = await platform.describeRdsVSwitches(options);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    execute_sql: tool({
      description: 'Executes custom SQL queries on a Supabase project database via the TypeScript fetch interface. Requires PublicConnectUrl and serviceRoleKey.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        sql: z.string().describe('SQL query to execute')
      }),
      execute: async ({ url, api_key, sql }) => {
        // Check for DDL operations in read-only mode
        if (readOnly) {
          const upperSql = sql.toUpperCase().trim();
          const isWriteOperation = WRITE_KEYWORDS.some(keyword => {
            const escapedKeyword = escapeRegExp(keyword);
            const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
            return regex.test(upperSql);
          });

          if (isWriteOperation) {
            const matchedKeyword = WRITE_KEYWORDS.find(k => {
              const escaped = escapeRegExp(k);
              return new RegExp(`\\b${escaped}\\b`, 'i').test(upperSql);
            });
            throw new Error(`Cannot execute write operation '${sql}' in read-only mode. Detected write keyword: ${matchedKeyword}`);
          }

          // 检测用户 SQL 是否已有事务
          const hasTransaction = /BEGIN|START\s+TRANSACTION/i.test(sql);

          // 如果已有事务，仅在事务中插入只读设置
          if (hasTransaction) {
            sql = sql.replace(/BEGIN/i, 'BEGIN;\nSET LOCAL transaction_read_only = on;');
          } else {
            // 否则包裹为只读事务
            sql = `BEGIN;\nSET LOCAL transaction_read_only = on;\n${sql}\nROLLBACK;`;
          }
        }
        
        try {
          console.error('Debug - Attempting to execute SQL via TypeScript interface');
          const result = await platform.executeSqlViaUrl({ url, api_key, sql });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'execute_sql');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    execute_sql_file: tool({
      description: 'Executes SQL from a local file. Use this instead of execute_sql for large SQL files (e.g. database functions over 5KB) to avoid MCP transport size limits. Reads the file from disk and runs it against the Supabase project database.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        file_path: z.string().describe('Absolute path to the SQL file on the local filesystem')
      }),
      execute: async ({ url, api_key, file_path }) => {
        let sql: string;
        try {
          sql = readFileSync(file_path, 'utf-8');
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: Failed to read SQL file at ${file_path}: ${err instanceof Error ? err.message : String(err)}` }]
          };
        }

        // Check for DDL operations in read-only mode
        if (readOnly) {
          const upperSql = sql.toUpperCase().trim();
          const isWriteOperation = WRITE_KEYWORDS.some(keyword => {
            const escapedKeyword = escapeRegExp(keyword);
            const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
            return regex.test(upperSql);
          });

          if (isWriteOperation) {
            const matchedKeyword = WRITE_KEYWORDS.find(k => {
              const escaped = escapeRegExp(k);
              return new RegExp(`\\b${escaped}\\b`, 'i').test(upperSql);
            });
            return {
              content: [{ type: 'text', text: `Error: Cannot execute write operation in read-only mode. Detected write keyword: ${matchedKeyword}` }]
            };
          }

          const hasTransaction = /BEGIN|START\s+TRANSACTION/i.test(sql);
          if (hasTransaction) {
            sql = sql.replace(/BEGIN/i, 'BEGIN;\nSET LOCAL transaction_read_only = on;');
          } else {
            sql = `BEGIN;\nSET LOCAL transaction_read_only = on;\n${sql}\nROLLBACK;`;
          }
        }

        try {
          console.error('Debug - Attempting to execute SQL file via TypeScript interface');
          const result = await platform.executeSqlViaUrl({ url, api_key, sql });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'execute_sql_file');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    list_table: tool({
      description: 'Lists all tables in specified schemas of a Supabase project database. By default lists all non-system tables, but can filter by schema. Uses the TypeScript fetch interface. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        schemas: z.array(z.string()).optional().describe('List of schema names to filter tables. If not specified, returns all non-system schemas.'),
      }),
      execute: async ({ url, api_key, schemas }) => {
        try {
          // 构建 SQL 查询
          let sql: string;
          if (schemas && schemas.length > 0) {
            // 如果指定了 schemas，只查询这些 schema
            const schemaList = schemas.map(s => `'${s}'`).join(',');
            sql = `SELECT table_schema, table_name, table_type 
                    FROM information_schema.tables 
                    WHERE table_schema IN (${schemaList})
                    ORDER BY table_schema, table_name`;
          } else {
            // 如果没有指定 schemas，排除系统表
            sql = `SELECT table_schema, table_name, table_type 
                    FROM information_schema.tables 
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                    ORDER BY table_schema, table_name`;
          }

          // 使用平台接口执行 SQL
          const result = await platform.executeSqlViaUrl({ url, api_key, sql });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };

        } catch (error) {
          logFetchFailure(error, 'list_table');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    list_columns: tool({
      description: 'Lists all columns in a table with detailed metadata including data type, nullable status, default values, and constraints. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        table_name: z.string().describe('The name of the table to list columns from'),
        schema: z.string().optional().default('public').describe('The schema name (defaults to public)'),
      }),
      execute: async ({ url, api_key, table_name, schema = 'public' }) => {
        try {
          // 构建 SQL 查询
          const sql = `
            SELECT 
              column_name,
              data_type,
              is_nullable,
              column_default,
              character_maximum_length,
              numeric_precision,
              numeric_scale,
              ordinal_position
            FROM information_schema.columns 
            WHERE table_schema = '${schema}' AND table_name = '${table_name}'
            ORDER BY ordinal_position
          `;

          // 使用平台接口执行 SQL
          const result = await platform.executeSqlViaUrl({ url, api_key, sql });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'list_columns');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    list_indexes: tool({
      description: 'Lists all indexes on tables in a schema including index name, table name, and index definition. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        schema: z.string().optional().default('public').describe('The schema name (defaults to public)'),
      }),
      execute: async ({ url, api_key, schema = 'public' }) => {
        try {
          // 构建 SQL 查询
          const sql = `
            SELECT 
              schemaname,
              tablename,
              indexname,
              indexdef
            FROM pg_indexes
            WHERE schemaname = '${schema}'
            ORDER BY tablename, indexname
          `;

          // 使用平台接口执行 SQL
          const result = await platform.executeSqlViaUrl({ url, api_key, sql });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'list_indexes');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    list_extensions: tool({
      description: 'Lists all PostgreSQL extensions installed in the database. Shows extension name, version, schema, and description. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
      }),
      execute: async ({ url, api_key }) => {
        try {
          // 构建 SQL 查询
          const sql = `
            SELECT 
              extname as extension_name,
              extversion as version,
              n.nspname as schema,
              obj_description(e.oid, 'pg_extension') as comment
            FROM pg_extension e
            JOIN pg_namespace n ON e.extnamespace = n.oid
            ORDER BY extname
          `;

          // 使用平台接口执行 SQL
          const result = await platform.executeSqlViaUrl({ url, api_key, sql });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'list_extensions');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    deploy_edge_function: tool({
      description: 'Deploys an Edge Function to a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools. The TypeScript file must be named index.ts.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        slug: z.string().describe('Function slug (identifier)'),
        name: z.string().describe('Function name'),
        verify_jwt: z.boolean().optional().default(true).describe('Whether to verify JWT (default: true)'),
        file_content: z.string().describe('The content of the function file to deploy. The file must be named index.ts.'),
      }),
      execute: async ({ url, api_key, slug, name, verify_jwt = true, file_content }) => {
        // 检查代码中是否包含 import 语句
        const hasImport = /import\s+.*from|import\s+["']|import\s+type\s+.*from|import\s*\(/.test(file_content);
        
        // 如果检测到 import，保存警告信息
        const warningMessage = hasImport 
          ? 'The edge function code contains import statements. When using imports, you must ensure that your Supabase instance has access to the public internet to download dependencies. For more information about getting access to the public internet, please refer to the following link: https://help.aliyun.com/zh/analyticdb/analyticdb-for-postgresql/support/how-to-enable-public-network-access-for-analyticdb-supabase?spm=a2c4g.11186623.help-menu-search-92664.d_0'
          : null;
        
        // 打印警告信息到控制台
        if (warningMessage) {
          console.warn(`Warning: ${warningMessage}`);
        }
        
        try {
          // 强制使用 index.ts 作为文件名
          const entrypoint_path = 'index.ts';
          
          // 构建 API 端点
          let apiUrl = url;
          if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
            apiUrl = "https://" + apiUrl;
          }
          const apiEndpoint = `${apiUrl}/api/edge-api/v1/projects/default/functions/deploy?slug=${encodeURIComponent(slug)}`;

          // 构建 metadata JSON
          const metadata = {
            entrypoint_path,
            name,
            verify_jwt,
          };
          const metadataJson = JSON.stringify(metadata);

          // 调试信息：与 bash 脚本的输出格式保持一致
          console.error(`🚀 Deploying function: ${slug}`);
          console.error(`📍 API Endpoint: ${apiEndpoint}`);
          console.error(`📋 Metadata: ${metadataJson}`);

          // 使用 Node.js fetch API 发送 multipart/form-data 请求
          // 根据 bash 脚本：curl -F "metadata=${METADATA_JSON}" -F "file=@${FUNCTION_DIR}/index.ts"
          try {
            const formData = new FormData();
            
            // metadata 作为字符串传递，与 curl -F "metadata=${METADATA_JSON}" 一致
            // 在 multipart/form-data 中，字符串值会作为表单字段值发送，不设置特定的 content-type
            formData.append('metadata', metadataJson);
            
            // file 使用 Blob，并指定文件名为 index.ts
            // 使用 'application/typescript' 作为 content-type，与 api-platform.ts 保持一致
            const fileBlob = new Blob([file_content], { type: 'application/typescript' });
            formData.append('file', fileBlob, entrypoint_path);

            // 注意：不要手动设置 Content-Type header，FormData 会自动设置正确的 multipart/form-data boundary
            const response = await fetch(apiEndpoint, {
              method: 'POST',
              headers: {
                'apiKey': api_key,
              },
              body: formData,
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Debug - Error response body: ${errorText}`);
              throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            console.error(`✅ Deploy request sent!`);
            console.error(`Debug - Success response:`, JSON.stringify(result, null, 2));
            
            // 构建返回内容
            const content: Array<{ type: 'text'; text: string }> = [];
            
            // 如果有警告信息，首先添加一个明显的警告提示
            if (warningMessage) {
              content.push({
                type: 'text',
                text: `⚠️ WARNING: ${warningMessage}\n\n`
              });
            }
            
            // 添加部署结果
            const responseData = warningMessage 
              ? Object.assign({}, typeof result === 'object' && result !== null ? result : {}, { warning: warningMessage })
              : result;
            
            content.push({
              type: 'text',
              text: JSON.stringify(responseData, null, 2)
            });
            
            return { content };
          } catch (fetchError) {
            // fetch 失败时，记录详细网络层日志，不再尝试 curl
            logFetchFailure(fetchError, 'deploy_edge_function');
            const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error occurred';
            console.error(`Debug - Fetch API failed: ${errorMessage}`);
            console.error(`Debug - Error stack:`, fetchError instanceof Error ? fetchError.stack : 'No stack trace');
            console.error(`Debug - Metadata that was sent: ${metadataJson}`);
            console.error(`Debug - API Endpoint that was called: ${apiEndpoint}`);
            
            // 构建返回内容
            const content: Array<{ type: 'text'; text: string }> = [];
            
            // 如果有警告信息，首先添加一个明显的警告提示
            if (warningMessage) {
              content.push({
                type: 'text',
                text: `⚠️ WARNING: ${warningMessage}\n\n`
              });
            }
            
            // 添加错误结果
            const errorResult: any = { 
              error: errorMessage,
              metadata: metadata,
              endpoint: apiEndpoint
            };
            if (warningMessage) {
              errorResult.warning = warningMessage;
            }
            
            content.push({
              type: 'text',
              text: JSON.stringify(errorResult, null, 2)
            });
            
            return { content };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Outer catch error: ${message}`);
          console.error(`Debug - Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
          
          // 构建返回内容
          const content: Array<{ type: 'text'; text: string }> = [];
          
          // 如果有警告信息，首先添加一个明显的警告提示
          if (warningMessage) {
            content.push({
              type: 'text',
              text: `⚠️ WARNING: ${warningMessage}\n\n`
            });
          }
          
          // 添加错误结果
          const errorResult: any = { 
            error: message 
          };
          if (warningMessage) {
            errorResult.warning = warningMessage;
          }
          
          content.push({
            type: 'text',
            text: JSON.stringify(errorResult, null, 2)
          });
          
          return { content };
        }
      }
    }),

    list_edge_functions: tool({
      description: 'Lists all Edge Functions in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
      }),
      execute: async ({ url, api_key }) => {
        try {
          // 构建 API 端点
          let apiUrl = url;
          if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
            apiUrl = "https://" + apiUrl;
          }
          const apiEndpoint = `${apiUrl}/api/edge-api/v1/projects/default/functions`;

          // 使用 Node.js fetch API 发送 GET 请求
          const response = await fetch(apiEndpoint, {
            method: 'GET',
            headers: {
              'apiKey': api_key,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'list_edge_functions');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    invoke_edge_function: tool({
      description: 'Invokes an Edge Function in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and anon key for authentication.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('Anon key for authentication (not serviceRoleKey)'),
        function_name: z.string().describe('Function name (slug) to invoke'),
        data: z.record(z.any()).optional().describe('Optional JSON data to send as request body'),
      }),
      execute: async ({ url, api_key, function_name, data }) => {
        try {
          // 构建 API 端点
          let apiUrl = url;
          if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
            apiUrl = "https://" + apiUrl;
          }
          const apiEndpoint = `${apiUrl}/functions/v1/${encodeURIComponent(function_name)}`;

          // 构建请求体
          const requestBody = data ? JSON.stringify(data) : undefined;

          // 使用 Node.js fetch API 发送 POST 请求
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${api_key}`,
              'Content-Type': 'application/json',
            },
            body: requestBody,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          // 尝试解析 JSON 响应，如果不是 JSON 则返回文本
          const contentType = response.headers.get('content-type');
          let result;
          if (contentType && contentType.includes('application/json')) {
            result = await response.json();
          } else {
            result = await response.text();
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'invoke_edge_function');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    delete_edge_function: tool({
      description: 'Deletes an Edge Function from a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        function_name: z.string().describe('Function name (slug) to delete'),
      }),
      execute: async ({ url, api_key, function_name }) => {
        try {
          // 构建 API 端点
          let apiUrl = url;
          if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
            apiUrl = "https://" + apiUrl;
          }
          const apiEndpoint = `${apiUrl}/api/edge-api/v1/projects/default/functions/${encodeURIComponent(function_name)}`;

          // 使用 Node.js fetch API 发送 DELETE 请求
          const response = await fetch(apiEndpoint, {
            method: 'DELETE',
            headers: {
              'apiKey': api_key,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          // DELETE 请求可能返回空响应或 JSON
          const contentType = response.headers.get('content-type');
          let result;
          if (contentType && contentType.includes('application/json')) {
            result = await response.json();
          } else {
            // 如果响应为空，返回成功消息
            const text = await response.text();
            result = text || { message: 'Function deleted successfully' };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'delete_edge_function');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    list_auth_users: tool({
      description: 'Lists all authentication users in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools. Uses Supabase Admin API to retrieve user information.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication (required for Admin API access)'),
        page: z.number().optional().describe('Page number for pagination (default: 1)'),
        per_page: z.number().optional().describe('Number of users per page (default: 50, max: 1000)'),
      }),
      execute: async ({ url, api_key, page, per_page }) => {
        try {
          // 使用平台接口列出用户
          const result = await platform.listAuthUsersViaUrl({ url, api_key, page, per_page });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'list_auth_users');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    get_auth_user: tool({
      description: 'Retrieves details for a specific user in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools. Uses Supabase Admin API to retrieve user information.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication (required for Admin API access)'),
        user_id: z.string().describe('The ID of the user to retrieve'),
      }),
      execute: async ({ url, api_key, user_id }) => {
        try {
          // 使用平台接口获取用户
          const result = await platform.getAuthUserViaUrl({ url, api_key, user_id });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'get_auth_user');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    create_auth_user: tool({
      description: 'Creates a new user using Supabase Admin API in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication (required for Admin API access)'),
        email: z.string().optional().describe('Email address for the user'),
        phone: z.string().optional().describe('Phone number for the user'),
        password: z.string().optional().describe('Password for the user'),
        email_confirm: z.boolean().optional().describe('Whether to confirm the email address (default: false)'),
        phone_confirm: z.boolean().optional().describe('Whether to confirm the phone number (default: false)'),
        user_metadata: z.record(z.any()).optional().describe('Custom user metadata'),
        app_metadata: z.record(z.any()).optional().describe('Custom app metadata'),
        ban_duration: z.string().optional().describe('Ban duration (e.g., "24h", "1w")'),
      }),
      execute: async ({ url, api_key, email, phone, password, email_confirm, phone_confirm, user_metadata, app_metadata, ban_duration }) => {
        try {
          // 使用平台接口创建用户
          const result = await platform.createAuthUserViaUrl({
            url,
            api_key,
            email,
            phone,
            password,
            email_confirm,
            phone_confirm,
            user_metadata,
            app_metadata,
            ban_duration,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'create_auth_user');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    delete_auth_user: tool({
      description: 'Deletes a user using Supabase Admin API in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication (required for Admin API access)'),
        user_id: z.string().describe('The ID of the user to delete'),
      }),
      execute: async ({ url, api_key, user_id }) => {
        try {
          // 使用平台接口删除用户
          await platform.deleteAuthUserViaUrl({ url, api_key, user_id });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ message: 'User deleted successfully' }, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'delete_auth_user');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    update_auth_user: tool({
      description: 'Updates user details using Supabase Admin API in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication (required for Admin API access)'),
        user_id: z.string().describe('The ID of the user to update'),
        email: z.string().optional().describe('New email address for the user'),
        phone: z.string().optional().describe('New phone number for the user'),
        password: z.string().optional().describe('New password for the user'),
        email_confirm: z.boolean().optional().describe('Whether to confirm the email address'),
        phone_confirm: z.boolean().optional().describe('Whether to confirm the phone number'),
        user_metadata: z.record(z.any()).optional().describe('Custom user metadata to update'),
        app_metadata: z.record(z.any()).optional().describe('Custom app metadata to update'),
        ban_duration: z.string().optional().describe('Ban duration (e.g., "24h", "1w")'),
      }),
      execute: async ({ url, api_key, user_id, email, phone, password, email_confirm, phone_confirm, user_metadata, app_metadata, ban_duration }) => {
        try {
          // 使用平台接口更新用户
          const result = await platform.updateAuthUserViaUrl({
            url,
            api_key,
            user_id,
            email,
            phone,
            password,
            email_confirm,
            phone_confirm,
            user_metadata,
            app_metadata,
            ban_duration,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'update_auth_user');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    // Storage operations
    list_storage_buckets: tool({
      description: 'Lists all storage buckets in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
      }),
      execute: async ({ url, api_key }) => {
        try {
          const result = await platform.listStorageBucketsViaUrl({ url, api_key });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'list_storage_buckets');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    create_storage_bucket: tool({
      description: 'Creates a new storage bucket in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        name: z.string().describe('Name of the bucket to create'),
        public: z.boolean().optional().describe('Whether the bucket should be public (default: false)'),
        file_size_limit: z.number().optional().describe('Maximum file size in bytes'),
        allowed_mime_types: z.array(z.string()).optional().describe('Array of allowed MIME types'),
      }),
      execute: async ({ url, api_key, name, public: isPublic, file_size_limit, allowed_mime_types }) => {
        try {
          const result = await platform.createStorageBucketViaUrl({
            url,
            api_key,
            name,
            public: isPublic,
            file_size_limit,
            allowed_mime_types,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'create_storage_bucket');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    delete_storage_bucket: tool({
      description: 'Deletes a storage bucket from a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        bucket_name: z.string().describe('Name of the bucket to delete'),
      }),
      execute: async ({ url, api_key, bucket_name }) => {
        try {
          await platform.deleteStorageBucketViaUrl({ url, api_key, bucket_name });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ message: 'Bucket deleted successfully' }, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'delete_storage_bucket');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    list_storage_files: tool({
      description: 'Lists files in a storage bucket in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        bucket_name: z.string().describe('Name of the bucket'),
        path: z.string().optional().describe('Path prefix to filter files'),
        limit: z.number().optional().describe('Maximum number of files to return'),
        offset: z.number().optional().describe('Number of files to skip'),
        sort_by_column: z.string().optional().describe('Column to sort by (e.g., "name", "created_at", "updated_at")'),
        sort_by_order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
      }),
      execute: async ({ url, api_key, bucket_name, path, limit, offset, sort_by_column, sort_by_order }) => {
        try {
          const result = await platform.listStorageFilesViaUrl({
            url,
            api_key,
            bucket_name,
            path,
            limit,
            offset,
            sort_by: sort_by_column || sort_by_order ? {
              column: sort_by_column,
              order: sort_by_order,
            } : undefined,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'list_storage_files');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    upload_storage_file: tool({
      description: 'Uploads a file to a storage bucket in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        bucket_name: z.string().describe('Name of the bucket'),
        file_path: z.string().describe('Path where the file should be stored in the bucket'),
        file_content: z.string().describe('Content of the file to upload (as base64 encoded string or plain text)'),
        content_type: z.string().optional().describe('MIME type of the file (e.g., "image/png", "text/plain")'),
        upsert: z.boolean().optional().describe('Whether to overwrite if file already exists (default: false)'),
      }),
      execute: async ({ url, api_key, bucket_name, file_path, file_content, content_type, upsert }) => {
        try {
          // 尝试将 base64 字符串解码为 ArrayBuffer
          let fileData: string | ArrayBuffer | Blob = file_content;
          try {
            // 检查是否是 base64 编码
            if (file_content.startsWith('data:')) {
              // data URL 格式: data:image/png;base64,...
              const parts = file_content.split(',');
              const base64Data = parts[1];
              if (base64Data) {
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                fileData = bytes.buffer;
              }
            } else if (/^[A-Za-z0-9+/=]+$/.test(file_content) && file_content.length > 100) {
              // 可能是 base64 字符串
              const binaryString = atob(file_content);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              fileData = bytes.buffer;
            }
          } catch {
            // 如果不是 base64，保持原样作为字符串
            fileData = file_content;
          }

          const result = await platform.uploadStorageFileViaUrl({
            url,
            api_key,
            bucket_name,
            file_path,
            file_content: fileData,
            content_type,
            upsert,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'upload_storage_file');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    download_storage_file: tool({
      description: 'Downloads a file from a storage bucket in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        bucket_name: z.string().describe('Name of the bucket'),
        file_path: z.string().describe('Path of the file to download'),
      }),
      execute: async ({ url, api_key, bucket_name, file_path }) => {
        try {
          const blob = await platform.downloadStorageFileViaUrl({
            url,
            api_key,
            bucket_name,
            file_path,
          });
          
          // 将 Blob 转换为 base64 字符串以便返回
          // 使用更安全的方法处理大文件，避免堆栈溢出
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          // 完全避免展开运算符，逐个处理字节
          let binaryString = '';
          for (let i = 0; i < uint8Array.length; i++) {
            const byte = uint8Array[i];
            if (byte !== undefined) {
              binaryString += String.fromCharCode(byte);
            }
          }
          const base64 = btoa(binaryString);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                content: base64,
                content_type: blob.type || 'application/octet-stream',
                size: blob.size,
              }, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'download_storage_file');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    delete_storage_file: tool({
      description: 'Deletes one or more files from a storage bucket in a Supabase project on Aliyun. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project (e.g., https://sbp-xxx.supabase.opentrust.net)'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
        bucket_name: z.string().describe('Name of the bucket'),
        file_path: z.union([
          z.string(),
          z.array(z.string())
        ]).describe('Path(s) of the file(s) to delete. Can be a single path or an array of paths.'),
      }),
      execute: async ({ url, api_key, bucket_name, file_path }) => {
        try {
          const result = await platform.deleteStorageFileViaUrl({
            url,
            api_key,
            bucket_name,
            file_path,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          logFetchFailure(error, 'delete_storage_file');
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

  };
}