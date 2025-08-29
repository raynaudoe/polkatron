import * as path from 'path';
import * as fs from 'fs/promises';
import winston from 'winston';
import { SDK_UPGRADE_ORCHESTRATOR_PROMPT } from './orchestratorPrompt.js';

export class OrchestratorTool {
  constructor(private logger: winston.Logger) {}

  /**
   * Returns the state machine executor prompt and configuration for Claude to execute
   * in the main agent context (not as a subagent)
   */
  async execute(params: {
    oldTag: string;
    newTag: string;
    projectPath?: string;
  }): Promise<{ success: boolean; prompt?: string; config?: any; error?: string }> {
    try {
      let projectPath = params.projectPath || process.cwd();
      
      // Try to read projectPath from status.json if it exists
      if (!params.projectPath) {
        // Check common locations for status.json
        const possiblePaths = [
          path.join(process.cwd(), 'sdk-upgrade', 'output', 'status.json'),
          path.join(process.cwd(), 'output', 'status.json'),
          path.join(process.cwd(), '..', 'sdk-upgrade', 'output', 'status.json')
        ];
        
        for (const statusPath of possiblePaths) {
          try {
            const statusContent = await fs.readFile(statusPath, 'utf-8');
            const status = JSON.parse(statusContent);
            if (status.projectPath) {
              projectPath = status.projectPath;
              this.logger.info(`Found projectPath in status.json: ${projectPath}`);
              break;
            }
          } catch {
            // Continue to next path
          }
        }
      }
      
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
      let executorPrompt = SDK_UPGRADE_ORCHESTRATOR_PROMPT;
      
      // Replace variables in the prompt with actual values
      for (const [key, value] of Object.entries(config)) {
        executorPrompt = executorPrompt.replace(new RegExp(`\\$${key}`, 'g'), value);
        executorPrompt = executorPrompt.replace(new RegExp(`\\$\{${key}\}`, 'g'), value);
      }

      this.logger.info(`Prepared state machine executor for upgrade: ${params.oldTag} → ${params.newTag}`);

      // Return the prompt for Claude to execute in main context
      return {
        success: true,
        prompt: executorPrompt,
        config: {
          instruction: `You are now the SDK Upgrade State Machine Executor. Follow the workflow defined above to upgrade from ${params.oldTag} to ${params.newTag}. You will spawn the @fsm-evaluator subagent repeatedly to determine state transitions and execute the pending steps it provides.`,
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