import axios from "axios";
import * as vscode from "vscode";

export class AutomationService {
  private readonly baseUrl: string;

  constructor() {
    // Falls Konfiguration existiert, nutzen, sonst Default
    const config = vscode.workspace.getConfiguration("dms");
    this.baseUrl = config.get<string>(
      "automationEndpoint",
      "http://localhost:8540",
    );
  }

  /**
   * Deploy a flow definition to the automation backend.
   */
  public async deployFlow(flow: any): Promise<void> {
    try {
      // Ensure the flow object matches the backend DmsFlow schema
      // Mapping or validation might be needed here based on the editor's internal state format
      // For now, we assume the editor produces compatible JSON
      await axios.post(`${this.baseUrl}/flows`, flow);
      vscode.window.showInformationMessage(
        `Flow '${flow.name}' deployed successfully!`,
      );
    } catch (error: any) {
      console.error("Deploy failed", error);
      vscode.window.showErrorMessage(`Failed to deploy flow: ${error.message}`);
    }
  }

  /**
   * Notify the automation service about an event (e.g., ON_IMPORT).
   */
  public async notifyEvent(triggerType: string, context: any): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/execute/${triggerType}`, {
        ...context, // Should match ExecutionContext schema
      });
      console.log(`Event ${triggerType} triggered successfully.`);
    } catch (error: any) {
      console.warn(
        `Failed to trigger automation event ${triggerType}:`,
        error.message,
      );
      // We don't show an error message to the user here to avoid annoyance during normal ops if service is down
    }
  }
}
