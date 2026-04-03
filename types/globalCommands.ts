export interface GlobalCommand {
    trigger: string;
    requiresLanguage: boolean;
    defaultLanguage: string;
    content: string;
}
