import * as path from 'path';
import winston from 'winston';
import { ORCHESTRATOR_PROMPT } from './orchestratorPrompt.js';

export class OrchestratorTool {
  constructor(private logger: winston.Logger) {}

  /**
   * Returns the orchestrator prompt and configuration for Claude to execute
   * in the main agent context (not as a subagent)
   */
  async execute(params: {
    oldTag: string;
    newTag: string;
    projectPath?: string;
  }): Promise<{ success: boolean; prompt?: string; config?: any; error?: string }> {
    try {
      const projectPath = params.projectPath || process.cwd();
      
      // Validate inputs
      if (!params.oldTag || !params.newTag) {
        return {
          success: false,
          error: 'Both oldTag and newTag are required'
        };
      }

      // Build configuration that will be injected into the prompt
      const config = {
        PROJECT_ROOT: projectPath,
        OLD_TAG: params.oldTag,
        NEW_TAG: params.newTag,
        SDK_BRANCH: params.newTag.replace('polkadot-', ''),
        STATUS_FILE: path.join(projectPath, 'output/status.json'),
        SCOUT_DIR: path.join(projectPath, 'resources/scout'),
        UPGRADE_REPORT_PATH: path.join(projectPath, `output/UPGRADE_REPORT_${params.newTag}.md`),
        TEST_REPORT_PATH: path.join(projectPath, `output/test_report_${params.newTag}.md`),
        OUTPUT_DIR: path.join(projectPath, 'output'),
        MAX_ITERATIONS: '40',
        PROMPT_DIR: path.join(projectPath, 'prompts'),
        ERROR_GROUPER_PATH: path.join(projectPath, 'scripts/error_grouper.py'),
        RESOURCES_DIR: path.join(projectPath, 'resources')
      };

      // Use the bundled orchestrator prompt
      let expandedPrompt = ORCHESTRATOR_PROMPT;
      
      // Replace variables in the prompt with actual values
      for (const [key, value] of Object.entries(config)) {
        expandedPrompt = expandedPrompt.replace(new RegExp(`\\$${key}`, 'g'), value);
        expandedPrompt = expandedPrompt.replace(new RegExp(`\\$\{${key}\}`, 'g'), value);
      }

      this.logger.info(`Prepared orchestrator for upgrade: ${params.oldTag} → ${params.newTag}`);

      // Return the prompt for Claude to execute in main context
      return {
        success: true,
        prompt: expandedPrompt,
        config: {
          instruction: `You are now the SDK Upgrade Orchestrator. Execute the FSM workflow defined above to upgrade from ${params.oldTag} to ${params.newTag}. You can spawn specialized subagents like polkadot-bug-fixer and polkadot-tests-fixer as needed during the workflow.`,
          projectPath,
          oldTag: params.oldTag,
          newTag: params.newTag
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Orchestrator tool failed:', error);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}