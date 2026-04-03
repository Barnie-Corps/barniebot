export interface FilterSetupState {
    step: number;
    values: { enabled: boolean; logs_enabled: boolean; logs_channel: string; lang: string };
    messageId: string;
    guildId: string;
    userId: string;
    createdAt: number;
    awaitingChannelMention?: boolean;
}
