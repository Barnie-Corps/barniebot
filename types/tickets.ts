export interface LocalTicketConfig {
    guild_id: string;
    enabled: boolean;
    category_id: string;
    transcripts_channel_id: string | null;
    support_role_ids: string[];
    created_at: number;
    updated_at: number;
}

export interface LocalTicket {
    id: number;
    guild_id: string;
    channel_id: string;
    creator_id: string;
    opener_message_id: string | null;
    initial_message: string;
    status: string;
    created_at: number;
    closed_at: number | null;
    closed_by: string | null;
}

export interface LocalTicketCreateTexts {
    title: string;
    user: string;
    status: string;
    open: string;
    close_button: string;
    not_enabled_error?: string;
    invalid_category_error?: string;
    already_open_error?: string;
}

export interface LocalTicketCloseTexts {
    title: string;
    closed_title: string;
    closed_description: string;
    delete_button: string;
    transcript_title: string;
    transcript_description: string;
    transcript_user: string;
    transcript_messages: string;
    transcript_duration: string;
    not_found_error?: string;
    already_closed_error?: string;
    channel_not_found_error?: string;
}
