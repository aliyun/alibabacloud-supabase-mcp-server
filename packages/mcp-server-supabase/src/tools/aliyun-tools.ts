import type { SupabasePlatform } from '../platform/types.js';
import { type Tool, tool } from '@supabase/mcp-utils';
import { z } from 'zod';
import { exec } from 'child_process';

export type AliyunToolsOptions = {
  platform: SupabasePlatform;
  readOnly?: boolean;
};

/**
 * 安全地转义一个字符串，以便在 shell 命令中作为单个参数使用。
 * @param {string} arg 要转义的参数。
 * @returns {string} 转义后的参数，已用单引号包裹。
 */
const escapeShellArg = (arg: string): string => {
  // 1. 将字符串中的所有单引号 ' 替换为 '\''
  //    这表示：结束当前的单引号字符串，插入一个转义的单引号，然后开始一个新的单引号字符串。
  // 2. 用单引号将整个结果包裹起来。
  return `'${arg.replace(/'/g, "'\\''")}'`;
};

/**
 * 对正则表达式中的特殊字符进行转义，防止正则注入。
 */
const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export async function getAliyunTools({ platform, readOnly }: AliyunToolsOptions): Promise<Record<string, Tool>> {
  
  const WRITE_KEYWORDS = [
    'CREATE', 'DROP', 'ALTER', 'TRUNCATE',
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE'
  ];

  return {
    list_aliyun_supabase_projects: tool({
      description: 'Lists all Supabase projects deployed on the Aliyun platform. Use this to retrieve a list of existing projects with their basic information. If no projects are found in the default region (cn-hangzhou), try other regions obtained from the describe_regions tool.',
      parameters: z.object({
        region_id: z.string().optional().describe('Region ID (e.g., cn-hangzhou, cn-shanghai, cn-beijing, etc.)'),
        next_token: z.string().optional().describe('Next token for pagination'),
        max_results: z.number().optional().describe('Maximum number of results to return')
      }),
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

    get_supabase_project: tool({
      description: 'Gets details for a specific Supabase project on Aliyun platform.',
      parameters: z.object({
        project_id: z.string().describe('The ID of the Supabase project.'),
        region_id: z.string().optional().describe('Region ID'),
      }),
      execute: async (options) => {
        try {
          // 这里的 options 将是 { project_id: '...' }
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

    get_supabase_project_api_keys: tool({
      description: 'Gets the Supabase project API keys including anon key and serviceRoleKey.',
      parameters: z.object({
        project_id: z.string().describe('The Supabase instance ID.'),
        region_id: z.string().optional().describe('The region ID where the instance is located.'),
      }),
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

    modify_supabase_project_security_ip_list: tool({
      description: 'Modify the IP whitelist for a Supabase project. You need to add the client IP address or IP address range to the whitelist before using the Supabase instance.',
      parameters: z.object({
        project_id: z.string().describe('The Supabase instance ID.'),
        region_id: z.string().optional().describe('Region ID. You can call the DescribeRegions API to view available region IDs.'),
        security_ip_list: z.string().describe('Comma-separated list of IP addresses or CIDR blocks to add to the whitelist. Up to 1000 entries. Format: 10.23.12.24 (IP) or 10.23.12.24/24 (CIDR)'),
      }),
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

    reset_supabase_project_password: tool({
      description: 'Reset the database password for a Supabase project.',
      parameters: z.object({
        project_id: z.string().describe('The Supabase instance ID.'),
        region_id: z.string().optional().describe('Instance region ID.'),
        account_password: z.string().describe('Database account password. Must contain at least three of the following: uppercase letters, lowercase letters, numbers, and special characters. Special characters include: !@#$%^&*()_+-=. Password length must be between 8 and 32 characters.'),
      }),
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

    create_supabase_project: tool({
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

    delete_supabase_project: tool({
      description: 'Delete a Supabase project on Aliyun platform.',
      parameters: z.object({
        project_id: z.string().describe('Supabase project ID. You can log in to the console Supabase page to get the workspace ID.'),
        region_id: z.string().optional().describe('The region ID where the instance is located.'),
      }),
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

    describe_rds_vpcs: tool({
      description: 'Describe available VPCs in Aliyun for Supabase project deployment',
      parameters: z.object({
        region_id: z.string().optional().describe('Region ID. You can call the DescribeRegions API to view available region IDs.'),
      }),
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

    describe_rds_vswitches: tool({
      description: 'Describe available vSwitches in Aliyun for Supabase project deployment',
      parameters: z.object({
        region_id: z.string().optional().describe('Region ID. You can call the DescribeRegions API to view available region IDs.'),
        zone_id: z.string().describe('Zone ID. Must be consistent with the zone where the Supabase instance will be deployed.'),
        vpc_id: z.string().describe('VPC ID. The VPC where the vSwitches are located.'),
      }),
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
      description: 'Executes custom SQL queries on a Supabase project database. First tries to use TypeScript interface, falls back to curl command if needed. Requires PublicConnectUrl and serviceRoleKey.',
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
          // 首先尝试使用 TypeScript 接口 (fetch)
          try {
            console.error('Debug - Attempting to execute SQL via TypeScript interface');
            const result = await platform.executeSqlViaUrl({ url, api_key, sql });
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (tsError) {
            console.error(`Debug - TypeScript interface failed: ${tsError instanceof Error ? tsError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');
            
            // 如果 TypeScript 接口失败，回退到 curl 命令
            // 1. 准备和格式化参数
            let requestUrl = url;
            if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
              requestUrl = "http://" + requestUrl;
            }
            requestUrl = requestUrl + "/pg/query";
            
            // 构建请求体
            const requestBody = { query: sql };
            const jsonData = JSON.stringify(requestBody);

            // 2. 安全地构建 curl 命令
            //    使用 escapeShellArg 对每个动态部分进行转义，防止命令注入
            const command = [
              'curl',
              '-X POST',
              escapeShellArg(requestUrl),
              '-H', escapeShellArg(`apikey: ${api_key}`),
              '-H', escapeShellArg('Content-Type: application/json'),
              '-d', escapeShellArg(jsonData)
            ].join(' ');

            console.error(`Debug - Executing curl command: ${command}`);

            // 3. 执行命令并等待结果
            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  // 如果命令执行失败（例如 curl 不存在，或返回非 0 退出码）
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  // curl 可能会将进度信息等输出到 stderr，但我们仍然可以继续
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  // 尝试解析 stdout 输出的 JSON
                  const parsedOutput = JSON.parse(stdout);
                  resolve(parsedOutput);
                } catch (parseError) {
                  // 如果 stdout 不是有效的 JSON
                  const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                  console.error(`Debug - JSON parse error: ${parseErrorMessage}`);
                  console.error(`Debug - stdout received: ${stdout}`);
                  reject(new Error(`Failed to parse curl output as JSON: ${stdout}`));
                }
              });
            });

            // 4. 返回成功的结果
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          }

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }]
          };
        }
      }
    }),

    list_table: tool({
      description: 'Lists all tables in specified schemas of a Supabase project database. By default lists all non-system tables, but can filter by schema. First tries to use TypeScript interface, falls back to curl command if needed. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
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
          try {
            const result = await platform.executeSqlViaUrl({ url, api_key, sql });
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (tsError) {
            console.error(`Debug - TypeScript interface failed: ${tsError instanceof Error ? tsError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');
            
            // 如果 TypeScript 接口失败，回退到 curl 命令
            let requestUrl = url;
            if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
              requestUrl = "https://" + requestUrl;
            }
            requestUrl = requestUrl + "/pg/query";
            
            const requestBody = { query: sql };
            const jsonData = JSON.stringify(requestBody);

            const command = [
              'curl',
              '-X POST',
              escapeShellArg(requestUrl),
              '-H', escapeShellArg(`apikey: ${api_key}`),
              '-H', escapeShellArg('Content-Type: application/json'),
              '-d', escapeShellArg(jsonData)
            ].join(' ');

            console.error(`Debug list_table - Executing curl command: ${command}`);

            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  const parsedOutput = JSON.parse(stdout);
                  resolve(parsedOutput);
                } catch (parseError) {
                  const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                  console.error(`Debug - JSON parse error: ${parseErrorMessage}`);
                  console.error(`Debug - stdout received: ${stdout}`);
                  reject(new Error(`Failed to parse curl output as JSON: ${stdout}`));
                }
              });
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          }

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
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
          try {
            const result = await platform.executeSqlViaUrl({ url, api_key, sql });
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (tsError) {
            console.error(`Debug - TypeScript interface failed: ${tsError instanceof Error ? tsError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');
            
            // 如果 TypeScript 接口失败，回退到 curl 命令
            let requestUrl = url;
            if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
              requestUrl = "https://" + requestUrl;
            }
            requestUrl = requestUrl + "/pg/query";
            
            const requestBody = { query: sql };
            const jsonData = JSON.stringify(requestBody);

            const command = [
              'curl',
              '-X POST',
              escapeShellArg(requestUrl),
              '-H', escapeShellArg(`apikey: ${api_key}`),
              '-H', escapeShellArg('Content-Type: application/json'),
              '-d', escapeShellArg(jsonData)
            ].join(' ');

            console.error(`Debug list_columns - Executing curl command: ${command}`);

            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  const parsedOutput = JSON.parse(stdout);
                  resolve(parsedOutput);
                } catch (parseError) {
                  const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                  console.error(`Debug - JSON parse error: ${parseErrorMessage}`);
                  console.error(`Debug - stdout received: ${stdout}`);
                  reject(new Error(`Failed to parse curl output as JSON: ${stdout}`));
                }
              });
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
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
          try {
            const result = await platform.executeSqlViaUrl({ url, api_key, sql });
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (tsError) {
            console.error(`Debug - TypeScript interface failed: ${tsError instanceof Error ? tsError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');
            
            // 如果 TypeScript 接口失败，回退到 curl 命令
            let requestUrl = url;
            if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
              requestUrl = "https://" + requestUrl;
            }
            requestUrl = requestUrl + "/pg/query";
            
            const requestBody = { query: sql };
            const jsonData = JSON.stringify(requestBody);

            const command = [
              'curl',
              '-X POST',
              escapeShellArg(requestUrl),
              '-H', escapeShellArg(`apikey: ${api_key}`),
              '-H', escapeShellArg('Content-Type: application/json'),
              '-d', escapeShellArg(jsonData)
            ].join(' ');

            console.error(`Debug list_indexes - Executing curl command: ${command}`);

            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  const parsedOutput = JSON.parse(stdout);
                  resolve(parsedOutput);
                } catch (parseError) {
                  const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                  console.error(`Debug - JSON parse error: ${parseErrorMessage}`);
                  console.error(`Debug - stdout received: ${stdout}`);
                  reject(new Error(`Failed to parse curl output as JSON: ${stdout}`));
                }
              });
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
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
          try {
            const result = await platform.executeSqlViaUrl({ url, api_key, sql });
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (tsError) {
            console.error(`Debug - TypeScript interface failed: ${tsError instanceof Error ? tsError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');
            
            // 如果 TypeScript 接口失败，回退到 curl 命令
            let requestUrl = url;
            if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
              requestUrl = "https://" + requestUrl;
            }
            requestUrl = requestUrl + "/pg/query";
            
            const requestBody = { query: sql };
            const jsonData = JSON.stringify(requestBody);

            const command = [
              'curl',
              '-X POST',
              escapeShellArg(requestUrl),
              '-H', escapeShellArg(`apikey: ${api_key}`),
              '-H', escapeShellArg('Content-Type: application/json'),
              '-d', escapeShellArg(jsonData)
            ].join(' ');

            console.error(`Debug list_extensions - Executing curl command: ${command}`);

            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  const parsedOutput = JSON.parse(stdout);
                  resolve(parsedOutput);
                } catch (parseError) {
                  const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                  console.error(`Debug - JSON parse error: ${parseErrorMessage}`);
                  console.error(`Debug - stdout received: ${stdout}`);
                  reject(new Error(`Failed to parse curl output as JSON: ${stdout}`));
                }
              });
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
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
            // fetch 失败时，直接返回错误，不再尝试 curl
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
          try {
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
          } catch (fetchError) {
            console.error(`Debug - Fetch API failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');

            // 如果 fetch 失败，回退到 curl 命令
            const command = [
              'curl',
              '-X GET',
              escapeShellArg(apiEndpoint),
              '-H', escapeShellArg(`apiKey: ${api_key}`)
            ].join(' ');

            console.error(`Debug list_edge_functions - Executing curl command: ${command}`);

            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  const parsedOutput = JSON.parse(stdout);
                  resolve(parsedOutput);
                } catch (parseError) {
                  const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                  console.error(`Debug - JSON parse error: ${parseErrorMessage}`);
                  console.error(`Debug - stdout received: ${stdout}`);
                  reject(new Error(`Failed to parse curl output as JSON: ${stdout}`));
                }
              });
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`Debug - Error: ${message}`);
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
          try {
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
          } catch (fetchError) {
            console.error(`Debug - Fetch API failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');

            // 如果 fetch 失败，回退到 curl 命令
            const commandParts = [
              'curl',
              '-L',
              '-X POST',
              escapeShellArg(apiEndpoint),
              '-H', escapeShellArg(`Authorization: Bearer ${api_key}`),
              '-H', escapeShellArg('Content-Type: application/json')
            ];

            if (requestBody) {
              commandParts.push('-d', escapeShellArg(requestBody));
            }

            const command = commandParts.join(' ');

            console.error(`Debug invoke_edge_function - Executing curl command: ${command}`);

            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  // 尝试解析 JSON，如果失败则返回原始文本
                  const parsedOutput = JSON.parse(stdout);
                  resolve(parsedOutput);
                } catch (parseError) {
                  // 如果不是 JSON，直接返回文本
                  resolve(stdout);
                }
              });
            });

            return {
              content: [{
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }]
            };
          }
        } catch (error) {
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
          try {
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
          } catch (fetchError) {
            console.error(`Debug - Fetch API failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
            console.error('Debug - Falling back to curl command');

            // 如果 fetch 失败，回退到 curl 命令
            const command = [
              'curl',
              '-X DELETE',
              escapeShellArg(apiEndpoint),
              '-H', escapeShellArg(`apiKey: ${api_key}`)
            ].join(' ');

            console.error(`Debug delete_edge_function - Executing curl command: ${command}`);

            const result = await new Promise((resolve, reject) => {
              exec(command, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Debug - exec error: ${error.message}`);
                  console.error(`Debug - stderr: ${stderr}`);
                  reject(new Error(`Command failed: ${stderr || error.message}`));
                  return;
                }
                if (stderr) {
                  console.warn(`Debug - stderr output: ${stderr}`);
                }
                
                try {
                  // 尝试解析 JSON，如果失败则返回成功消息
                  if (stdout.trim()) {
                    const parsedOutput = JSON.parse(stdout);
                    resolve(parsedOutput);
                  } else {
                    resolve({ message: 'Function deleted successfully' });
                  }
                } catch (parseError) {
                  // 如果不是 JSON，返回原始文本或成功消息
                  resolve(stdout.trim() || { message: 'Function deleted successfully' });
                }
              });
            });

            return {
              content: [{
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }]
            };
          }
        } catch (error) {
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