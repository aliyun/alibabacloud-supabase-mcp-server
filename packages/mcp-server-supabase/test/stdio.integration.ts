import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, test } from 'vitest';
import { ACCESS_TOKEN, MCP_CLIENT_NAME, MCP_CLIENT_VERSION } from './mocks.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';

type SetupOptions = {
  accessToken?: string;
  projectId?: string;
  readOnly?: boolean;
  features?: string;
};

async function setup(options: SetupOptions = {}) {
  const {
    accessToken = ACCESS_TOKEN,
    projectId,
    readOnly,
    features = 'database',
  } = options;

  const client = new Client(
    {
      name: MCP_CLIENT_NAME,
      version: MCP_CLIENT_VERSION,
    },
    {
      capabilities: {},
    }
  );

  client.setNotificationHandler(LoggingMessageNotificationSchema, (message) => {
    const { level, data } = message.params;
    if (level === 'error') {
      console.error(data);
    } else {
      console.log(data);
    }
  });

  const command = process.execPath;
  const entrypoint = fileURLToPath(
    new URL('../dist/transports/stdio.js', import.meta.url)
  );
  const args = [entrypoint, `--features=${features}`];

  if (accessToken) {
    args.push('--access-token', accessToken);
  }

  if (projectId) {
    args.push('--project-ref', projectId);
  }

  if (readOnly === false) {
    args.push('--write');
  } else if (readOnly) {
    args.push('--read-only');
  }

  const clientTransport = new StdioClientTransport({
    command,
    args,
  });

  await client.connect(clientTransport);

  return { client, clientTransport };
}

describe('stdio', () => {
  test('server connects and lists tools', async () => {
    const { client } = await setup();

    const { tools } = await client.listTools();

    expect(tools.length).toBeGreaterThan(0);
    await client.close();
  });

  test('Aliyun server exposes every tool and rejects transaction bypasses', async () => {
    const { client } = await setup({ features: 'aliyun' });

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(32);
    expect(tools.map((tool) => tool.name)).toContain('execute_sql');

    const result = await client.callTool({
      name: 'execute_sql',
      arguments: {
        url: 'https://test.supabase.co',
        api_key: 'test-api-key',
        sql: 'END; SELECT dangerous_user_function(); END',
      },
    });
    expect(JSON.stringify(result)).toContain('Transaction control statements');
    await client.close();
  });

  test('missing access token fails', async () => {
    const setupPromise = setup({ accessToken: null as any });

    await expect(setupPromise).rejects.toThrow('MCP error -32000');
  });
});
