#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import packageJson from '../../package.json' with { type: 'json' };
import { createSupabaseApiPlatform } from '../platform/api-platform.js';
import { createSupabaseMcpServer } from '../server.js';
import { parseList } from './util.js';
import { validateApiKeyRequirements } from '../security/auth.js';

const { version } = packageJson;

async function main() {
  const {
    values: {
      ['access-token']: cliAccessToken,
      ['project-ref']: projectId,
      ['project-id']: aliyunProjectId,
      ['region-id']: aliyunRegionId,
      ['read-only']: readOnly,
      ['write']: writeMode,
      ['api-key']: apiKey,
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
      ['project-id']: {
        type: 'string',
      },
      ['region-id']: {
        type: 'string',
      },
      ['read-only']: {
        type: 'boolean',
        default: true,
      },
      ['write']: {
        type: 'boolean',
        default: false,
      },
      ['api-key']: {
        type: 'string',
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

  // API key validation and local-only binding enforcement
  // Per Aliyun MCP security requirements:
  //   1. MCP must default to local-only binding (stdio is inherently local)
  //   2. If opening to non-local addresses, API key MUST be configured
  const effectiveApiKey = apiKey ?? process.env.MCP_API_KEY;
  if (effectiveApiKey) {
    try {
      validateApiKeyRequirements(effectiveApiKey);
      console.error('API key validation passed. Server will require authentication for tool calls.');
    } catch (err) {
      console.error(`API key validation failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }
  // NOTE: stdio transport is inherently local (pipe between parent and child process).
  // When HTTP transport is added in the future, the following MUST be enforced:
  //   - Default bind host: 127.0.0.1 (localhost only)
  //   - If bind host is not loopback, require effectiveApiKey to be set
  //   - Example enforcement:
  //     const bindHost = options.host ?? '127.0.0.1';
  //     if (bindHost !== '127.0.0.1' && bindHost !== 'localhost') {
  //       if (!effectiveApiKey) {
  //         console.error('ERROR: API key is required when binding to non-local address.');
  //         process.exit(1);
  //       }
  //     }

  // --write flag overrides --read-only: if --write is set, readOnly is false
  const effectiveReadOnly = writeMode ? false : readOnly;

  const features = cliFeatures ? parseList(cliFeatures) : ['aliyun'];

  const hasAliyunFeature = features?.includes('aliyun');

  if (!hasAliyunFeature && !accessToken) {
    console.error(
      'Please provide a personal access token (PAT) with the --access-token flag or set the SUPABASE_ACCESS_TOKEN environment variable'
    );
    process.exit(1);
  }

  const platform = createSupabaseApiPlatform({
    accessToken: accessToken ?? '',
    aliyunAccessToken: aliyunAccessToken,
    apiUrl,
  });
  const server = createSupabaseMcpServer({
    platform,
    projectId,
    aliyunProjectId,
    aliyunRegionId,
    readOnly: effectiveReadOnly,
    features,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);