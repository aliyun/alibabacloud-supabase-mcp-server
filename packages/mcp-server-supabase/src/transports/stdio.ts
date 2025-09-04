#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import packageJson from '../../package.json' with { type: 'json' };
import { createSupabaseApiPlatform } from '../platform/api-platform.js';
import { createSupabaseMcpServer } from '../server.js';
import { parseList } from './util.js';

const { version } = packageJson;

async function main() {
  const {
    values: {
      ['access-token']: cliAccessToken,
      ['project-ref']: projectId,
      ['read-only']: readOnly,
      ['api-url']: apiUrl,
      ['version']: showVersion,
      ['features']: cliFeatures,
    },
  } = parseArgs({
    options: {
      ['access-token']: {
        type: 'string',
      },
      ['project-ref']: {
        type: 'string',
      },
      ['read-only']: {
        type: 'boolean',
        default: false,
      },
      ['api-url']: {
        type: 'string',
      },
      ['version']: {
        type: 'boolean',
      },
      ['features']: {
        type: 'string',
      },
    },
  });

  if (showVersion) {
    console.log(version);
    process.exit(0);
  }

  const accessToken = cliAccessToken ?? process.env.SUPABASE_ACCESS_TOKEN;

  const aliyunAccessToken = process.env.ALIYUN_ACCESS_TOKEN;

  const features = cliFeatures ? parseList(cliFeatures) : ['aliyun'];

  const hasAliyunFeature = features?.includes('aliyun');

  if (!hasAliyunFeature && !accessToken) {
    console.error(
      'Please provide a personal access token (PAT) with the --access-token flag or set the SUPABASE_ACCESS_TOKEN environment variable'
    );
    process.exit(1);
  }

  // 增加日志来确认代码执行到了这里
  console.error('DEBUG: Initializing platform...');

  const platform = createSupabaseApiPlatform({
    accessToken: "accessToken",
    aliyunAccessToken: aliyunAccessToken,
    apiUrl,
  });
  
  // 增加日志
  console.error('DEBUG: Platform initialized. Creating MCP server...');

  const server = createSupabaseMcpServer({
    platform,
    projectId,
    readOnly,
    features,
  });
  
  // 增加日志
  console.error('DEBUG: MCP server created. Connecting transport...');

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // 增加日志
  console.error('DEBUG: Transport connected successfully.');
}

main().catch(console.error);