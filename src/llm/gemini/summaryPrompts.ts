// Gemini要約専用プロンプト

export const geminiSummaryPromptToday = `あなたはSNS投稿の要約AIです。以下の投稿一覧を読み、今日1日の気分や出来事を簡潔に日本語でまとめてください。箇条書きや記号は使わず、2〜4文程度で自然な日本語の要約を出力してください。

{posts}`;

export const geminiSummaryPromptWeek = `あなたはSNS投稿の要約AIです。以下の投稿一覧を読み、今週の気分や出来事を簡潔に日本語でまとめてください。箇条書きや記号は使わず、2〜5文程度で自然な日本語の要約を出力してください。

{posts}`; 