import { describe, it, expect, beforeEach } from 'bun:test';
import { OrchestratorTool } from '../src/orchestratorTool';
import winston from 'winston';

describe('OrchestratorTool', () => {
  let orchestratorTool: OrchestratorTool;
  let logger: winston.Logger;

  beforeEach(() => {
    logger = winston.createLogger({
      level: 'error',
      transports: [new winston.transports.Console({ silent: true })]
    });
    
    orchestratorTool = new OrchestratorTool(logger);
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      const result = await orchestratorTool.execute({
        oldTag: '',
        newTag: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should accept valid parameters and return prompt', async () => {
      const result = await orchestratorTool.execute({
        oldTag: 'polkadot-stable2407',
        newTag: 'polkadot-stable2409',
        projectPath: '/test/project'
      });

      expect(result.success).toBe(true);
      expect(result.prompt).toBeDefined();
      expect(result.prompt).toContain('SDK Upgrade Orchestrator');
      expect(result.config?.oldTag).toBe('polkadot-stable2407');
      expect(result.config?.newTag).toBe('polkadot-stable2409');
    });
  });

  describe('Prompt Expansion', () => {
    it('should expand all variables in the prompt', async () => {
      const result = await orchestratorTool.execute({
        oldTag: 'polkadot-stable2407',
        newTag: 'polkadot-stable2409',
        projectPath: '/workspace/project'
      });

      expect(result.success).toBe(true);
      expect(result.prompt).not.toContain('$OLD_TAG');
      expect(result.prompt).not.toContain('$NEW_TAG');
      expect(result.prompt).not.toContain('$PROJECT_ROOT');
      expect(result.prompt).toContain('polkadot-stable2407');
      expect(result.prompt).toContain('polkadot-stable2409');
      expect(result.prompt).toContain('/workspace/project');
    });

    it('should extract SDK branch correctly', async () => {
      const result = await orchestratorTool.execute({
        oldTag: 'polkadot-stable2407',
        newTag: 'polkadot-stable2409'
      });

      expect(result.success).toBe(true);
      expect(result.prompt).toContain('stable2409');
      expect(result.prompt).not.toContain('$SDK_BRANCH');
    });

    it('should use default project path when not provided', async () => {
      const result = await orchestratorTool.execute({
        oldTag: 'v1',
        newTag: 'v2'
      });

      expect(result.success).toBe(true);
      expect(result.prompt).toBeDefined();
      // Should contain current working directory in paths
      expect(result.prompt).toContain('output/status.json');
    });
  });

  describe('Configuration', () => {
    it('should return proper instruction in config', async () => {
      const result = await orchestratorTool.execute({
        oldTag: 'old-version',
        newTag: 'new-version',
        projectPath: '/custom/path'
      });

      expect(result.success).toBe(true);
      expect(result.config?.instruction).toContain('SDK Upgrade Orchestrator');
      expect(result.config?.instruction).toContain('old-version');
      expect(result.config?.instruction).toContain('new-version');
      expect(result.config?.projectPath).toBe('/custom/path');
    });

    it('should build all required paths', async () => {
      const result = await orchestratorTool.execute({
        oldTag: 'v1',
        newTag: 'v2',
        projectPath: '/test'
      });

      expect(result.success).toBe(true);
      expect(result.prompt).toContain('/test/output/status.json');
      expect(result.prompt).toContain('/test/resources/scout');
      expect(result.prompt).toContain('/test/output/UPGRADE_REPORT_v2.md');
    });
  });
});