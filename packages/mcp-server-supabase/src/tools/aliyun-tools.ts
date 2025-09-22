import type { SupabasePlatform } from '../platform/types.js';
import { type Tool, tool } from '@supabase/mcp-utils';
import { z } from 'zod';
import { exec } from 'child_process';

export type AliyunToolsOptions = {
  platform: SupabasePlatform;
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

export async function getAliyunTools({ platform }: AliyunToolsOptions): Promise<Record<string, Tool>> {
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
            
            const jsonData = JSON.stringify({ query: sql });

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
      description: 'Lists all tables in the public schema of a Supabase project database. First tries to use TypeScript interface, falls back to curl command if needed. Requires the project\'s PublicConnectUrl as url and serviceRoleKey as api_key obtained from other tools.',
      parameters: z.object({
        url: z.string().describe('PublicConnectUrl for the Supabase project'),
        api_key: z.string().describe('serviceRoleKey for authentication'),
      }),
      execute: async ({ url, api_key }) => {
        try {
          // 首先尝试使用 TypeScript 接口 (fetch)
          try {
            console.error('Debug - Attempting to list tables via TypeScript interface');
            const result = await platform.listTablesViaUrl({ url, api_key });
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
            
            const sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";
            const jsonData = JSON.stringify({ query: sql });

            // 2. 安全地构建 curl 命令
            const command = [
              'curl',
              '-X POST',
              escapeShellArg(requestUrl),
              '-H', escapeShellArg(`apikey: ${api_key}`),
              '-H', escapeShellArg('Content-Type: application/json'),
              '-d', escapeShellArg(jsonData)
            ].join(' ');

            console.error(`Debug list_table - Executing curl command: ${command}`);

            // 3. 执行命令并等待结果
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

  };
}