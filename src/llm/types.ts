// --- LLMグローバル設定用インターフェース ---
export interface LLMSettings {
    gemini: {
        apiKey: string;
        model: string;
    };
    openai?: {
        apiKey: string;
        model: string;
        baseUrl: string;
    };
    // 他のLLMもここに追加可能
} 