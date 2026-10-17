// Context Health Bar types
export interface ModelConfig {
  maxTokens: number;
  threshold?: { red: number; yellow: number };
}

// Session state structure
export interface ContextHealthBarState {
  currentTokens: number;
  maxTokens: number;
  currentModel: string;
  sessionStartTokens: number;
}
