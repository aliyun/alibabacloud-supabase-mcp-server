import GpdbClient, { CreateSupabaseProjectRequest, DeleteSupabaseProjectRequest, DescribeRdsVpcsRequest, DescribeRdsVSwitchsRequest, DescribeRegionsRequest, GetSupabaseProjectApiKeysRequest, GetSupabaseProjectDashboardAccountRequest, GetSupabaseProjectRequest, ListSupabaseProjectsRequest, ModifySupabaseProjectSecurityIpsRequest, ResetSupabaseProjectPasswordRequest } from '@alicloud/gpdb20160503';
import * as OpenApi from '@alicloud/openapi-client';
import {
  getMultipartBoundary,
  parseMultipartStream,
} from '@mjackson/multipart-parser';
import type { InitData } from '@supabase/mcp-utils';
import { relative } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import packageJson from '../../package.json' with { type: 'json' };
import { getDeploymentId, getPathPrefix } from '../edge-function.js';
import {
  assertSuccess,
  createManagementApiClient,
} from '../management-api/index.js';
import { generatePassword } from '../password.js';
import {
  getClosestAwsRegion,
  getCountryCode,
  getCountryCoordinates,
} from '../regions.js';
import {
  applyMigrationOptionsSchema,
  createBranchOptionsSchema,
  createProjectOptionsSchema,
  deployEdgeFunctionOptionsSchema,
  executeSqlOptionsSchema,
  getLogsOptionsSchema,
  resetBranchOptionsSchema,
  type ApplyMigrationOptions,
  type CreateBranchOptions,
  type CreateProjectOptions,
  type DeployEdgeFunctionOptions,
  type EdgeFunction,
  type ExecuteSqlOptions,
  type GetLogsOptions,
  type ResetBranchOptions,
  type StorageConfig,
  type StorageBucket,
  type SupabasePlatform,
  type ListAliyunSupabaseProjectsResult,
  type GetAliyunSupabaseProjectResult,
  type GetAliyunSupabaseProjectDashboardAccountResult,
  type GetAliyunSupabaseProjectApiKeysResult,
  type ModifyAliyunSupabaseProjectSecurityIpsResult,
  type ResetAliyunSupabaseProjectPasswordResult,
  type CreateAliyunSupabaseProjectResult,
  type DeleteAliyunSupabaseProjectResult,
} from './index.js';

const { version } = packageJson;

export type SupabaseApiPlatformOptions = {
  /**
   * The access token for the Supabase Management API.
   */
  accessToken: string;

  aliyunAccessToken?: string;

  /**
   * The API URL for the Supabase Management API.
   */
  apiUrl?: string;
};

/**
 * Creates a Supabase platform implementation using the Supabase Management API.
 */
