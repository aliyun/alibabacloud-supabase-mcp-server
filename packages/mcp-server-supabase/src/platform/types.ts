import type { InitData } from '@supabase/mcp-utils';
import { z } from 'zod';
import { AWS_REGION_CODES } from '../regions.js';

export const storageBucketSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  public: z.boolean(),
});

export const storageConfigSchema = z.object({
  fileSizeLimit: z.number(),
  features: z.object({
    imageTransformation: z.object({ enabled: z.boolean() }),
    s3Protocol: z.object({ enabled: z.boolean() }),
  }),
});

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.string().optional(),
  allowed_release_channels: z.array(z.string()),
  opt_in_tags: z.array(z.string()),
});

export const projectSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  status: z.string(),
  created_at: z.string(),
  region: z.string(),
});

export const branchSchema = z.object({
  id: z.string(),
  name: z.string(),
  project_ref: z.string(),
  parent_project_ref: z.string(),
  is_default: z.boolean(),
  git_branch: z.string().optional(),
  pr_number: z.number().optional(),
  latest_check_run_id: z.number().optional(),
  persistent: z.boolean(),
  status: z.enum([
    'CREATING_PROJECT',
    'RUNNING_MIGRATIONS',
    'MIGRATIONS_PASSED',
    'MIGRATIONS_FAILED',
    'FUNCTIONS_DEPLOYED',
    'FUNCTIONS_FAILED',
  ]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const edgeFunctionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  version: z.number(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
  verify_jwt: z.boolean().optional(),
  import_map: z.boolean().optional(),
  import_map_path: z.string().optional(),
  entrypoint_path: z.string().optional(),
  files: z.array(
    z.object({
      name: z.string(),
      content: z.string(),
    })
  ),
});

export const createProjectOptionsSchema = z.object({
  name: z.string(),
  organization_id: z.string(),
  region: z.enum(AWS_REGION_CODES).optional(),
  db_pass: z.string().optional(),
});

export const createBranchOptionsSchema = z.object({
  name: z.string(),
});

export const resetBranchOptionsSchema = z.object({
  migration_version: z.string().optional(),
});

export const deployEdgeFunctionOptionsSchema = z.object({
  name: z.string(),
  entrypoint_path: z.string(),
  import_map_path: z.string().optional(),
  files: z.array(
    z.object({
      name: z.string(),
      content: z.string(),
    })
  ),
});

export const executeSqlOptionsSchema = z.object({
  query: z.string(),
  read_only: z.boolean().optional(),
});

export const applyMigrationOptionsSchema = z.object({
  name: z.string(),
  query: z.string(),
});

export const migrationSchema = z.object({
  version: z.string(),
  name: z.string().optional(),
});

export const getLogsOptionsSchema = z.object({
  sql: z.string(),
  iso_timestamp_start: z.string().optional(),
  iso_timestamp_end: z.string().optional(),
});

export const generateTypescriptTypesResultSchema = z.object({
  types: z.string(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type EdgeFunction = z.infer<typeof edgeFunctionSchema>;

export type CreateProjectOptions = z.infer<typeof createProjectOptionsSchema>;
export type CreateBranchOptions = z.infer<typeof createBranchOptionsSchema>;
export type ResetBranchOptions = z.infer<typeof resetBranchOptionsSchema>;
export type DeployEdgeFunctionOptions = z.infer<
  typeof deployEdgeFunctionOptionsSchema
>;

export type ExecuteSqlOptions = z.infer<typeof executeSqlOptionsSchema>;
export type ApplyMigrationOptions = z.infer<typeof applyMigrationOptionsSchema>;
export type Migration = z.infer<typeof migrationSchema>;
export type ListMigrationsResult = z.infer<typeof migrationSchema>;

export type GetLogsOptions = z.infer<typeof getLogsOptionsSchema>;
export type GenerateTypescriptTypesResult = z.infer<
  typeof generateTypescriptTypesResultSchema
>;

export type StorageConfig = z.infer<typeof storageConfigSchema>;
export type StorageBucket = z.infer<typeof storageBucketSchema>;

export type ListAliyunSupabaseProjectsOptions = {
  region_id?: string;
  next_token?: string;
  max_results?: number;
};

export type AliyunSupabaseProject = {
  ProjectName: string;
  ProjectSpec: string;
  Status: string;
  PublicConnectUrl: string;
  PrivateConnectUrl: string;
  RegionId: string;
  ZoneId: string;
  VpcId: string;
  VSwitchId: string;
  SecurityIPList: string;
  DiskPerformanceLevel: string;
  Engine: string;
  EngineVersion: string;
  StorageSize: number; // long 类型在 JS/TS 中用 number
  CreateTime: string;
  DashboardUserName: string;
  ProjectId: string;
  DashboardPassword: string;
  PayType: string;
};

export type ListAliyunSupabaseProjectsResult = {
  RequestId: string;
  PageNumber: number;
  PageRecordCount: number;
  TotalRecordCount: number;
  Items: AliyunSupabaseProject[];
  NextToken?: string;
  MaxResults: number;
};

export type GetAliyunSupabaseProjectResult = {
  RequestId: string;
  Project: AliyunSupabaseProject;
};

export type GetAliyunSupabaseProjectDashboardAccountResult = {
  RequestId: string;
  ProjectName: string;
  ProjectId: string;
  DashboardPassword: string;
  DashboardUsername: string;
};

export type GetAliyunSupabaseProjectApiKeysResult = {
  RequestId: string;
  ApiKeys: Array<{
    ApiKey: string;
    Name: string;
  }>;
};

export type ModifyAliyunSupabaseProjectSecurityIpsResult = {
  RequestId: string;
};

export type ResetAliyunSupabaseProjectPasswordResult = {
  RequestId: string;
};

export type CreateAliyunSupabaseProjectResult = {
  RequestId: string;
  ProjectId: string;
};

export type DeleteAliyunSupabaseProjectResult = {
  RequestId: string;
};

export type SupabasePlatform = {
  init?(info: InitData): Promise<void>;

  // Database operations
  executeSql<T>(projectId: string, options: ExecuteSqlOptions): Promise<T[]>;
  listMigrations(projectId: string): Promise<Migration[]>;
  applyMigration(
    projectId: string,
    options: ApplyMigrationOptions
  ): Promise<void>;

  // Account
  listOrganizations(): Promise<Pick<Organization, 'id' | 'name'>[]>;
  getOrganization(organizationId: string): Promise<Organization>;
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project>;
  createProject(options: CreateProjectOptions): Promise<Project>;
  pauseProject(projectId: string): Promise<void>;
  restoreProject(projectId: string): Promise<void>;
  
  // Aliyun specific
  listAliyunSupabaseProjects(options: {
    region_id?: string;
    next_token?: string;
    max_results?: number;
  }): Promise<ListAliyunSupabaseProjectsResult>; 

  getAliyunSupabaseProject(
    options: {
      project_id: string;
      region_id?: string;
    }
  ): Promise<GetAliyunSupabaseProjectResult>;

  getAliyunSupabaseProjectDashboardAccount(
    options: {
      project_id: string;
      region_id?: string;
    }
  ): Promise<GetAliyunSupabaseProjectDashboardAccountResult>;

  getAliyunSupabaseProjectApiKeys(options: {
    project_id: string;
    region_id?: string;
  }): Promise<GetAliyunSupabaseProjectApiKeysResult>

  modifyAliyunSupabaseProjectSecurityIps(options: {
    project_id: string;
    region_id?: string;
    security_ip_list: string[];
  }): Promise<ModifyAliyunSupabaseProjectSecurityIpsResult>

  resetAliyunSupabaseProjectPassword(options: {
    project_id: string;
    region_id?: string;
    account_password: string;
  }): Promise<ResetAliyunSupabaseProjectPasswordResult>

  createAliyunSupabaseProject(options: {
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
  }): Promise<CreateAliyunSupabaseProjectResult>;

  deleteAliyunSupabaseProject(options: {
    project_id: string;
    region_id?: string;
  }): Promise<DeleteAliyunSupabaseProjectResult>;

  describeRegions(): Promise<any>;

  describeRdsVpcs(options: {
    region_id?: string;
  }): Promise<any>;

  describeRdsVSwitches(options: {
    region_id?: string;
    zone_id: string;
    vpc_id: string;
  }): Promise<any>;

  // Direct database operations via URL and API key
  executeSqlViaUrl<T>(options: {
    url: string;
    api_key: string;
    sql: string;
  }): Promise<T[]>;

  listTablesViaUrl(options: {
    url: string;
    api_key: string;
  }): Promise<Array<{ table_name: string }>>;

  // Edge functions
  listEdgeFunctions(projectId: string): Promise<EdgeFunction[]>;
  getEdgeFunction(
    projectId: string,
    functionSlug: string
  ): Promise<EdgeFunction>;
  deployEdgeFunction(
    projectId: string,
    options: DeployEdgeFunctionOptions
  ): Promise<Omit<EdgeFunction, 'files'>>;

  // Debugging
  getLogs(projectId: string, options: GetLogsOptions): Promise<unknown>;
  getSecurityAdvisors(projectId: string): Promise<unknown>;
  getPerformanceAdvisors(projectId: string): Promise<unknown>;

  // Development
  getProjectUrl(projectId: string): Promise<string>;
  getAnonKey(projectId: string): Promise<string>;
  generateTypescriptTypes(
    projectId: string
  ): Promise<GenerateTypescriptTypesResult>;

  // Branching
  listBranches(projectId: string): Promise<Branch[]>;
  createBranch(
    projectId: string,
    options: CreateBranchOptions
  ): Promise<Branch>;
  deleteBranch(branchId: string): Promise<void>;
  mergeBranch(branchId: string): Promise<void>;
  resetBranch(branchId: string, options: ResetBranchOptions): Promise<void>;
  rebaseBranch(branchId: string): Promise<void>;

  // Storage
  getStorageConfig(projectId: string): Promise<StorageConfig>;
  updateStorageConfig(projectId: string, config: StorageConfig): Promise<void>;
  listAllBuckets(projectId: string): Promise<StorageBucket[]>;
};