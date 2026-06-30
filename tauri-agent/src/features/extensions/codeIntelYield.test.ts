import { describe, expect, it } from 'vitest';
import { userConfiguredCodeIntel } from './codeIntelYield';

describe('userConfiguredCodeIntel', () => {
  it('detects a user-configured server named codebase-memory', () => {
    const json = '{"mcpServers":{"codebase-memory":{"command":"codebase-memory-mcp"}}}';
    expect(userConfiguredCodeIntel(json, [])).toBe(true);
  });

  it('detects a differently-named server exposing the signature tools', () => {
    expect(userConfiguredCodeIntel('{"mcpServers":{"my-cbm":{"command":"x"}}}', ['search_graph', 'trace_path'])).toBe(
      true,
    );
  });

  it('accepts the cached full tool-name form (mcp__server__tool)', () => {
    expect(
      userConfiguredCodeIntel('{"mcpServers":{"my-cbm":{"command":"x"}}}', [
        'mcp__my_cbm__search_graph',
        'mcp__my_cbm__trace_path',
      ]),
    ).toBe(true);
  });

  it('requires BOTH signature tools, not just one', () => {
    expect(userConfiguredCodeIntel('{"mcpServers":{"fs":{"command":"npx"}}}', ['search_graph'])).toBe(false);
  });

  it('returns false when neither name nor tool signature matches', () => {
    expect(userConfiguredCodeIntel('{"mcpServers":{"fs":{"command":"npx"}}}', ['read_file'])).toBe(false);
  });

  it('tolerates empty / invalid JSON', () => {
    expect(userConfiguredCodeIntel('', [])).toBe(false);
    expect(userConfiguredCodeIntel('not json', [])).toBe(false);
    expect(userConfiguredCodeIntel('{}', [])).toBe(false);
  });

  it('accepts a bare map without the mcpServers wrapper', () => {
    expect(userConfiguredCodeIntel('{"codebase-memory":{"command":"x"}}', [])).toBe(true);
  });
});