export function createSupabaseApiPlatform(
  options: SupabaseApiPlatformOptions
): SupabasePlatform {
  const { accessToken, aliyunAccessToken, apiUrl } = options;

  const managementApiUrl = apiUrl ?? 'https://api.supabase.com';

  let managementApiClient = createManagementApiClient(
    managementApiUrl,
    accessToken
  );

  const createAliyunGpdbClient = (regionId: string = 'cn-hangzhou') => {
    // Check if aliyunAccessToken is provided (from ALIYUN_ACCESS_TOKEN env var)
    let accessKeyId: string | undefined;
    let accessKeySecret: string | undefined;
    let securityToken: string | undefined;
    
    if (aliyunAccessToken) {
      // Use the existing format: "AccessKeyId|AccessKeySecret"
      const parts = aliyunAccessToken.split('|');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error('Invalid Aliyun Access Token format in ALIYUN_ACCESS_TOKEN. Expected "AccessKeyId|AccessKeySecret".');
      }
      [accessKeyId, accessKeySecret] = parts;
    } else {
      // Check for the alternative environment variables
      accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
      accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
      
      // If neither method provides credentials, throw an error
      if (!accessKeyId || !accessKeySecret) {
        throw new Error(
          'Aliyun credentials not provided. Please either set ALIYUN_ACCESS_TOKEN environment variable ' +
          'with format "AccessKeyId|AccessKeySecret", set both ALIBABA_CLOUD_ACCESS_KEY_ID and ' +
          'ALIBABA_CLOUD_ACCESS_KEY_SECRET environment variables, or set ALIBABA_CLOUD_SECURITY_TOKEN ' +
          'environment variable for token-based authentication.'
        );
      }
    }
    
    securityToken = process.env.ALIBABA_CLOUD_SECURITY_TOKEN;
    
    const config = new OpenApi.Config({
      accessKeyId,
      accessKeySecret,
      securityToken,
      regionId,
    });
    config.endpoint = `gpdb.aliyuncs.com`;
    return new GpdbClient.default(config);
  };

  const platform: SupabasePlatform = {
    async init(info: InitData) {
      const { clientInfo } = info;
      if (!clientInfo) {
        throw new Error('Client info is required');
      }

      // Re-initialize the management API client with the user agent
      managementApiClient = createManagementApiClient(
        managementApiUrl,
        accessToken,
        {
          'User-Agent': `supabase-mcp/${version} (${clientInfo.name}/${clientInfo.version})`,
        }
      );
    },
    async executeSql<T>(projectId: string, options: ExecuteSqlOptions) {
      const { query, read_only } = executeSqlOptionsSchema.parse(options);

      const response = await managementApiClient.POST(
        '/v1/projects/{ref}/database/query',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
          body: {
            query,
            read_only,
          },
        }
      );

      assertSuccess(response, 'Failed to execute SQL query');

      return response.data as unknown as T[];
    },
    async listMigrations(projectId: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/database/migrations',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch migrations');

      return response.data;
    },
    async applyMigration(projectId: string, options: ApplyMigrationOptions) {
      const { name, query } = applyMigrationOptionsSchema.parse(options);

      const response = await managementApiClient.POST(
        '/v1/projects/{ref}/database/migrations',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
          body: {
            name,
            query,
          },
        }
      );

      assertSuccess(response, 'Failed to apply migration');

      // Intentionally don't return the result of the migration
      // to avoid prompt injection attacks. If the migration failed,
      // it will throw an error.
    },
    async listOrganizations() {
      const response = await managementApiClient.GET('/v1/organizations');

      assertSuccess(response, 'Failed to fetch organizations');

      return response.data;
    },
    async getOrganization(organizationId: string) {
      const response = await managementApiClient.GET(
        '/v1/organizations/{slug}',
        {
          params: {
            path: {
              slug: organizationId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch organization');

      return response.data;
    },
    async listProjects() {
      const response = await managementApiClient.GET('/v1/projects');

      assertSuccess(response, 'Failed to fetch projects');

      return response.data;
    },
    async getProject(projectId: string) {
      const response = await managementApiClient.GET('/v1/projects/{ref}', {
        params: {
          path: {
            ref: projectId,
          },
        },
      });
      assertSuccess(response, 'Failed to fetch project');
      return response.data;
    },
    async createProject(options: CreateProjectOptions) {
      const { name, organization_id, region, db_pass } =
        createProjectOptionsSchema.parse(options);

      const response = await managementApiClient.POST('/v1/projects', {
        body: {
          name,
          region: region ?? (await getClosestRegion()),
          organization_id,
          db_pass:
            db_pass ??
            generatePassword({
              length: 16,
              numbers: true,
              uppercase: true,
              lowercase: true,
            }),
        },
      });

      assertSuccess(response, 'Failed to create project');

      return response.data;
    },
    async pauseProject(projectId: string) {
      const response = await managementApiClient.POST(
        '/v1/projects/{ref}/pause',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to pause project');
    },
    async restoreProject(projectId: string) {
      const response = await managementApiClient.POST(
        '/v1/projects/{ref}/restore',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to restore project');
    },
    async listEdgeFunctions(projectId: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/functions',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch Edge Functions');

      // Fetch files for each Edge Function
      return await Promise.all(
        response.data.map(async (listedFunction) => {
          return await platform.getEdgeFunction(projectId, listedFunction.slug);
        })
      );
    },
    async getEdgeFunction(projectId: string, functionSlug: string) {
      const functionResponse = await managementApiClient.GET(
        '/v1/projects/{ref}/functions/{function_slug}',
        {
          params: {
            path: {
              ref: projectId,
              function_slug: functionSlug,
            },
          },
        }
      );

      if (functionResponse.error) {
        throw functionResponse.error;
      }

      assertSuccess(functionResponse, 'Failed to fetch Edge Function');

      const edgeFunction = functionResponse.data;

      const deploymentId = getDeploymentId(
        projectId,
        edgeFunction.id,
        edgeFunction.version
      );

      const pathPrefix = getPathPrefix(deploymentId);

      const entrypoint_path = edgeFunction.entrypoint_path
        ? relative(
            pathPrefix,
            fileURLToPath(edgeFunction.entrypoint_path, { windows: false })
          )
        : undefined;

      const import_map_path = edgeFunction.import_map_path
        ? relative(
            pathPrefix,
            fileURLToPath(edgeFunction.import_map_path, { windows: false })
          )
        : undefined;

      const bodyResponse = await managementApiClient.GET(
        '/v1/projects/{ref}/functions/{function_slug}/body',
        {
          params: {
            path: {
              ref: projectId,
              function_slug: functionSlug,
            },
          },
          headers: {
            Accept: 'multipart/form-data',
          },
          parseAs: 'stream',
        }
      );

      assertSuccess(bodyResponse, 'Failed to fetch Edge Function files');

      const contentType = bodyResponse.response.headers.get('content-type');

      if (!contentType || !contentType.startsWith('multipart/form-data')) {
        throw new Error(
          `Unexpected content type: ${contentType}. Expected multipart/form-data.`
        );
      }

      const boundary = getMultipartBoundary(contentType);

      if (!boundary) {
        throw new Error('No multipart boundary found in response headers');
      }

      if (!bodyResponse.data) {
        throw new Error('No data received from Edge Function body');
      }

      const files: EdgeFunction['files'] = [];
      const parts = parseMultipartStream(bodyResponse.data, { boundary });

      for await (const part of parts) {
        if (part.isFile && part.filename) {
          files.push({
            name: relative(pathPrefix, part.filename),
            content: part.text,
          });
        }
      }

      return {
        ...edgeFunction,
        entrypoint_path,
        import_map_path,
        files,
      };
    },
    async deployEdgeFunction(
      projectId: string,
      options: DeployEdgeFunctionOptions
    ) {
      let {
        name,
        entrypoint_path,
        import_map_path,
        files: inputFiles,
      } = deployEdgeFunctionOptionsSchema.parse(options);

      let existingEdgeFunction: EdgeFunction | undefined;
      try {
        existingEdgeFunction = await platform.getEdgeFunction(projectId, name);
      } catch (error) {}

      const import_map_file = inputFiles.find((file) =>
        ['deno.json', 'import_map.json'].includes(file.name)
      );

      // Use existing import map path or file name heuristic if not provided
      import_map_path ??=
        existingEdgeFunction?.import_map_path ?? import_map_file?.name;

      const response = await managementApiClient.POST(
        '/v1/projects/{ref}/functions/deploy',
        {
          params: {
            path: {
              ref: projectId,
            },
            query: { slug: name },
          },
          body: {
            metadata: {
              name,
              entrypoint_path,
              import_map_path,
            },
            file: inputFiles as any, // We need to pass file name and content to our serializer
          },
          bodySerializer(body) {
            const formData = new FormData();

            const blob = new Blob([JSON.stringify(body.metadata)], {
              type: 'application/json',
            });
            formData.append('metadata', blob);

            body.file?.forEach((f: any) => {
              const file: { name: string; content: string } = f;
              const blob = new Blob([file.content], {
                type: 'application/typescript',
              });
              formData.append('file', blob, file.name);
            });

            return formData;
          },
        }
      );

      assertSuccess(response, 'Failed to deploy Edge Function');

      return response.data;
    },
    async getLogs(projectId: string, options: GetLogsOptions) {
      const { sql, iso_timestamp_start, iso_timestamp_end } =
        getLogsOptionsSchema.parse(options);

      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/analytics/endpoints/logs.all',
        {
          params: {
            path: {
              ref: projectId,
            },
            query: {
              sql,
              iso_timestamp_start,
              iso_timestamp_end,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch logs');

      return response.data;
    },
    async getSecurityAdvisors(projectId: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/advisors/security',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch security advisors');

      return response.data;
    },
    async getPerformanceAdvisors(projectId: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/advisors/performance',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch performance advisors');

      return response.data;
    },
    async getProjectUrl(projectId: string): Promise<string> {
      const apiUrl = new URL(managementApiUrl);
      return `https://${projectId}.${getProjectDomain(apiUrl.hostname)}`;
    },
    async getAnonKey(projectId: string): Promise<string> {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/api-keys',
        {
          params: {
            path: {
              ref: projectId,
            },
            query: {
              reveal: false,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch API keys');

      const anonKey = response.data?.find((key) => key.name === 'anon');

      if (!anonKey?.api_key) {
        throw new Error('Anonymous key not found');
      }

      return anonKey.api_key;
    },
    async generateTypescriptTypes(projectId: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/types/typescript',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to fetch TypeScript types');

      return response.data;
    },
    async listBranches(projectId: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/branches',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
        }
      );

      // There are no branches if branching is disabled
      if (response.response.status === 422) return [];
      assertSuccess(response, 'Failed to list branches');

      return response.data;
    },
    async createBranch(projectId: string, options: CreateBranchOptions) {
      const { name } = createBranchOptionsSchema.parse(options);

      const createBranchResponse = await managementApiClient.POST(
        '/v1/projects/{ref}/branches',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
          body: {
            branch_name: name,
          },
        }
      );

      assertSuccess(createBranchResponse, 'Failed to create branch');

      return createBranchResponse.data;
    },
    async deleteBranch(branchId: string) {
      const response = await managementApiClient.DELETE(
        '/v1/branches/{branch_id}',
        {
          params: {
            path: {
              branch_id: branchId,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to delete branch');
    },
    async mergeBranch(branchId: string) {
      const response = await managementApiClient.POST(
        '/v1/branches/{branch_id}/merge',
        {
          params: {
            path: {
              branch_id: branchId,
            },
          },
          body: {},
        }
      );

      assertSuccess(response, 'Failed to merge branch');
    },
    async resetBranch(branchId: string, options: ResetBranchOptions) {
      const { migration_version } = resetBranchOptionsSchema.parse(options);

      const response = await managementApiClient.POST(
        '/v1/branches/{branch_id}/reset',
        {
          params: {
            path: {
              branch_id: branchId,
            },
          },
          body: {
            migration_version,
          },
        }
      );

      assertSuccess(response, 'Failed to reset branch');
    },
    async rebaseBranch(branchId: string) {
      const response = await managementApiClient.POST(
        '/v1/branches/{branch_id}/push',
        {
          params: {
            path: {
              branch_id: branchId,
            },
          },
          body: {},
        }
      );

      assertSuccess(response, 'Failed to rebase branch');
    },

    // Storage methods
    async listAllBuckets(project_id: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/storage/buckets',
        {
          params: {
            path: {
              ref: project_id,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to list storage buckets');

      return response.data;
    },

    async getStorageConfig(project_id: string) {
      const response = await managementApiClient.GET(
        '/v1/projects/{ref}/config/storage',
        {
          params: {
            path: {
              ref: project_id,
            },
          },
        }
      );

      assertSuccess(response, 'Failed to get storage config');

      return response.data;
    },

    async updateStorageConfig(projectId: string, config: StorageConfig) {
      const response = await managementApiClient.PATCH(
        '/v1/projects/{ref}/config/storage',
        {
          params: {
            path: {
              ref: projectId,
            },
          },
          body: {
            fileSizeLimit: config.fileSizeLimit,
            features: {
              imageTransformation: {
                enabled: config.features.imageTransformation.enabled,
              },
              s3Protocol: {
                enabled: config.features.s3Protocol.enabled,
              },
            },
          },
        }
      );

      assertSuccess(response, 'Failed to update storage config');

      return response.data;
    },
    
    async listAliyunSupabaseProjects(
      options: any
    ): Promise<ListAliyunSupabaseProjectsResult> {
      // 1. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id);

      // 2. 构造请求参数对象
      const request = new ListSupabaseProjectsRequest({
        regionId: options.region_id,
        nextToken: options.next_token,
        maxResults: options.max_results,
      });

      try {
        // 3. 调用 SDK 方法
        const response = await client.listSupabaseProjects(request);

        // 4. 返回 API 响应的主体部分
        return response.body as unknown as ListAliyunSupabaseProjectsResult;
      } catch (error: any) {
        // 增加更详细的错误日志
        console.error('Failed to call Aliyun ListSupabaseProjects API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to list Aliyun Supabase projects: ${error.data?.Message || error.message}`);
      }
    },

    async getAliyunSupabaseProject(
      options: { 
        project_id: string;
        region_id?: string;
      }
    ): Promise<GetAliyunSupabaseProjectResult> {
      // 1. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id || 'cn-hangzhou');

      // 2. 构造请求参数对象
      const request = new GetSupabaseProjectRequest({
        projectId: options.project_id,
        regionId: options.region_id,
      });

      try {
        // 3. 调用 SDK 方法
        const response = await client.getSupabaseProject(request);
        
        // 4. 返回 API 响应的主体部分
        return response.body as unknown as GetAliyunSupabaseProjectResult;
      } catch (error: any) {
        console.error('Failed to call Aliyun GetSupabaseProject API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to get Aliyun Supabase project details: ${error.data?.Message || error.message}`);
      }
    },

    async getAliyunSupabaseProjectDashboardAccount(options: {
      project_id: string;
      region_id?: string;
    }): Promise<GetAliyunSupabaseProjectDashboardAccountResult> {
      // 1. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id);

      // 2. 构造请求参数对象
      const request = new GetSupabaseProjectDashboardAccountRequest({
        projectId: options.project_id,
        regionId: options.region_id,
      });

      try {
        // 3. 调用 SDK 方法
        const response = await client.getSupabaseProjectDashboardAccount(request);

        // 4. 返回 API 响应的主体部分
        return response.body as unknown as GetAliyunSupabaseProjectDashboardAccountResult;
      } catch (error: any) {
        console.error('Failed to call Aliyun GetSupabaseProjectDashboardAccount API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to get Aliyun Supabase project dashboard account: ${error.data?.Message || error.message}`);
      }
    },

    async getAliyunSupabaseProjectApiKeys(options: {
      project_id: string;
      region_id?: string;
    }): Promise<GetAliyunSupabaseProjectApiKeysResult> {
      // 1. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id);

      // 2. 构造请求参数对象
      const request = new GetSupabaseProjectApiKeysRequest({
        projectId: options.project_id,
        regionId: options.region_id,
      });

      try {
        // 3. 调用 SDK 方法
        const response = await client.getSupabaseProjectApiKeys(request);

        // 4. 返回 API 响应的主体部分
        return response.body as unknown as GetAliyunSupabaseProjectApiKeysResult;
      } catch (error: any) {
        console.error('Failed to call Aliyun GetSupabaseProjectApiKeys API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to get Aliyun Supabase project API keys: ${error.data?.Message || error.message}`);
      }
    },

    async modifyAliyunSupabaseProjectSecurityIps(
      options: {
        project_id: string;
        region_id?: string;
        security_ip_list: string[];
      }
    ): Promise<ModifyAliyunSupabaseProjectSecurityIpsResult> {
      // 1. 验证必填参数
      if (!options.project_id) {
        throw new Error('Missing required parameter: project_id');
      }
      
      if (!options.security_ip_list) {
        throw new Error('Missing required parameter: security_ip_list');
      }

      // 2. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id || 'cn-hangzhou');

      // 3. 构造请求参数对象
      // 注意：这里需要使用正确的阿里云SDK请求类
      const request = new ModifySupabaseProjectSecurityIpsRequest({
        projectId: options.project_id,
        regionId: options.region_id,
        securityIPList: Array.isArray(options.security_ip_list)
          ? options.security_ip_list.join(',')
          : options.security_ip_list,
      });

      try {
        // 4. 调用 SDK 方法
        const response = await client.modifySupabaseProjectSecurityIps(request);
        
        // 5. 返回 API 响应的主体部分
        return response.body as unknown as ModifyAliyunSupabaseProjectSecurityIpsResult;
      } catch (error: any) {
        console.error('Failed to call Aliyun ModifySupabaseProjectSecurityIps API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to modify Aliyun Supabase project security IPs: ${error.data?.Message || error.message}`);
      }
    },

    async resetAliyunSupabaseProjectPassword(
      options: {
        project_id: string;
        region_id?: string;
        account_password: string;
      }
    ): Promise<ResetAliyunSupabaseProjectPasswordResult> {
      // 1. 验证必填参数
      if (!options.project_id) {
        throw new Error('Missing required parameter: project_id');
      }
      
      if (!options.account_password) {
        throw new Error('Missing required parameter: account_password');
      }

      // 2. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id || 'cn-hangzhou');

      // 3. 构造请求参数对象
      const request = new ResetSupabaseProjectPasswordRequest({
        projectId: options.project_id,
        regionId: options.region_id,
        accountPassword: options.account_password,
      });

      try {
        // 4. 调用 SDK 方法
        const response = await client.resetSupabaseProjectPassword(request);
        
        // 5. 返回 API 响应的主体部分
        return response.body as unknown as ResetAliyunSupabaseProjectPasswordResult;
      } catch (error: any) {
        console.error('Failed to call Aliyun ResetSupabaseProjectPassword API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to reset Aliyun Supabase project password: ${error.data?.Message || error.message}`);
      }
    },

    async createAliyunSupabaseProject(options: {
      project_name: string;
      zone_id: string;
      account_password: string;
      security_ip_list: string;
      vpc_id: string;
      v_switch_id: string;
      project_spec: string;
      region_id?: string;
      storage_size?: number;
      disk_performance_level?: string;
      client_token?: string;
    }): Promise<CreateAliyunSupabaseProjectResult> {
      // 1. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id || 'cn-hangzhou');

      // 2. 构造请求参数对象
      const request = new CreateSupabaseProjectRequest({
        projectName: options.project_name,
        zoneId: options.zone_id,
        accountPassword: options.account_password,
        securityIPList: options.security_ip_list,
        vpcId: options.vpc_id,
        vSwitchId: options.v_switch_id,
        projectSpec: options.project_spec,
        regionId: options.region_id,
        storageSize: options.storage_size,
        diskPerformanceLevel: options.disk_performance_level,
        clientToken: options.client_token,
      });

      try {
        // 3. 调用 SDK 方法
        const response = await client.createSupabaseProject(request);
        
        // 4. 返回 API 响应的主体部分
        return response.body as unknown as CreateAliyunSupabaseProjectResult;
      } catch (error: any) {
        console.error('Failed to call Aliyun CreateSupabaseProject API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to create Aliyun Supabase project: ${error.data?.Message || error.message}`);
      }
    },

    async deleteAliyunSupabaseProject(options: {
      project_id: string;
      region_id?: string;
    }): Promise<DeleteAliyunSupabaseProjectResult> {
      // 1. 验证必填参数
      if (!options.project_id) {
        throw new Error('Missing required parameter: project_id');
      }

      // 2. 创建阿里云客户端
      const client = createAliyunGpdbClient(options.region_id || 'cn-hangzhou');

      // 3. 构造请求参数对象
      const request = new DeleteSupabaseProjectRequest({
        projectId: options.project_id,
        regionId: options.region_id,
      });

      try {
        // 4. 调用 SDK 方法
        const response = await client.deleteSupabaseProject(request);
        
        // 5. 返回 API 响应的主体部分
        return response.body as unknown as DeleteAliyunSupabaseProjectResult;
      } catch (error: any) {
        console.error('Failed to call Aliyun DeleteSupabaseProject API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to delete Aliyun Supabase project: ${error.data?.Message || error.message}`);
      }
    },

    async describeRegions(): Promise<any> {
      // 创建阿里云客户端
      const client = createAliyunGpdbClient();
      
      // 构造请求参数对象
      const request = new DescribeRegionsRequest({});

      try {
        // 调用 SDK 方法
        const response = await client.describeRegions(request);
        return response.body;
      } catch (error: any) {
        console.error('Failed to call Aliyun DescribeRegions API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to describe regions: ${error.data?.Message || error.message}`);
      }
    },

    async describeRdsVpcs(options: {
      region_id?: string;
    }): Promise<any> {
      const client = createAliyunGpdbClient(options.region_id || 'cn-hangzhou');
      
      const request = new DescribeRdsVpcsRequest({
        regionId: options.region_id,
      });

      try {
        const response = await client.describeRdsVpcs(request);
        return response.body;
      } catch (error: any) {
        console.error('Failed to call Aliyun DescribeRdsVpcs API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to describe VPCs: ${error.data?.Message || error.message}`);
      }
    },

    async describeRdsVSwitches(options: {
      region_id?: string;
      zone_id: string;
      vpc_id: string;
    }): Promise<any> {
      const client = createAliyunGpdbClient(options.region_id || 'cn-hangzhou');
      
      const request = new DescribeRdsVSwitchsRequest({
        regionId: options.region_id,
        zoneId: options.zone_id,
        vpcId: options.vpc_id,
      });

      try {
        const response = await client.describeRdsVSwitchs(request);
        return response.body;
      } catch (error: any) {
        console.error('Failed to call Aliyun DescribeRdsVSwitches API:', error.message);
        console.error('Aliyun Error Data:', error.data);
        throw new Error(`Failed to describe vSwitches: ${error.data?.Message || error.message}`);
      }
    },

    async executeSqlViaUrl<T>(options: {
      url: string;
      api_key: string;
      sql: string;
    }): Promise<T[]> {
      const { url, api_key, sql } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = requestUrl + "/pg/query";
      
      // 构建请求体
      const requestBody = { query: sql };
      
      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'apikey': api_key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result as T[];
      } catch (error: any) {
        console.error('Failed to execute SQL via URL:', error.message);
        throw new Error(`Failed to execute SQL: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async listTablesViaUrl(options: {
      url: string;
      api_key: string;
    }): Promise<Array<{ table_name: string }>> {
      const { url, api_key } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = requestUrl + "/pg/query";
      
      const sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";
      
      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'apikey': api_key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: sql }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result as Array<{ table_name: string }>;
      } catch (error: any) {
        console.error('Failed to list tables via URL:', error.message);
        throw new Error(`Failed to list tables: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async listAuthUsersViaUrl(options: {
      url: string;
      api_key: string;
      page?: number;
      per_page?: number;
    }): Promise<{
      users: Array<{
        id: string;
        aud: string;
        role: string;
        email?: string;
        email_confirmed_at?: string;
        phone?: string;
        phone_confirmed_at?: string;
        confirmed_at?: string;
        last_sign_in_at?: string;
        app_metadata?: Record<string, any>;
        user_metadata?: Record<string, any>;
        identities?: Array<{
          id: string;
          user_id: string;
          identity_data: Record<string, any>;
          provider: string;
          last_sign_in_at?: string;
          created_at?: string;
          updated_at?: string;
        }>;
        created_at: string;
        updated_at: string;
      }>;
      total?: number;
    }> {
      const { url, api_key, page, per_page } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = requestUrl + "/auth/v1/admin/users";
      
      // 构建查询参数
      const queryParams = new URLSearchParams();
      if (page !== undefined) {
        queryParams.append('page', page.toString());
      }
      if (per_page !== undefined) {
        queryParams.append('per_page', per_page.toString());
      }
      
      if (queryParams.toString()) {
        requestUrl = requestUrl + "?" + queryParams.toString();
      }
      
      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        
        // Supabase Admin API 返回的格式可能是数组或对象
        if (Array.isArray(result)) {
          return {
            users: result,
            total: result.length,
          };
        } else if (result.users) {
          return result;
        } else {
          // 如果返回的是单个用户对象，包装成数组
          return {
            users: [result],
            total: 1,
          };
        }
      } catch (error: any) {
        console.error('Failed to list auth users via URL:', error.message);
        throw new Error(`Failed to list auth users: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async getAuthUserViaUrl(options: {
      url: string;
      api_key: string;
      user_id: string;
    }): Promise<{
      id: string;
      aud: string;
      role: string;
      email?: string;
      email_confirmed_at?: string;
      phone?: string;
      phone_confirmed_at?: string;
      confirmed_at?: string;
      last_sign_in_at?: string;
      app_metadata?: Record<string, any>;
      user_metadata?: Record<string, any>;
      identities?: Array<{
        id: string;
        user_id: string;
        identity_data: Record<string, any>;
        provider: string;
        last_sign_in_at?: string;
        created_at?: string;
        updated_at?: string;
      }>;
      created_at: string;
      updated_at: string;
    }> {
      const { url, api_key, user_id } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/auth/v1/admin/users/${encodeURIComponent(user_id)}`;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error('Failed to get auth user via URL:', error.message);
        throw new Error(`Failed to get auth user: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async createAuthUserViaUrl(options: {
      url: string;
      api_key: string;
      email?: string;
      phone?: string;
      password?: string;
      email_confirm?: boolean;
      phone_confirm?: boolean;
      user_metadata?: Record<string, any>;
      app_metadata?: Record<string, any>;
      ban_duration?: string;
    }): Promise<{
      id: string;
      aud: string;
      role: string;
      email?: string;
      email_confirmed_at?: string;
      phone?: string;
      phone_confirmed_at?: string;
      confirmed_at?: string;
      last_sign_in_at?: string;
      app_metadata?: Record<string, any>;
      user_metadata?: Record<string, any>;
      identities?: Array<{
        id: string;
        user_id: string;
        identity_data: Record<string, any>;
        provider: string;
        last_sign_in_at?: string;
        created_at?: string;
        updated_at?: string;
      }>;
      created_at: string;
      updated_at: string;
    }> {
      const { url, api_key, email, phone, password, email_confirm, phone_confirm, user_metadata, app_metadata, ban_duration } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/auth/v1/admin/users`;
      
      // 构建请求体
      const requestBody: Record<string, any> = {};
      if (email !== undefined) requestBody.email = email;
      if (phone !== undefined) requestBody.phone = phone;
      if (password !== undefined) requestBody.password = password;
      if (email_confirm !== undefined) requestBody.email_confirm = email_confirm;
      if (phone_confirm !== undefined) requestBody.phone_confirm = phone_confirm;
      if (user_metadata !== undefined) requestBody.user_metadata = user_metadata;
      if (app_metadata !== undefined) requestBody.app_metadata = app_metadata;
      if (ban_duration !== undefined) requestBody.ban_duration = ban_duration;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error('Failed to create auth user via URL:', error.message);
        throw new Error(`Failed to create auth user: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async deleteAuthUserViaUrl(options: {
      url: string;
      api_key: string;
      user_id: string;
    }): Promise<void> {
      const { url, api_key, user_id } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/auth/v1/admin/users/${encodeURIComponent(user_id)}`;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'DELETE',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
      } catch (error: any) {
        console.error('Failed to delete auth user via URL:', error.message);
        throw new Error(`Failed to delete auth user: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async updateAuthUserViaUrl(options: {
      url: string;
      api_key: string;
      user_id: string;
      email?: string;
      phone?: string;
      password?: string;
      email_confirm?: boolean;
      phone_confirm?: boolean;
      user_metadata?: Record<string, any>;
      app_metadata?: Record<string, any>;
      ban_duration?: string;
    }): Promise<{
      id: string;
      aud: string;
      role: string;
      email?: string;
      email_confirmed_at?: string;
      phone?: string;
      phone_confirmed_at?: string;
      confirmed_at?: string;
      last_sign_in_at?: string;
      app_metadata?: Record<string, any>;
      user_metadata?: Record<string, any>;
      identities?: Array<{
        id: string;
        user_id: string;
        identity_data: Record<string, any>;
        provider: string;
        last_sign_in_at?: string;
        created_at?: string;
        updated_at?: string;
      }>;
      created_at: string;
      updated_at: string;
    }> {
      const { url, api_key, user_id, email, phone, password, email_confirm, phone_confirm, user_metadata, app_metadata, ban_duration } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/auth/v1/admin/users/${encodeURIComponent(user_id)}`;
      
      // 构建请求体
      const requestBody: Record<string, any> = {};
      if (email !== undefined) requestBody.email = email;
      if (phone !== undefined) requestBody.phone = phone;
      if (password !== undefined) requestBody.password = password;
      if (email_confirm !== undefined) requestBody.email_confirm = email_confirm;
      if (phone_confirm !== undefined) requestBody.phone_confirm = phone_confirm;
      if (user_metadata !== undefined) requestBody.user_metadata = user_metadata;
      if (app_metadata !== undefined) requestBody.app_metadata = app_metadata;
      if (ban_duration !== undefined) requestBody.ban_duration = ban_duration;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'PUT',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error('Failed to update auth user via URL:', error.message);
        throw new Error(`Failed to update auth user: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    // Storage operations via URL and API key
    async listStorageBucketsViaUrl(options: {
      url: string;
      api_key: string;
    }): Promise<StorageBucket[]> {
      const { url, api_key } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/storage/v1/bucket`;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error('Failed to list storage buckets via URL:', error.message);
        throw new Error(`Failed to list storage buckets: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async createStorageBucketViaUrl(options: {
      url: string;
      api_key: string;
      name: string;
      public?: boolean;
      file_size_limit?: number;
      allowed_mime_types?: string[];
    }): Promise<StorageBucket> {
      const { url, api_key, name, public: isPublic, file_size_limit, allowed_mime_types } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/storage/v1/bucket`;
      
      // 构建请求体
      const requestBody: Record<string, any> = {
        name,
        id: name,
      };
      if (isPublic !== undefined) requestBody.public = isPublic;
      if (file_size_limit !== undefined) requestBody.file_size_limit = file_size_limit;
      if (allowed_mime_types !== undefined) requestBody.allowed_mime_types = allowed_mime_types;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error('Failed to create storage bucket via URL:', error.message);
        throw new Error(`Failed to create storage bucket: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async deleteStorageBucketViaUrl(options: {
      url: string;
      api_key: string;
      bucket_name: string;
    }): Promise<void> {
      const { url, api_key, bucket_name } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/storage/v1/bucket/${encodeURIComponent(bucket_name)}`;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'DELETE',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
      } catch (error: any) {
        console.error('Failed to delete storage bucket via URL:', error.message);
        throw new Error(`Failed to delete storage bucket: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async listStorageFilesViaUrl(options: {
      url: string;
      api_key: string;
      bucket_name: string;
      path?: string;
      limit?: number;
      offset?: number;
      sort_by?: {
        column?: string;
        order?: 'asc' | 'desc';
      };
    }): Promise<Array<{
      name: string;
      id: string;
      updated_at: string;
      created_at: string;
      last_accessed_at: string;
      metadata?: Record<string, any>;
    }>> {
      const { url, api_key, bucket_name, path, limit, offset, sort_by } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/storage/v1/object/list/${encodeURIComponent(bucket_name)}`;

      // Supabase Storage v1 list 接口要求 POST + JSON body
      const body: Record<string, unknown> = {
        prefix: path ?? '',
        limit: limit ?? 100,
        offset: offset ?? 0,
      };
      if (sort_by?.column) {
        body.sortBy = {
          column: sort_by.column,
          order: sort_by.order ?? 'asc',
        };
      }

      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error('Failed to list storage files via URL:', error.message);
        throw new Error(`Failed to list storage files: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async uploadStorageFileViaUrl(options: {
      url: string;
      api_key: string;
      bucket_name: string;
      file_path: string;
      file_content: string | ArrayBuffer | Blob;
      content_type?: string;
      upsert?: boolean;
    }): Promise<{
      path: string;
      id: string;
      fullPath: string;
    }> {
      const { url, api_key, bucket_name, file_path, file_content, content_type, upsert } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/storage/v1/object/${encodeURIComponent(bucket_name)}/${encodeURIComponent(file_path)}`;
      
      // 构建查询参数
      if (upsert) {
        requestUrl = requestUrl + "?upsert=true";
      }
      
      // 处理文件内容
      let body: Blob | ArrayBuffer | string;
      if (typeof file_content === 'string') {
        body = file_content;
      } else {
        body = file_content;
      }
      
      const headers: Record<string, string> = {
        'apikey': api_key,
        'Authorization': `Bearer ${api_key}`,
      };
      
      if (content_type) {
        headers['Content-Type'] = content_type;
      } else if (typeof file_content === 'string') {
        headers['Content-Type'] = 'text/plain';
      }
      
      try {
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers,
          body: body as BodyInit,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error('Failed to upload storage file via URL:', error.message);
        throw new Error(`Failed to upload storage file: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async downloadStorageFileViaUrl(options: {
      url: string;
      api_key: string;
      bucket_name: string;
      file_path: string;
    }): Promise<Blob> {
      const { url, api_key, bucket_name, file_path } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      requestUrl = `${requestUrl}/storage/v1/object/${encodeURIComponent(bucket_name)}/${encodeURIComponent(file_path)}`;
      
      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'apikey': api_key,
            'Authorization': `Bearer ${api_key}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const blob = await response.blob();
        return blob;
      } catch (error: any) {
        console.error('Failed to download storage file via URL:', error.message);
        throw new Error(`Failed to download storage file: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

    async deleteStorageFileViaUrl(options: {
      url: string;
      api_key: string;
      bucket_name: string;
      file_path: string | string[];
    }): Promise<Array<{
      name: string;
      message?: string;
    }>> {
      const { url, api_key, bucket_name, file_path } = options;
      
      // 确保 URL 有正确的协议
      let requestUrl = url;
      if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
        requestUrl = "https://" + requestUrl;
      }
      
      // 处理单个文件或多个文件
      const filePaths = Array.isArray(file_path) ? file_path : [file_path];
      
      try {
        const results = await Promise.all(
          filePaths.map(async (path) => {
            const deleteUrl = `${requestUrl}/storage/v1/object/${encodeURIComponent(bucket_name)}/${encodeURIComponent(path)}`;
            
            try {
              const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                  'apikey': api_key,
                  'Authorization': `Bearer ${api_key}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                const errorText = await response.text();
                return {
                  name: path,
                  message: `Failed to delete: ${errorText}`,
                };
              }

              return {
                name: path,
              };
            } catch (error: any) {
              // 单个 path 的 fetch 失败：内层吞掉以聚合返回，但仍输出详细日志
              console.error(`=== Fetch failure in delete_storage_file [${path}] ===`);
              console.error(`  name: ${error?.name ?? ''}`);
              console.error(`  message: ${error?.message ?? ''}`);
              const cause = (error as { cause?: unknown }).cause;
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
              }
              if (error?.stack) console.error(`  stack: ${error.stack}`);
              console.error(`  env.HTTP_PROXY: ${process.env.HTTP_PROXY ?? '(unset)'}`);
              console.error(`  env.HTTPS_PROXY: ${process.env.HTTPS_PROXY ?? '(unset)'}`);
              console.error(`  env.ALL_PROXY: ${process.env.ALL_PROXY ?? '(unset)'}`);
              console.error(`  env.NO_PROXY: ${process.env.NO_PROXY ?? '(unset)'}`);
              console.error(`  env.http_proxy: ${process.env.http_proxy ?? '(unset)'}`);
              console.error(`  env.https_proxy: ${process.env.https_proxy ?? '(unset)'}`);
              console.error(`  node.version: ${process.version}`);
              console.error(`  platform: ${process.platform}`);
              console.error(`=== End fetch failure (delete_storage_file [${path}]) ===`);
              return {
                name: path,
                message: `Error: ${error.message}`,
              };
            }
          })
        );
        
        return results;
      } catch (error: any) {
        console.error('Failed to delete storage files via URL:', error.message);
        throw new Error(`Failed to delete storage files: ${error.message}`, { cause: (error as { cause?: unknown }).cause ?? error });
      }
    },

  };

  return platform;
}

function getProjectDomain(apiHostname: string) {
  switch (apiHostname) {
    case 'api.supabase.com':
      return 'supabase.co';
    case 'api.supabase.green':
      return 'supabase.green';
    default:
      return 'supabase.red';
  }
}

async function getClosestRegion() {
  return getClosestAwsRegion(getCountryCoordinates(await getCountryCode()))
    .code;
}
